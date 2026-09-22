/**
 * The plugin records each newly completed milestone todo and each completed
 * goal as a DECISIONS.md register row carrying the architecture diagram's
 * updated, stale, or absent flag, and records nothing for subagent sessions.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { diagramFingerprint, diagramSource } from '@deepseek-ai/dsh-util-project-register'
import * as ProjectRegister from '../src/index.ts'
import { scratchDir, settleRows, todo } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  vi.restoreAllMocks()
})

async function boot(config: Partial<ProjectRegister.Config> = {}) {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(LocalFileSystem)
  const fiber = await ctx.plugin(ProjectRegister, config as ProjectRegister.Config)
  return { ctx, fiber }
}

const date = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string

describe('project-register', () => {
  it('records each newly completed milestone with its diagram flag', async () => {
    const cwd = await scratchDir('dsh-project-register-', cleanups)
    const { ctx } = await boot()
    const session = ctx.sessions.create(SessionId('t1'), { meta: { cwd } })
    session.append('todo/write', { todos: [todo('milestone: Land core', 'in_progress')] })
    session.append('todo/write', { todos: [todo('milestone: Land core', 'completed')] })
    const [first] = await settleRows(cwd, 'Land core')
    expect(first).toEqual({
      id: 'M1', date, kind: 'milestone', title: 'Land core', status: 'done',
      diagram: { flag: 'absent', fingerprint: null },
    })

    await writeFile(join(cwd, 'ARCHITECTURE.md'), '# Architecture\n\n```mermaid\nflowchart LR\n  A --> B\n```\n')
    session.append('todo/write', {
      todos: [todo('milestone: Land core', 'completed'), todo('milestone: Wire diagram', 'in_progress')],
    })
    session.append('todo/write', {
      todos: [todo('milestone: Land core', 'completed'), todo('milestone: Wire diagram', 'completed')],
    })
    const source = diagramSource(await readFile(join(cwd, 'ARCHITECTURE.md'), 'utf8'))
    const fingerprint = diagramFingerprint(source!)
    const [, second] = await settleRows(cwd, 'Wire diagram')
    expect(second).toEqual({
      id: 'M2', date, kind: 'milestone', title: 'Wire diagram', status: 'done',
      diagram: { flag: 'updated', fingerprint },
    })

    // A milestone absent from the previous list still records; an unchanged diagram reads as stale.
    session.append('todo/write', {
      todos: [
        todo('milestone: Land core', 'completed'),
        todo('milestone: Wire diagram', 'completed'),
        todo('milestone: Ship v1', 'completed'),
      ],
    })
    const rows = await settleRows(cwd, 'Ship v1')
    expect(rows.map(row => [row.id, row.title, row.diagram?.flag ?? null]))
      .toEqual([['M1', 'Land core', 'absent'], ['M2', 'Wire diagram', 'updated'], ['M3', 'Ship v1', 'stale']])
    expect(rows[2]!.diagram).toEqual({ flag: 'stale', fingerprint })
    const text = await readFile(join(cwd, 'DECISIONS.md'), 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
  })

  it('records a completed goal and nothing for a repeated completed milestone', async () => {
    const cwd = await scratchDir('dsh-project-register-goal-', cleanups)
    const { ctx } = await boot()
    const session = ctx.sessions.create(SessionId('goal'), { meta: { cwd } })
    const done = [todo('milestone: Prepare', 'completed'), todo('milestone: Ship v1', 'completed')]
    // The first observed list records nothing; 'Ship v1' completes against it.
    session.append('todo/write', { todos: [todo('milestone: Prepare', 'completed'), todo('milestone: Ship v1', 'in_progress')] })
    session.append('todo/write', { todos: done })
    await settleRows(cwd, 'Ship v1')
    // A second write repeating the same completed milestone records nothing.
    session.append('todo/write', { todos: done })
    ctx.emit('goal/changed', {
      agent: { session },
      change: { operation: 'create', ref: { id: 'goal-1', revision: 1 }, goal: { objective: 'Not a completion' } },
    } as never)
    ctx.emit('goal/changed', {
      agent: { session },
      change: { operation: 'complete', ref: { id: 'goal-1', revision: 2 }, goal: { objective: 'Ship v1.0 to prod' } },
    } as never)
    const rows = await settleRows(cwd, 'Ship v1.0 to prod')
    expect(rows.map(row => [row.id, row.title, row.diagram?.flag ?? null]))
      .toEqual([['M1', 'Ship v1', 'absent'], ['M2', 'Ship v1.0 to prod', 'absent']])
  })

  it('records nothing for subagent, delegated, or working-directory-less sessions', async () => {
    const cwd = await scratchDir('dsh-project-register-skip-', cleanups)
    const { ctx } = await boot()
    const ineligible = [
      ctx.sessions.create(SessionId('child'), { meta: { cwd, delegationDepth: 1 } }),
      ctx.sessions.create(SessionId('origin'), { meta: { cwd, origin: 'subagent' } }),
      ctx.sessions.create(SessionId('nowhere')),
    ]
    for (const session of ineligible) {
      session.append('todo/write', { todos: [todo('milestone: Quiet', 'in_progress')] })
      session.append('todo/write', { todos: [todo('milestone: Quiet', 'completed')] })
    }
    const top = ctx.sessions.create(SessionId('top'), { meta: { cwd } })
    top.append('todo/write', { todos: [todo('milestone: Loud', 'in_progress')] })
    top.append('todo/write', { todos: [todo('milestone: Loud', 'completed')] })
    const rows = await settleRows(cwd, 'Loud')
    expect(rows.map(row => row.title)).toEqual(['Loud'])
  })

  it('honors a configured milestoneMarker', async () => {
    const cwd = await scratchDir('dsh-project-register-marker-', cleanups)
    const { ctx } = await boot({ milestoneMarker: '@done' })
    const session = ctx.sessions.create(SessionId('marker'), { meta: { cwd } })
    session.append('todo/write', { todos: [todo('milestone: Ignored', 'in_progress'), todo('@done Renovate', 'in_progress')] })
    session.append('todo/write', { todos: [todo('milestone: Ignored', 'completed'), todo('@done Renovate', 'completed')] })
    const rows = await settleRows(cwd, 'Renovate')
    expect(rows.map(row => row.title)).toEqual(['Renovate'])
  })

  it('warns and drops a milestone when the register cannot be written', async () => {
    const cwd = await scratchDir('dsh-project-register-warn-', cleanups)
    await mkdir(join(cwd, 'DECISIONS.md'))
    const { ctx } = await boot()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    const session = ctx.sessions.create(SessionId('warn'), { meta: { cwd } })
    session.append('todo/write', { todos: [todo('milestone: Blocked', 'in_progress')] })
    session.append('todo/write', { todos: [todo('milestone: Blocked', 'completed')] })
    await vi.waitFor(() => {
      const own = warn.mock.calls.map(call => String(call[0])).filter(message => message.startsWith('project-register:'))
      expect(own).toHaveLength(1)
    })
  })

  it('names a non-Error write failure in its warning', async () => {
    const cwd = await scratchDir('dsh-project-register-string-', cleanups)
    const { ctx } = await boot()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    vi.spyOn(ctx.fs, 'writeText').mockRejectedValue('read-only')
    const session = ctx.sessions.create(SessionId('string'), { meta: { cwd } })
    session.append('todo/write', { todos: [todo('milestone: Stringy', 'in_progress')] })
    session.append('todo/write', { todos: [todo('milestone: Stringy', 'completed')] })
    await vi.waitFor(() => {
      const own = warn.mock.calls.map(call => String(call[0])).filter(message => message.startsWith('project-register:'))
      expect(own).toEqual([expect.stringContaining('read-only')])
    })
  })

  it('ignores other session events and whitespace goal objectives', async () => {
    const cwd = await scratchDir('dsh-project-register-skip2-', cleanups)
    const { ctx } = await boot()
    const session = ctx.sessions.create(SessionId('skip2'), { meta: { cwd } })
    session.append('turn/start', { turn: 1 })
    ctx.emit('goal/changed', {
      agent: { session },
      change: { operation: 'complete', ref: { id: 'goal-2', revision: 1 }, goal: { objective: '   ' } },
    } as never)
    session.append('todo/write', { todos: [todo('milestone: Late', 'in_progress')] })
    session.append('todo/write', { todos: [todo('milestone: Late', 'completed')] })
    const rows = await settleRows(cwd, 'Late')
    expect(rows.map(row => row.title)).toEqual(['Late'])
  })

  it('rejects an empty milestoneMarker at load', async () => {
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalFileSystem)
    await expect(ctx.plugin(ProjectRegister, { milestoneMarker: '' } as ProjectRegister.Config)).rejects.toThrow('milestoneMarker')
    await expect(ctx.plugin(ProjectRegister, { milestoneMarker: '   ' } as ProjectRegister.Config)).rejects.toThrow('milestoneMarker')
  })
})
