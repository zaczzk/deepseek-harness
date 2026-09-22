/**
 * The `dsh run` pipeline: lease a worktree, drive one headless agent run,
 * commit named paths, gate on the project's test command, deliver to the
 * target branch, push only after the gate passes, and clean up the lease —
 * then write exactly one JSON result object to stdout. An interrupt or
 * timeout keeps the lease so `--session-id` resumes the run; every other exit
 * path cleans up by default.
 * @module @deepseek-ai/dsh/run
 */

import { existsSync, readFileSync } from 'node:fs'
import { runAgentChild, type AgentRunSummary, type LauncherCommand } from './agent-run.ts'
import { RUN_EXIT } from './exit-codes.ts'
import {
  changedPaths,
  commitNamedPaths,
  hasRemote,
  leaseWorktree,
  locateRepository,
  mergeRunBranch,
  pushBranch,
  removeWorktreeLease,
  type RepositoryFacts,
  type WorktreeLease,
} from './git.ts'
import { resolveTestSpec, runGate, type TestSpec } from './gate.ts'
import { computeCostUsd, writeResult } from './result.ts'
import { findRunDir, newRunId, persistRunState, readRunState, removeRunState, writeRunState, type RunState } from './state.ts'
import { resolveRunSpec, type ResolvedRunSpec } from './spec.ts'
import type { DshRunResult, RunRequest, RunTestsReport } from './types.ts'

/** Process-facing IO of the `dsh run` command. */
export interface RunIo {
  /** Machine-readable output: the one result object, plus events in `jsonl` mode. */
  stdout: { write(chunk: string): unknown }
  /** Human-facing progress and diagnostics. */
  stderr: { write(chunk: string): unknown }
}

/** Options for {@link runDshRun}. */
export interface RunInvocationOptions {
  /** The parsed invocation with the task text already read. */
  request: RunRequest
  /** A grammar rejection from the argument parser, before any request could resolve. */
  usageError?: string | undefined
  /** Process-facing output sinks. */
  io: RunIo
  /** Interrupt signal (SIGINT or SIGTERM); aborting keeps the run's lease for resume. */
  signal: AbortSignal
  /** Launcher command override (tests); defaults to re-spawning this `dsh` installation. */
  launcher?: LauncherCommand | undefined
}

/** The pipeline's decided outcome before the result object is assembled. */
interface Verdict {
  outcome: DshRunResult['outcome']
  code: number
  error: { code: string; message: string } | null
}

const NOT_RUN_TESTS: RunTestsReport = { status: 'not-run', command: null, exit_code: null }

/**
 * Classify an agent-run failure into the exit code a caller branches on.
 * @param summary - the folded child stream summary.
 * @returns the failure verdict, or `null` when the task completed.
 */
function classifyAgent(summary: AgentRunSummary): Verdict | null {
  if (summary.spawnError !== null) {
    return { outcome: 'failure', code: RUN_EXIT.COULD_NOT_START, error: { code: 'AGENT_SPAWN_FAILED', message: summary.spawnError } }
  }
  const turnEnd = summary.turnEnd
  if (turnEnd === null) {
    // A stream-level error only classifies the run when no turn ever ended; a
    // stray late line must not misreport a completed turn as a failed start.
    if (summary.streamError !== null) {
      return { outcome: 'failure', code: RUN_EXIT.COULD_NOT_START, error: { code: 'STREAM_ERROR', message: summary.streamError } }
    }
    return { outcome: 'failure', code: RUN_EXIT.TASK_FAILED, error: { code: 'NO_TURN', message: 'the agent run ended without a turn' } }
  }
  if (turnEnd.kind === 'completed') return null
  const code = turnEnd.code ?? `TURN_${turnEnd.kind.toUpperCase()}`
  const message = turnEnd.message ?? `the turn ended as ${turnEnd.kind}`
  if (code === 'MISSING_CREDENTIAL' || code === 'INVALID_CREDENTIAL') {
    return { outcome: 'failure', code: RUN_EXIT.COULD_NOT_START, error: { code, message } }
  }
  if (/RATE.?LIMIT/i.test(`${code} ${message}`)) {
    return { outcome: 'failure', code: RUN_EXIT.RATE_LIMITED, error: { code: 'RATE_LIMITED', message } }
  }
  return { outcome: 'failure', code: RUN_EXIT.TASK_FAILED, error: { code, message } }
}

/** Resolve the task text from `--task`, `--task-file`, or stdin. */
function readTask(request: RunRequest): { task: string } | { error: string } {
  if (request.task !== undefined) return { task: request.task }
  try {
    if (request.taskFile !== undefined) return { task: readFileSync(request.taskFile, 'utf8') }
    if (process.stdin.isTTY === true) return { error: 'a task is required, for example: dsh run --task "fix the tests"' }
    return { task: readFileSync(0, 'utf8') }
  } catch (error) {
    return { error: `cannot read the task: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Build the result skeleton every exit path fills and writes. */
function skeleton(request: RunRequest, startedAt: Date): DshRunResult {
  return {
    schema: 'dsh-run/1',
    outcome: 'failure',
    error: { code: 'USAGE', message: 'the run failed before classifying its error' },
    session_id: null,
    run_id: null,
    resumed: request.sessionId !== undefined,
    turns: null,
    usage: null,
    usage_complete: true,
    cost_usd: null,
    answer: null,
    files_changed: null,
    uncommitted: null,
    tests: NOT_RUN_TESTS,
    // A requested push that never ran says so; it never reads as unrequested.
    push: { requested: request.push, pushed: false, reason: request.push ? 'not-attempted' : 'not-requested' },
    worktree: { created: false, path: null, branch: null, cleaned: true },
    started_at: startedAt.toISOString(),
    duration_ms: 0,
    exit_code: RUN_EXIT.TASK_FAILED,
  }
}

/** Release one recorded run lease (`--abort`). */
function abortRun(request: RunRequest, repository: RepositoryFacts | null, startedAt: Date): DshRunResult {
  const result = skeleton(request, startedAt)
  const sessionId = request.abortSessionId ?? null
  result.session_id = sessionId
  result.resumed = false
  if (repository === null) {
    result.error = { code: 'USAGE', message: '--abort needs a git repository: run leases live in the target repository' }
    result.exit_code = RUN_EXIT.USAGE
    return result
  }
  const runDir = sessionId === null ? null : findRunDir(repository.commonDir, sessionId)
  const state = runDir === null ? null : readRunState(runDir)
  if (runDir === null || state === null) {
    result.error = { code: 'NO_SUCH_RUN', message: `no run lease records ${JSON.stringify(sessionId)}` }
    result.exit_code = RUN_EXIT.USAGE
    return result
  }
  if (state.phase === 'agent-running') {
    result.error = { code: 'RUN_BUSY', message: `run ${JSON.stringify(state.run_id)} is executing right now; stop it before aborting` }
    result.exit_code = RUN_EXIT.USAGE
    return result
  }
  result.run_id = state.run_id
  result.worktree = { created: state.worktree !== null, path: state.worktree, branch: state.branch, cleaned: false }
  let failure: string | null = null
  if (state.worktree !== null && state.branch !== null) {
    failure = removeWorktreeLease(repository, { path: state.worktree, branch: state.branch, base: state.base ?? '' }).failure
  }
  // A failed release keeps the state record so the caller can retry; removing
  // it would orphan the worktree it names.
  if (failure === null) removeRunState(runDir)
  if (failure !== null) {
    result.error = { code: 'CLEANUP_FAILED', message: failure }
    result.worktree.cleaned = false
    result.exit_code = RUN_EXIT.DELIVERY_FAILED
    return result
  }
  result.outcome = 'success'
  result.error = null
  result.worktree.cleaned = true
  result.exit_code = RUN_EXIT.SUCCESS
  return result
}

/**
 * Emit one `run/status` lifecycle event in `jsonl` mode. A forwarded child
 * stream line carries its own `type` and passes through under that type.
 */
function runEvent(spec: ResolvedRunSpec, io: RunIo, event: Record<string, unknown>): void {
  if (spec.output !== 'jsonl') return
  io.stdout.write(`${JSON.stringify({ type: 'run/status', ...event })}\n`)
}

/**
 * Run one `dsh run` invocation to completion and write its result.
 * @param options - the parsed invocation, output sinks, and interrupt signal.
 * @returns the process exit code, matching the result object's `exit_code`.
 */
export async function runDshRun(options: RunInvocationOptions): Promise<number> {
  const { request, io, signal } = options
  const startedAt = new Date()
  const startedMs = startedAt.getTime()
  const finish = (result: DshRunResult): number => {
    result.duration_ms = Date.now() - startedMs
    writeResult(io.stdout, result)
    return result.exit_code
  }
  if (options.usageError !== undefined) {
    const result = skeleton(request, startedAt)
    result.error = { code: 'USAGE', message: options.usageError }
    result.exit_code = RUN_EXIT.USAGE
    return finish(result)
  }

  const repository = existsSync(request.cwd) ? locateRepository(request.cwd) : null
  if (request.abortSessionId !== undefined) {
    return finish(abortRun(request, repository, startedAt))
  }
  if (!existsSync(request.cwd)) {
    const result = skeleton(request, startedAt)
    result.error = { code: 'USAGE', message: `--cwd ${JSON.stringify(request.cwd)} is not a directory that exists` }
    result.exit_code = RUN_EXIT.USAGE
    return finish(result)
  }
  const taskRead = readTask(request)
  if ('error' in taskRead) {
    const result = skeleton(request, startedAt)
    result.error = { code: 'USAGE', message: taskRead.error }
    result.exit_code = RUN_EXIT.USAGE
    return finish(result)
  }
  const spec = resolveRunSpec({ ...request, task: taskRead.task }, repository)
  if ('error' in spec) {
    const result = skeleton(request, startedAt)
    result.error = { code: 'USAGE', message: spec.error }
    result.exit_code = RUN_EXIT.USAGE
    return finish(result)
  }

  const result = skeleton(request, startedAt)
  result.push.reason = spec.push ? 'not-attempted' : 'not-requested'
  runEvent(spec, io, { phase: 'run_start', cwd: spec.cwd, worktree: spec.worktree })

  // ---- lease ----
  let lease: WorktreeLease | null = null
  let runDir: string | null = null
  let state: RunState | null = null
  const repo = repository
  if (spec.worktree && repo !== null) {
    const resumedDir = spec.sessionId === undefined ? null : findRunDir(repo.commonDir, spec.sessionId)
    const resumedState = resumedDir === null ? null : readRunState(resumedDir)
    if (resumedState !== null && resumedState.worktree !== null && resumedState.branch !== null) {
      if (!existsSync(resumedState.worktree)) {
        result.error = {
          code: 'RUN_LEASE_GONE',
          message: `session ${spec.sessionId} recorded worktree ${resumedState.worktree}, which no longer exists; `
            + 'resume only an interrupted run, or start without --session-id',
        }
        result.exit_code = RUN_EXIT.COULD_NOT_START
        return finish(result)
      }
      lease = { path: resumedState.worktree, branch: resumedState.branch, base: resumedState.base ?? '' }
      runDir = resumedDir
      state = resumedState
      result.run_id = resumedState.run_id
      runEvent(spec, io, { phase: 'lease_reattached', worktree: lease.path, branch: lease.branch })
    } else {
      const leased = leaseWorktree(repo, newRunId())
      if (!leased.ok) {
        result.error = { code: 'WORKTREE_LEASE_FAILED', message: leased.failure }
        result.exit_code = RUN_EXIT.COULD_NOT_START
        return finish(result)
      }
      lease = leased.lease
      runDir = writeRunState(repo.commonDir, {
        schema: 'dsh-run-state/1',
        run_id: lease.branch.slice('dsh-run/'.length),
        session_id: spec.sessionId ?? null,
        worktree: lease.path,
        branch: lease.branch,
        base: lease.base,
        phase: 'leased',
      })
      state = readRunState(runDir)
      result.run_id = lease.branch.slice('dsh-run/'.length)
      runEvent(spec, io, { phase: 'lease_created', worktree: lease.path, branch: lease.branch })
    }
    result.worktree = { created: true, path: lease.path, branch: lease.branch, cleaned: false }
  }

  const runCwd = lease?.path ?? spec.cwd
  const filesBefore = spec.worktree ? null : new Set(changedPaths(spec.cwd, null) ?? [])

  // ---- agent run ----
  if (state !== null && runDir !== null) {
    state = { ...state, phase: 'agent-running' }
    persistRunState(runDir, state)
  }
  runEvent(spec, io, { phase: 'agent_start', session_id: spec.sessionId ?? null })
  // The bound applies to the agent run and, separately, to the test command;
  // repository setup time sits outside it.
  const summary = await runAgentChild({
    cwd: runCwd,
    task: spec.task,
    sessionId: spec.sessionId,
    patches: spec.patches,
    timeoutMs: spec.timeoutMs,
    signal,
    launcher: options.launcher,
    onEvent: (line) => {
      runEvent(spec, io, line)
      // Persist the session identity the moment the stream reports it, so a
      // crash mid-run still leaves a state record a resume can find.
      if (line.type === 'session' && typeof line.sessionId === 'string' && state !== null && runDir !== null) {
        state = { ...state, session_id: line.sessionId }
        persistRunState(runDir, state)
      }
    },
    onStderr: (chunk) => { io.stderr.write(chunk) },
  })
  result.session_id = summary.sessionId ?? spec.sessionId ?? null
  result.turns = summary.turns
  result.usage = summary.usage
  result.usage_complete = summary.usageComplete
  result.cost_usd = computeCostUsd(summary.usage, spec.priceInUsdPerMtok, spec.priceOutUsdPerMtok)
  result.answer = summary.answer
  runEvent(spec, io, { phase: 'agent_end', session_id: result.session_id })

  // ---- files ----
  const filesChanged = repo === null ? null : lease === null
    ? (() => {
        const filesAfter = new Set(changedPaths(spec.cwd, null) ?? [])
        return [...filesAfter].filter(path => !filesBefore?.has(path)).sort()
      })()
    : changedPaths(lease.path, lease.base)
  result.files_changed = filesChanged
  result.uncommitted = filesChanged === null ? null : lease === null
    ? [...(changedPaths(spec.cwd, null) ?? [])].sort()
    : changedPaths(lease.path, null)

  // Interrupt and timeout keep the lease: a resume needs the recorded working
  // directory to still exist, so an ended-but-unfinished run does not clean up.
  if (summary.signalAborted || summary.timedOut) {
    const interrupted = summary.signalAborted
    result.outcome = interrupted ? 'interrupted' : 'timeout'
    result.error = {
      code: interrupted ? 'INTERRUPTED' : 'TIMEOUT',
      message: interrupted
        ? 'interrupted before the task finished; resume with --session-id to continue'
        : 'the wall-clock timeout expired before the task finished; resume with --session-id to continue',
    }
    result.tests = NOT_RUN_TESTS
    result.push.reason = spec.push ? 'run-not-finished' : 'not-requested'
    result.exit_code = interrupted ? RUN_EXIT.INTERRUPTED : RUN_EXIT.TIMEOUT
    refreshUncommitted(spec.cwd, lease, result)
    if (state !== null && runDir !== null) {
      state = { ...state, phase: 'interrupted', session_id: result.session_id }
      persistRunState(runDir, state)
    }
    runEvent(spec, io, { phase: 'run_interrupted', kept_worktree: lease?.path ?? null })
    return finish(result)
  }

  const agentFailure = classifyAgent(summary)
  if (agentFailure !== null) {
    result.outcome = agentFailure.outcome
    result.error = agentFailure.error
    result.tests = NOT_RUN_TESTS
    result.push.reason = spec.push ? 'task-not-completed' : 'not-requested'
    result.exit_code = agentFailure.code
    return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
  }

  // ---- commit ----
  let commit: string | null = null
  const changed = result.files_changed ?? []
  if (lease !== null && changed.length > 0) {
    const firstLine = spec.task.split('\n', 1)[0] ?? ''
    const committed = commitNamedPaths(lease.path, changed, `dsh-run: ${firstLine.slice(0, 60)}`)
    if (!committed.ok) {
      result.error = { code: 'COMMIT_FAILED', message: committed.failure }
      result.push.reason = 'commit-failed'
      result.exit_code = RUN_EXIT.DELIVERY_FAILED
      return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
    }
    commit = committed.commit
    runEvent(spec, io, { phase: 'committed', commit })
  }

  // ---- gate ----
  const testSpec: TestSpec = resolveTestSpec(runCwd, spec.testCmd)
  const gate = runGate(runCwd, testSpec, spec.timeoutMs)
  result.tests = { status: gate.status, command: gate.command, exit_code: gate.exit_code }
  runEvent(spec, io, { phase: 'gate_end', status: result.tests.status })
  if (gate.detail !== null) io.stderr.write(`dsh run: test gate (${gate.command ?? 'no test command'}):\n${gate.detail}\n`)
  if (gate.timedOut) {
    // Budget exhaustion is a timeout (exit 124) with the lease kept for
    // resume, never a toolchain failure.
    result.outcome = 'timeout'
    result.error = { code: 'TIMEOUT', message: 'the wall-clock timeout expired during the test command; resume with --session-id to continue' }
    result.push.reason = spec.push ? 'run-not-finished' : 'not-requested'
    result.exit_code = RUN_EXIT.TIMEOUT
    refreshUncommitted(spec.cwd, lease, result)
    if (state !== null && runDir !== null) {
      state = { ...state, phase: 'interrupted', session_id: result.session_id }
      persistRunState(runDir, state)
    }
    runEvent(spec, io, { phase: 'run_interrupted', kept_worktree: lease?.path ?? null })
    return finish(result)
  }
  if (gate.status === 'failed') {
    result.error = { code: 'TESTS_FAILED', message: `the test command failed with exit code ${gate.exit_code ?? 'unknown'}` }
    result.push.reason = 'tests-not-passed'
    result.exit_code = RUN_EXIT.TESTS_FAILED
    return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
  }
  if (gate.status === 'unavailable') {
    result.error = { code: 'TESTS_UNAVAILABLE', message: `the test command could not run${gate.detail === null ? '' : `: ${gate.detail.split('\n').slice(-1)[0] ?? ''}`}` }
    result.push.reason = 'tests-not-passed'
    result.exit_code = RUN_EXIT.TESTS_UNAVAILABLE
    return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
  }
  // `absent` is only fatal when delivery was requested; without a push the
  // caller gets the explicit status and the run still lands locally.
  if (gate.status === 'absent' && spec.push) {
    result.error = { code: 'TESTS_ABSENT', message: 'the project declares no test command, so the gate cannot run; pass --test-cmd to declare one' }
    result.push.reason = 'tests-not-passed'
    result.exit_code = RUN_EXIT.TESTS_UNAVAILABLE
    return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
  }

  // ---- delivery ----
  if (lease !== null && repo !== null) {
    const deliverTo = spec.targetBranch
    if (commit !== null && deliverTo === undefined) {
      // Committed work with no branch to deliver to must stay reachable: keep
      // the lease instead of deleting the only copy of the commit.
      result.error = { code: 'NO_TARGET_BRANCH', message: `the run committed ${commit} but the target repository has no named branch to deliver to; the work stays on ${lease.branch} in ${lease.path}` }
      result.push.reason = 'not-attempted'
      result.exit_code = RUN_EXIT.DELIVERY_FAILED
      refreshUncommitted(spec.cwd, lease, result)
      if (state !== null && runDir !== null) {
        state = { ...state, phase: 'interrupted', session_id: result.session_id }
        persistRunState(runDir, state)
      }
      runEvent(spec, io, { phase: 'run_interrupted', kept_worktree: lease.path })
      return finish(result)
    }
    if (commit !== null && deliverTo !== undefined) {
      const merged = mergeRunBranch(repo, lease.branch, deliverTo, `dsh-run: ${spec.task.split('\n', 1)[0]?.slice(0, 60) ?? ''} (from ${lease.branch})`)
      if (!merged.ok) {
        result.error = { code: 'MERGE_FAILED', message: merged.failure }
        result.push.reason = 'merge-failed'
        result.exit_code = RUN_EXIT.DELIVERY_FAILED
        return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
      }
      runEvent(spec, io, { phase: 'merged', commit: merged.commit })
    }
    if (spec.push) {
      if (commit === null) {
        result.push.reason = 'nothing-to-push'
      } else if (!hasRemote(repo.toplevel, 'origin')) {
        result.push = { requested: true, pushed: false, reason: 'no-remote-origin' }
        result.error = { code: 'NO_REMOTE', message: 'the target repository has no origin remote to push to' }
        result.exit_code = RUN_EXIT.DELIVERY_FAILED
        return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
      } else {
        const pushed = pushBranch(repo.toplevel, 'origin', deliverTo ?? '')
        if (!pushed.pushed) {
          result.push = { requested: true, pushed: false, reason: 'push-rejected' }
          result.error = { code: 'PUSH_FAILED', message: pushed.failure ?? 'git push failed' }
          result.exit_code = RUN_EXIT.DELIVERY_FAILED
          return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
        }
        result.push = { requested: true, pushed: true, reason: null }
        runEvent(spec, io, { phase: 'pushed', branch: deliverTo })
      }
    }
  }

  result.outcome = 'success'
  result.error = null
  result.exit_code = RUN_EXIT.SUCCESS
  return finishWithCleanup(spec, repo, lease, runDir, result, finish, io)
}

/** Recompute what the run leaves uncommitted, at the end of the run. */
function refreshUncommitted(cwd: string, lease: WorktreeLease | null, result: DshRunResult): void {
  // `files_changed === null` marks a target whose file facts are unknown.
  if (result.files_changed === null) return
  result.uncommitted = (lease === null ? changedPaths(cwd, null) : changedPaths(lease.path, null)) ?? null
}

/**
 * Clean up the lease (when configured) and finish the result. Interrupted and
 * timed-out runs never reach this: their lease is the resume handle.
 */
function finishWithCleanup(
  spec: ResolvedRunSpec,
  repository: RepositoryFacts | null,
  lease: WorktreeLease | null,
  runDir: string | null,
  result: DshRunResult,
  finish: (result: DshRunResult) => number,
  io: RunIo,
): number {
  refreshUncommitted(spec.cwd, lease, result)
  if (lease === null) {
    result.worktree.cleaned = true
    return finish(result)
  }
  if (!spec.cleanup) {
    runEvent(spec, io, { phase: 'lease_kept', worktree: lease.path, branch: lease.branch })
    io.stderr.write(`dsh run: keeping worktree ${lease.path} (branch ${lease.branch}); release it with --abort\n`)
    return finish(result)
  }
  const removed = repository === null
    ? { cleaned: false, failure: 'the target repository disappeared during the run' }
    : removeWorktreeLease(repository, lease)
  if (runDir !== null && removed.cleaned) removeRunState(runDir)
  result.worktree.cleaned = removed.cleaned
  if (!removed.cleaned && result.error === null) {
    result.error = { code: 'CLEANUP_FAILED', message: removed.failure ?? 'worktree cleanup failed' }
    result.outcome = 'failure'
    result.exit_code = RUN_EXIT.DELIVERY_FAILED
  }
  runEvent(spec, io, { phase: 'lease_released', cleaned: removed.cleaned })
  return finish(result)
}
