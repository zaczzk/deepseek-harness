import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as commandEnhance from '@deepseek-ai/dsh-command-enhance'

interface Harness {
  readonly ctx: Context
  readonly agent: Agent
  readonly plugin: Awaited<ReturnType<Context['plugin']>>
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  void context
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Observe plugin-mount failure without formatting a Cordis proxy in a diff. */
async function mountOutcome(ctx: Context, enhanceFile: string): Promise<string> {
  return ctx.plugin(commandEnhance, { enhanceFile, onMissing: 'fail' })
    .then(() => 'mounted', (error: unknown) => (error instanceof Error ? error.message : String(error)))
}

/** Mount the command stack so the plugin's `commands` injection is satisfiable. */
async function loadContext(): Promise<Context> {
  const ctx = new Context()
  context = ctx
  await ctx.plugin(SessionStore)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(AgentRegistry)
  return ctx
}

/** Valid rubric document written to the harness's enhance.yml. */
const ENHANCE_YAML = [
  'principles:',
  '  - id: modularity',
  '    text: Prefer modular components.',
  '  - id: minimal-tech-debt',
  '    text: Prefer maintained dependencies over hand-rolling.',
  'skipPatterns:',
  '  - "^ping$"',
  'limits:',
  '  minDraftCharacters: 10',
  '  foldBelowCharacters: 30',
  '  splitAboveCharacters: 200',
  '  maxExamples: 2',
  'depths:',
  '  task: [objective, acceptance]',
  '  spec: [objective, context, constraints, acceptance, verification]',
  '  bundle: [objective, context, constraints, acceptance, verification, goal, todos]',
  'defaultDepth: spec',
  'outputLanguage: auto',
  '',
].join('\n')

/** Write the rubric file and mount the real command registry and plugin. */
async function harness(enhanceYaml: string = ENHANCE_YAML): Promise<Harness> {
  root = await mkdtemp(join(tmpdir(), 'dsh-command-enhance-'))
  const enhanceFile = join(root, 'enhance.yml')
  await writeFile(enhanceFile, enhanceYaml)
  const ctx = await loadContext()
  const plugin = await ctx.plugin(commandEnhance, { enhanceFile, onMissing: 'fail' })
  const session = ctx.sessions.create(SessionId(`enhance-${Math.random()}`))
  let status: AgentStatus = 'idle'
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox: createInboxStub(),
    ctx: new Context(),
    get status() { return status },
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject() {},
    cancel() { status = 'idle' },
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(agent)
  return { ctx, agent, plugin }
}

/** Execute one `/enhance` line through the registry boundary. */
async function run(test: Harness, line: string): Promise<CommandResult> {
  const execution = await test.ctx.commands.execute(test.agent, `/enhance ${line}`, [], new AbortController().signal)
  if (execution === undefined) throw new Error('enhance command was not registered')
  return execution.result
}

describe('/enhance rubric loading', () => {
  it('fails loud on a missing rubric file', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-enhance-'))
    const ctx = await loadContext()
    const outcome = await mountOutcome(ctx, join(root, 'absent.yml'))
    expect(outcome).toMatch(/failed to load .*absent\.yml/u)
  })

  it('fails loud on invalid YAML', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-enhance-'))
    const enhanceFile = join(root, 'enhance.yml')
    await writeFile(enhanceFile, 'principles: [')
    const ctx = await loadContext()
    const outcome = await mountOutcome(ctx, enhanceFile)
    expect(outcome).toMatch(/failed to load/u)
  })

  it('fails loud on a violated rule, naming the violation', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-command-enhance-'))
    const enhanceFile = join(root, 'enhance.yml')
    await writeFile(enhanceFile, 'principles: []\ndefaultDepth: spec\n')
    const ctx = await loadContext()
    const outcome = await mountOutcome(ctx, enhanceFile)
    expect(outcome).toMatch(/principles: must be a non-empty array/u)
  })
})

describe('/enhance human command', () => {
  it('rejects an empty line with usage naming every declared depth', async () => {
    const test = await harness()
    await expect(run(test, '   ')).resolves.toEqual({
      kind: 'error',
      text: 'Usage: /enhance [<depth>] <draft> (depths: task, spec, bundle)',
    })
  })

  it('structures a draft at the default depth and sends nothing to the model', async () => {
    const test = await harness()
    const result = await run(test, 'Add a settings page with save and cancel buttons. Keep it accessible for keyboard users')
    expect(result.kind).toBe('success')
    expect(result.text).toContain('Objective:\nAdd a settings page with save and cancel buttons. Keep it accessible for keyboard users')
    expect(result.text).toContain('Constraints:\n- [principle:modularity] Prefer modular components.')
    expect(result.text).toContain('Verification:\n- Confirm every acceptance criterion is satisfied before reporting completion.')
    expect(result.text).not.toContain('Goal:')
    expect(test.agent.session.deriveMessages()).toEqual([])
  })

  it('honors a bracketed depth and treats undeclared brackets as draft text', async () => {
    const test = await harness()
    const task = await run(test, '[task] Add a settings page with save and cancel buttons')
    expect(task.kind).toBe('success')
    expect(task.text).toContain('Objective:')
    expect(task.text).not.toContain('Goal:')
    const literal = await run(test, '[wip] fix the build pipeline right away')
    expect(literal.kind).toBe('success')
    expect(literal.text).toContain('Objective:\n[wip] fix the build pipeline right away')
  })

  it('prefixes one advisory line for every non-default route', async () => {
    const test = await harness()
    const skip = await run(test, 'ping')
    expect(skip.kind).toBe('success')
    expect(skip.text).toContain('Route: skip (skip-pattern:^ping$) — this draft may already be clear; review the structured form below.')
    const fold = await run(test, 'fold this small request in')
    expect(fold.text).toContain('Route: fold (fold-below-characters) — consider folding this into the current goal instead of starting new work.')
    const split = await run(test, `build ${'extensive '.repeat(22)}now`)
    expect(split.text).toContain('Route: split (split-above-characters) — consider splitting this draft into separate tasks.')
    const plain = await run(test, 'build the settings page with proper structure now')
    expect(plain.text).not.toContain('Route:')
  })
})

describe('@deepseek-ai/dsh-command-enhance registration', () => {
  it('registers one global command with Loader-safe exports and disposes it', async () => {
    const test = await harness()
    expect(commandEnhance.name).toBe('command-enhance')
    expect(commandEnhance.inject).toEqual(['commands'])
    expect('default' in commandEnhance).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(commandEnhance)).toBe(commandEnhance)

    expect(test.ctx.commands.list(test.agent)).toContainEqual({
      definitionId: '@deepseek-ai/dsh-command-enhance',
      name: 'enhance',
      description: 'Structure a draft into a task, goal, and todo list',
      input: { hint: '[<depth>] <draft>' },
    })

    await test.plugin.dispose()
    expect(test.ctx.commands.find(test.agent, 'enhance')).toBeUndefined()
  })
})

describe('/enhance failure propagation', () => {
  it('does not convert unexpected implementation failures into command errors', async () => {
    const test = await harness()
    const registered = test.ctx.commands.find(test.agent, 'enhance')
    if (registered === undefined) throw new Error('enhance command was not registered')
    await test.plugin.dispose()
    test.ctx.commands.register({ ...registered, handler: () => { throw new Error('unexpected failure') } })
    await expect(run(test, 'build the settings page with proper structure now')).rejects.toThrow('unexpected failure')
  })
})
