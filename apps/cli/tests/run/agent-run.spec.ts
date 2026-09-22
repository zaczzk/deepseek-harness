import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveExecArgv, runAgentChild } from '../../src/run/agent-run.ts'

const FAKE_AGENT = fileURLToPath(new URL('./fixtures/fake-agent.mjs', import.meta.url))
const launcher = { execPath: process.execPath, argsPrefix: [FAKE_AGENT] }
const directories: string[] = []

function cwd(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-run-agent-'))
  directories.push(dir)
  return dir
}

afterEach(() => {
  vi.unstubAllEnvs()
  while (directories.length > 0) rmSync(directories.pop() as string, { recursive: true, force: true })
})

describe('resolveExecArgv', () => {
  it('makes bare loader hooks cwd-independent and passes everything else through', () => {
    const [flag, resolved] = resolveExecArgv(['--import', 'tsx/esm'])
    expect(flag).toBe('--import')
    expect(resolved).not.toBe('tsx/esm')
    expect(resolved).toContain('tsx')
    expect(resolveExecArgv(['--no-warnings', '--import', './local.mjs', '--inspect']))
      .toEqual(['--no-warnings', '--import', './local.mjs', '--inspect'])
    expect(resolveExecArgv(['--import', 'file:///c:/fixed/hook.mjs']))
      .toEqual(['--import', 'file:///c:/fixed/hook.mjs'])
    expect(resolveExecArgv(['--import'])).toEqual(['--import'])
  })
})

describe('runAgentChild', () => {
  it('folds session identity, turns, usage, and the answer from the stream', async () => {
    vi.stubEnv('FAKE_AGENT_MODE', 'two-steps')
    vi.stubEnv('FAKE_SESSION_ID', 'session-two')
    const forwarded: Record<string, unknown>[] = []
    const summary = await runAgentChild({
      cwd: cwd(), task: 'hello', sessionId: undefined, patches: [], timeoutMs: undefined,
      launcher, onEvent: (line) => { forwarded.push(line) },
    })
    expect(summary.sessionId).toBe('session-two')
    expect(summary.turns).toBe(2)
    expect(summary.answer).toBe('answer: hello')
    expect(summary.usage).toEqual({
      input_tokens: 10, output_tokens: 5,
      reasoning_tokens: 2, cache_read_tokens: 0, cache_write_tokens: 0, total_tokens: 15,
    })
    expect(summary.usageComplete).toBe(true)
    expect(summary.exitCode).toBe(0)
    expect(forwarded.map(line => line.type)).toContain('session')
  })

  it('marks usage incomplete when a step reports none', async () => {
    vi.stubEnv('FAKE_AGENT_MODE', 'no-usage')
    const summary = await runAgentChild({
      cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: undefined, launcher,
    })
    expect(summary.usage).toBeNull()
    expect(summary.usageComplete).toBe(false)
  })

  it('keeps optional buckets null when any sample omits them', async () => {
    vi.stubEnv('FAKE_AGENT_MODE', 'partial-usage')
    const summary = await runAgentChild({
      cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: undefined, launcher,
    })
    expect(summary.usage).toEqual({
      input_tokens: 6, output_tokens: 2,
      reasoning_tokens: null, cache_read_tokens: null, cache_write_tokens: null, total_tokens: null,
    })
    expect(summary.usageComplete).toBe(true)
  })

  it('reports in-turn failures and stream-level failures apart', async () => {
    vi.stubEnv('FAKE_AGENT_MODE', 'turn-error')
    const turn = await runAgentChild({
      cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: undefined, launcher,
    })
    expect(turn.turnEnd).toEqual({ kind: 'error', code: 'FAKE_TOOL_FAILURE', message: 'the fake tool failed' })
    expect(turn.streamError).toBeNull()
    expect(turn.exitCode).toBe(1)

    vi.stubEnv('FAKE_AGENT_MODE', 'stream-error')
    const stream = await runAgentChild({
      cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: undefined, launcher,
    })
    expect(stream.streamError).toBe('fake agent could not start')
    expect(stream.sessionId).toBe('session-fake')
  })

  it('kills a child that exceeds the wall-clock bound', async () => {
    vi.stubEnv('FAKE_AGENT_MODE', 'slow')
    const summary = await runAgentChild({
      cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: 300, launcher,
    })
    expect(summary.timedOut).toBe(true)
    expect(summary.signalAborted).toBe(false)
  }, 20_000)

  it('kills the child when the caller\'s signal aborts', async () => {
    vi.stubEnv('FAKE_AGENT_MODE', 'slow')
    const controller = new AbortController()
    const running = runAgentChild({
      cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: undefined,
      launcher, signal: controller.signal,
    })
    setTimeout(() => { controller.abort() }, 200)
    const summary = await running
    expect(summary.signalAborted).toBe(true)
  }, 20_000)

  it('reports a spawn failure and a missing launcher instead of hanging', async () => {
    const missing = await runAgentChild({
      cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: undefined,
      launcher: { execPath: 'dsh-no-such-binary-xyz', argsPrefix: [] },
    })
    expect(missing.spawnError).not.toBeNull()

    const originalArgs = process.argv.slice()
    try {
      process.argv.splice(1)
      const unlocatable = await runAgentChild({
        cwd: cwd(), task: 'x', sessionId: undefined, patches: [], timeoutMs: undefined,
      })
      expect(unlocatable.spawnError).toBe('dsh run: cannot locate the dsh launcher to spawn the agent run')
    } finally {
      process.argv.push(...originalArgs.slice(1))
    }
  })
})
