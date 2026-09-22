/**
 * REAL-composition proof: the test-only YAML rows (session store, local
 * filesystem, project-register) boot through the vendored Loader and its
 * include builtin, and one milestone ends with its recorded DECISIONS.md row.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import * as ProjectRegister from '../src/index.ts'
import { settleRows, todo } from './support.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('real Loader composition', () => {
  it('loads the composed rows and records a milestone', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-project-register-loader-'))
    const cwd = join(root, 'ws')
    await mkdir(cwd)
    await writeFile(join(root, 'cordis.yml'), [
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-fs-local'",
      "- name: '@deepseek-ai/dsh-project-register'",
      '',
    ].join('\n'))
    context = new Context()
    context.baseUrl = `${pathToFileURL(root).href}/`
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
      ['@deepseek-ai/dsh-project-register', ProjectRegister],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(root, 'cordis.yml')).href } })
    await context.loader.await()
    const unloaded = [...context.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const session = context.sessions.create(SessionId('composed'), { meta: { cwd } })
    session.append('todo/write', { todos: [todo('milestone: Composed', 'in_progress')] })
    session.append('todo/write', { todos: [todo('milestone: Composed', 'completed')] })
    const rows = await settleRows(cwd, 'Composed')
    expect(rows.map(row => [row.id, row.kind, row.title, row.status, row.diagram?.flag ?? null]))
      .toEqual([['M1', 'milestone', 'Composed', 'done', 'absent']])
  })
})
