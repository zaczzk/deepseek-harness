import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import * as commandEnhance from '@deepseek-ai/dsh-command-enhance'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
})

/** Register one idle agent over a store-owned session, as an app's spine does. */
async function agent(ctx: Context): Promise<Agent> {
  const scope = ctx.plugin(() => {})
  const id = SessionId('enhance-loader-agent')
  const session = ctx.sessions.create(id)
  let status: AgentStatus = 'idle'
  const value: Agent = {
    id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    ctx: scope.ctx,
    get status() { return status },
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel() { status = 'idle' },
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(value)
  return value
}

describe('/enhance real Loader composition through cordis.yml', () => {
  it('boots cordis.yml and structures a draft without model-visible output', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-enhance-loader-'))
    vi.stubEnv('DSH_HOME', root)
    const enhanceFile = join(root, 'enhance.yml').replaceAll('\\', '/')
    await writeFile(join(root, 'enhance.yml'), [
      'principles:',
      '  - id: modularity',
      '    text: Prefer modular components.',
      'skipPatterns: []',
      'limits:',
      '  minDraftCharacters: 10',
      '  foldBelowCharacters: 30',
      '  splitAboveCharacters: 200',
      '  maxExamples: 2',
      'depths:',
      '  spec: [objective, context, constraints, acceptance, verification]',
      'defaultDepth: spec',
      'outputLanguage: auto',
      '',
    ].join('\n'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-agent'",
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-commands'",
      "- name: '@deepseek-ai/dsh-command-enhance'",
      '  config:',
      `    enhanceFile: '${enhanceFile}'`,
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-agent', AgentRegistry],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-commands', CommandRuntime],
      ['@deepseek-ai/dsh-command-enhance', commandEnhance],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const owner = await agent(context)
    const signal = new AbortController().signal

    // Discoverable through the composed registry, as a UI adapter finds it.
    expect(context.commands.list(owner).map(command => command.name)).toContain('enhance')

    const executed = await context.commands.execute(
      owner,
      '/enhance Add a settings page with save and cancel buttons.',
      [],
      signal,
    )
    expect(executed?.result).toEqual({
      kind: 'success',
      text: [
        'Objective:',
        'Add a settings page with save and cancel buttons.',
        '',
        'Constraints:',
        '- [principle:modularity] Prefer modular components.',
        '',
        'Acceptance criteria:',
        '- [ ] Add a settings page with save and cancel buttons.',
        '',
        'Verification:',
        '- Confirm every acceptance criterion is satisfied before reporting completion.',
      ].join('\n'),
    })
    const rejected = await context.commands.execute(owner, '/enhance', [], signal)
    expect(rejected?.result.kind).toBe('error')

    // Command lifecycle bookkeeping only: the draft is user text and the
    // handler runs no model request.
    expect(owner.session.snapshotEvents().map(event => event.type))
      .toEqual(['command/run', 'command/done', 'command/run', 'command/done'])
    const run = owner.session.snapshotEvents().find(event => event.type === 'command/run')
    expect(run?.type === 'command/run' && run.data.args).toBe(' Add a settings page with save and cancel buttons.')

    // Nothing reached the model.
    expect(owner.session.deriveMessages()).toEqual([])
    expect(owner.session.surface.nodes).toEqual([])
  })
})
