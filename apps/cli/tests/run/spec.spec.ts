import { describe, expect, it } from 'vitest'
import { parseDurationMs, resolveRunSpec } from '../../src/run/spec.ts'
import type { RunRequest } from '../../src/run/types.ts'
import type { RepositoryFacts } from '../../src/run/git.ts'

function request(overrides: Partial<RunRequest> = {}): RunRequest & { task: string } {
  const base: RunRequest & { task: string } = {
    cwd: '/work/repo',
    task: 'do the thing',
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
  }
  return { ...base, ...overrides, task: overrides.task ?? base.task }
}

const repository: RepositoryFacts = { toplevel: '/work/repo', commonDir: '/work/repo/.git', branch: 'main' }

describe('parseDurationMs', () => {
  it.each([
    ['500ms', 500], ['90s', 90_000], ['15m', 900_000], ['2h', 7_200_000],
    ['1250', 1250], ['1.5s', 1500],
  ])('parses %s', (value, expected) => {
    expect(parseDurationMs(value)).toBe(expected)
  })

  it.each(['', '0', '-5', 'abc', '10d', '1 m'])('rejects %j', (value) => {
    expect(parseDurationMs(value)).toBeUndefined()
  })
})

describe('resolveRunSpec', () => {
  it('resolves defaults in one place', () => {
    const spec = resolveRunSpec(request(), repository)
    expect(spec).toMatchObject({
      cwd: '/work/repo',
      task: 'do the thing',
      output: 'json',
      worktree: true,
      cleanup: true,
      push: false,
      targetBranch: 'main',
    })
  })

  it('keeps explicit values and disables worktree isolation on request', () => {
    const spec = resolveRunSpec(request({ worktree: false, cleanup: false, output: 'jsonl', testCmd: 'pytest' }), repository)
    expect(spec).toMatchObject({ worktree: false, cleanup: false, output: 'jsonl', testCmd: 'pytest' })
  })

  it('needs a non-empty task', () => {
    expect(resolveRunSpec(request({ task: '   ' }), repository)).toEqual({ error: 'a task is required: pass --task, --task-file, or pipe the task to stdin' })
  })

  it('rejects unpaired prices', () => {
    expect(resolveRunSpec(request({ priceInUsdPerMtok: 1 }), repository))
      .toEqual({ error: '--price-in-usd-per-mtok and --price-out-usd-per-mtok must be given together' })
    expect(resolveRunSpec(request({ priceOutUsdPerMtok: 1 }), repository))
      .toEqual({ error: '--price-in-usd-per-mtok and --price-out-usd-per-mtok must be given together' })
  })

  it('rejects worktree isolation without a repository and push without isolation', () => {
    expect(resolveRunSpec(request({ worktree: true }), null))
      .toEqual({ error: '--worktree needs a git repository; run without --worktree or point --cwd at one' })
    expect(resolveRunSpec(request({ push: true, worktree: false }), repository))
      .toEqual({ error: '--push needs worktree isolation so the run can commit, merge, and clean up safely' })
    expect(resolveRunSpec(request({ push: true }), null))
      .toEqual({ error: '--push needs a git repository as --cwd' })
  })

  it('rejects push with a detached HEAD and blank session identities', () => {
    const detached: RepositoryFacts = { ...repository, branch: null }
    expect(resolveRunSpec(request({ push: true }), detached))
      .toEqual({ error: '--push needs --target-branch: the target repository has a detached HEAD' })
    expect(resolveRunSpec(request({ sessionId: '  ' }), repository))
      .toEqual({ error: '--session-id needs a non-empty session id' })
    expect(resolveRunSpec(request({ abortSessionId: ' ' }), repository))
      .toEqual({ error: '--abort needs a non-empty session id' })
  })

  it('runs in place without a repository when isolation is not requested', () => {
    const spec = resolveRunSpec(request({ worktree: undefined }), null)
    if ('error' in spec) throw new Error(spec.error)
    expect(spec).toMatchObject({ worktree: false })
    expect(spec.targetBranch).toBeUndefined()
  })
})
