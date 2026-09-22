/**
 * The explicit request-to-spec resolution for `dsh run`: every default and
 * precondition is decided here, in one place, before anything runs.
 * @module @deepseek-ai/dsh/run/spec
 */

import type { RepositoryFacts } from './git.ts'
import type { RunRequest, RunSpec } from './types.ts'

/** A rejected invocation: nothing may run. */
export interface UsageError {
  /** Human-readable rejection reason, also carried in the result object. */
  error: string
}

/**
 * Parse a wall-clock duration into milliseconds.
 * @param value - duration such as `90s`, `15m`, `2h`, or a bare millisecond count.
 * @returns the millisecond count, or `undefined` when the value is malformed or non-positive.
 */
export function parseDurationMs(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value.trim())
  if (match === null) return undefined
  const amount = Number(match[1])
  const unit = match[2] ?? 'ms'
  const factor = unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000
  const ms = amount * factor
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : undefined
}

/** The resolved run specification: every default decided in one place. */
export interface ResolvedRunSpec extends RunSpec {
  /** Branch the run merges into and pushes, when delivery applies. */
  targetBranch?: string
}

/**
 * Resolve one parsed invocation into a run specification, or reject it before
 * anything runs.
 * @param request - the parsed invocation with the task text already read.
 * @param repository - target repository facts, or `null` when the target is not a git repository.
 * @returns the resolved spec or a usage error.
 */
export function resolveRunSpec(request: RunRequest & { task: string }, repository: RepositoryFacts | null): ResolvedRunSpec | UsageError {
  if (request.task.trim() === '') {
    return { error: 'a task is required: pass --task, --task-file, or pipe the task to stdin' }
  }
  if ((request.priceInUsdPerMtok === undefined) !== (request.priceOutUsdPerMtok === undefined)) {
    return { error: '--price-in-usd-per-mtok and --price-out-usd-per-mtok must be given together' }
  }
  const worktree = request.worktree ?? repository !== null
  if (worktree && repository === null) {
    return { error: '--worktree needs a git repository; run without --worktree or point --cwd at one' }
  }
  if (request.push && !worktree) {
    return {
      error: repository === null
        ? '--push needs a git repository as --cwd'
        : '--push needs worktree isolation so the run can commit, merge, and clean up safely',
    }
  }
  if (request.sessionId !== undefined && request.sessionId.trim() === '') {
    return { error: '--session-id needs a non-empty session id' }
  }
  if (request.abortSessionId !== undefined && request.abortSessionId.trim() === '') {
    return { error: '--abort needs a non-empty session id' }
  }
  const targetBranch = request.targetBranch ?? repository?.branch ?? undefined
  if (request.push && targetBranch === undefined) {
    return { error: '--push needs --target-branch: the target repository has a detached HEAD' }
  }
  return {
    cwd: request.cwd,
    task: request.task,
    sessionId: request.sessionId,
    timeoutMs: request.timeoutMs,
    output: request.output,
    worktree,
    cleanup: request.cleanup ?? true,
    push: request.push,
    testCmd: request.testCmd,
    priceInUsdPerMtok: request.priceInUsdPerMtok,
    priceOutUsdPerMtok: request.priceOutUsdPerMtok,
    patches: request.patches,
    ...targetBranch === undefined ? {} : { targetBranch },
  }
}
