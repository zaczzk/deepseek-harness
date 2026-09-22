import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDshRun, type RunIo } from '../../src/run/index.ts'
import type { DshRunResult, RunRequest } from '../../src/run/types.ts'

const FAKE_AGENT = fileURLToPath(new URL('./fixtures/fake-agent.mjs', import.meta.url))
const launcher = { execPath: process.execPath, argsPrefix: [FAKE_AGENT] }
const directories: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  directories.push(dir)
  return dir
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function createRepo(testScript?: string): string {
  const dir = tempDir('dsh-run-e2e-')
  git(dir, ['init', '-b', 'main'])
  git(dir, ['config', 'user.email', 'run@test.invalid'])
  git(dir, ['config', 'user.name', 'dsh-run-test'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(dir, 'README.md'), 'start\n')
  writeFileSync(join(dir, 'package.json'), JSON.stringify(
    testScript === undefined ? { name: 'fixture' } : { name: 'fixture', scripts: { test: testScript } },
  ))
  git(dir, ['add', 'README.md', 'package.json'])
  git(dir, ['commit', '-m', 'init'])
  return dir
}

function request(cwd: string, overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    cwd,
    task: 'write the feature',
    taskFile: undefined,
    taskFromStdin: false,
    sessionId: undefined,
    timeoutMs: undefined,
    output: 'json',
    worktree: undefined,
    cleanup: undefined,
    push: false,
    targetBranch: undefined,
    testCmd: undefined,
    priceInUsdPerMtok: undefined,
    priceOutUsdPerMtok: undefined,
    patches: [],
    abortSessionId: undefined,
    ...overrides,
  }
}

interface Captured {
  code: number
  result: DshRunResult
  lines: Record<string, unknown>[]
  stderr: string
}

async function invoke(overrides: Partial<RunRequest>, repo: string, signal?: AbortSignal): Promise<Captured> {
  const out: string[] = []
  const err: string[] = []
  const io: RunIo = {
    stdout: { write: (chunk: string) => { out.push(chunk) } },
    stderr: { write: (chunk: string) => { err.push(chunk) } },
  }
  const code = await runDshRun({
    request: request(repo, overrides),
    io,
    signal: signal ?? new AbortController().signal,
    launcher,
  })
  const rawLines = out.join('').split('\n').filter(line => line.trim() !== '')
  const lines = rawLines.map(line => JSON.parse(line) as Record<string, unknown>)
  const result = JSON.parse(rawLines.at(-1) ?? 'null') as DshRunResult
  return { code, result, lines, stderr: err.join('') }
}

afterEach(() => {
  vi.unstubAllEnvs()
  while (directories.length > 0) rmSync(directories.pop() as string, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 })
})

describe('dsh run pipeline', () => {
  it('runs the task, gates, merges, and cleans up', async () => {
    const repo = createRepo()
    vi.stubEnv('FAKE_AGENT_MODE', 'two-steps')
    vi.stubEnv('FAKE_SESSION_ID', 'session-happy')
    const { code, result } = await invoke(
      { testCmd: 'node -e "process.exit(0)"', priceInUsdPerMtok: 2, priceOutUsdPerMtok: 8 },
      repo,
    )
    expect(code).toBe(0)
    expect(result).toMatchObject({
      schema: 'dsh-run/1',
      outcome: 'success',
      error: null,
      session_id: 'session-happy',
      resumed: false,
      turns: 2,
      usage_complete: true,
      cost_usd: 0.00006,
      files_changed: ['task-output.txt'],
      uncommitted: [],
      tests: { status: 'passed', command: 'node -e "process.exit(0)"', exit_code: 0 },
      push: { requested: false, pushed: false, reason: 'not-requested' },
      worktree: { created: true, cleaned: true },
    })
    expect(result.usage).toEqual({
      input_tokens: 10, output_tokens: 5,
      reasoning_tokens: 2, cache_read_tokens: 0, cache_write_tokens: 0, total_tokens: 15,
    })
    expect(readFileSync(join(repo, 'task-output.txt'), 'utf8')).toBe('task: write the feature')
    expect(git(repo, ['worktree', 'list']).split('\n')).toHaveLength(1)
    expect(git(repo, ['status', '--porcelain'])).toBe('')
    expect(existsSync(join(repo, '.git', 'dsh-scratch', 'runs'))).toBe(false)
    expect(result.exit_code).toBe(code)
  }, 30_000)

  it('fails loudly with nothing pushed when the tests fail', async () => {
    const repo = createRepo()
    const remote = tempDir('dsh-run-remote-')
    execFileSync('git', ['init', '--bare', remote])
    git(repo, ['remote', 'add', 'origin', remote])
    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const { code, result } = await invoke(
      { testCmd: 'node -e "process.exit(3)"', push: true },
      repo,
    )
    expect(code).toBe(4)
    expect(result).toMatchObject({
      outcome: 'failure',
      error: { code: 'TESTS_FAILED' },
      tests: { status: 'failed', command: 'node -e "process.exit(3)"', exit_code: 3 },
      push: { requested: true, pushed: false, reason: 'tests-not-passed' },
      worktree: { created: true, cleaned: true },
    })
    expect(execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' })).toBe('')
    expect(git(repo, ['log', '--oneline'])).not.toContain('dsh-run')
    expect(git(repo, ['status', '--porcelain'])).toBe('')
  }, 30_000)

  it('pushes only after the gate passes', async () => {
    const repo = createRepo()
    const remote = tempDir('dsh-run-remote-')
    execFileSync('git', ['init', '--bare', remote])
    git(repo, ['remote', 'add', 'origin', remote])
    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const { code, result } = await invoke({ testCmd: 'node -e "process.exit(0)"', push: true }, repo)
    expect(code).toBe(0)
    expect(result.push).toEqual({ requested: true, pushed: true, reason: null })
    expect(execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' })).toContain('refs/heads/main')
    expect(existsSync(join(repo, 'task-output.txt'))).toBe(true)
    expect(git(repo, ['status', '--porcelain'])).toBe('')
  }, 30_000)

  it('classifies turn failures, rate limits, and start failures into distinct exit codes', async () => {
    const repo = createRepo()
    vi.stubEnv('FAKE_AGENT_MODE', 'turn-error')
    const turn = await invoke({ testCmd: 'node -e "process.exit(0)"' }, repo)
    expect(turn.code).toBe(1)
    expect(turn.result.error).toEqual({ code: 'FAKE_TOOL_FAILURE', message: 'the fake tool failed' })
    expect(turn.result.tests).toEqual({ status: 'not-run', command: null, exit_code: null })

    vi.stubEnv('FAKE_AGENT_MODE', 'rate-limited')
    const limited = await invoke({}, repo)
    expect(limited.code).toBe(7)
    expect(limited.result.error?.code).toBe('RATE_LIMITED')

    vi.stubEnv('FAKE_AGENT_MODE', 'stream-error')
    const start = await invoke({}, repo)
    expect(start.code).toBe(3)
    expect(start.result.error).toEqual({ code: 'STREAM_ERROR', message: 'fake agent could not start' })
  }, 30_000)

  it('times out, keeps the lease discoverable by run id, and --abort releases it', async () => {
    const repo = createRepo()
    vi.stubEnv('FAKE_AGENT_MODE', 'slow')
    const timedOut = await invoke({ timeoutMs: 2000, testCmd: 'node -e "process.exit(0)"' }, repo)
    expect(timedOut.code).toBe(124)
    expect(timedOut.result.outcome).toBe('timeout')
    expect(timedOut.result.worktree.cleaned).toBe(false)
    expect(timedOut.result.run_id).toMatch(/^run-/)
    expect(timedOut.result.error?.message).toContain('resume with --session-id')
    expect(git(repo, ['worktree', 'list']).split('\n').length).toBe(2)

    // Even a kill that beats the session event leaves a discoverable handle.
    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const aborted = await invoke({ abortSessionId: timedOut.result.run_id ?? 'run-missing' }, repo)
    expect(aborted.code).toBe(0)
    expect(aborted.result.outcome).toBe('success')
    expect(git(repo, ['worktree', 'list']).split('\n')).toHaveLength(1)
    expect(existsSync(join(repo, '.git', 'dsh-scratch', 'runs'))).toBe(false)
  }, 40_000)

  it('interrupts, keeps the lease, and resumes the same session in the same worktree', async () => {
    const repo = createRepo()
    const stamp = tempDir('dsh-run-stamp-')
    vi.stubEnv('FAKE_AGENT_MODE', 'slow')
    vi.stubEnv('FAKE_STAMP_DIR', stamp)
    const controller = new AbortController()
    const interrupted = invoke({}, repo, controller.signal)
    while (!existsSync(join(stamp, 'slow-started.txt'))) await new Promise((resolve) => setTimeout(resolve, 25))
    controller.abort()
    const first = await interrupted
    expect(first.code).toBe(130)
    expect(first.result.outcome).toBe('interrupted')
    expect(first.result.session_id).toBe('session-fake')
    expect(first.result.worktree.cleaned).toBe(false)
    expect(first.result.error?.message).toContain('resume with --session-id')

    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const second = await invoke({ sessionId: 'session-fake', testCmd: 'node -e "process.exit(0)"' }, repo)
    expect(second.code).toBe(0)
    expect(second.result.outcome).toBe('success')
    expect(second.result.resumed).toBe(true)
    expect(second.result.session_id).toBe('session-fake')
    expect(second.result.worktree.path).toBe(first.result.worktree.path)
    expect(second.result.files_changed).toEqual(['task-output.txt'])
    expect(second.result.worktree.cleaned).toBe(true)
    expect(git(repo, ['worktree', 'list']).split('\n')).toHaveLength(1)
  }, 40_000)

  it('reports an unusable --session-id as a stream failure and cleans up', async () => {
    const repo = createRepo()
    // The headless runner refuses to adopt an unknown session and emits a
    // stream-level error before any turn.
    vi.stubEnv('FAKE_AGENT_MODE', 'stream-error')
    const { code, result } = await invoke({ sessionId: 'session-unknown-elsewhere' }, repo)
    expect(code).toBe(3)
    expect(result.error?.code).toBe('STREAM_ERROR')
    expect(result.worktree.cleaned).toBe(true)
  }, 30_000)

  it('refuses to push without a test command and reports an absent command explicitly', async () => {
    const repo = createRepo()
    const remote = tempDir('dsh-run-remote-')
    execFileSync('git', ['init', '--bare', remote])
    git(repo, ['remote', 'add', 'origin', remote])
    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const refused = await invoke({ push: true }, repo)
    expect(refused.code).toBe(5)
    expect(refused.result.error?.code).toBe('TESTS_ABSENT')
    expect(refused.result.tests.status).toBe('absent')
    expect(execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' })).toBe('')

    const local = await invoke({}, repo)
    expect(local.code).toBe(0)
    expect(local.result.tests).toEqual({ status: 'absent', command: null, exit_code: null })
  }, 40_000)

  it('reports usage errors as one result object with exit code 2', async () => {
    const missing = await invoke({}, join(tempDir('dsh-run-no-repo-'), 'does-not-exist'))
    expect(missing.code).toBe(2)
    expect(missing.result.error?.code).toBe('USAGE')
    expect(missing.result.schema).toBe('dsh-run/1')

    const repo = createRepo()
    const emptyTask = await invoke({ task: '   ' }, repo)
    expect(emptyTask.code).toBe(2)
    expect(emptyTask.result.exit_code).toBe(2)
  }, 30_000)

  it('streams JSONL events in --output jsonl with the result as the last line', async () => {
    const repo = createRepo()
    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const { code, lines, result } = await invoke({ output: 'jsonl', testCmd: 'node -e "process.exit(0)"' }, repo)
    expect(code).toBe(0)
    expect(lines[0]).toMatchObject({ type: 'run/status', phase: 'run_start' })
    expect(lines.some(line => line.type === 'session')).toBe(true)
    expect(lines.some(line => line.type === 'run/status' && line.phase === 'gate_end' && line.status === 'passed')).toBe(true)
    expect(result.schema).toBe('dsh-run/1')
  }, 30_000)

  it('runs in place without a worktree and attributes files changed during the run', async () => {
    const repo = createRepo()
    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const { code, result } = await invoke({ worktree: false }, repo)
    expect(code).toBe(0)
    expect(result.worktree).toEqual({ created: false, path: null, branch: null, cleaned: true })
    expect(result.files_changed).toEqual(['task-output.txt'])
    expect(result.uncommitted).toEqual(['task-output.txt'])
  }, 30_000)

  it('reports file facts as unknown outside a git repository', async () => {
    const dir = tempDir('dsh-run-plain-')
    vi.stubEnv('FAKE_AGENT_MODE', 'completed')
    const { code, result } = await invoke({ worktree: false }, dir)
    expect(code).toBe(0)
    expect(result.files_changed).toBeNull()
    expect(result.uncommitted).toBeNull()
  }, 30_000)
})
