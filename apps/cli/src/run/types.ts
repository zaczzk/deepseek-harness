/**
 * The `dsh run` request, its resolved specification, and the one JSON result
 * object written to stdout. Unknown values are `null`, never a value that
 * could read as a pass.
 * @module @deepseek-ai/dsh/run/types
 */

/** Token counts the agent run reported, summed over every billed attempt. */
export interface RunUsage {
  /** Uncached prompt tokens. */
  input_tokens: number
  /** Generated tokens. */
  output_tokens: number
  /** Reasoning tokens, or `null` when any attempt omitted the bucket. */
  reasoning_tokens: number | null
  /** Cache-read tokens, or `null` when any attempt omitted the bucket. */
  cache_read_tokens: number | null
  /** Cache-write tokens, or `null` when any attempt omitted the bucket. */
  cache_write_tokens: number | null
  /** Provider-reported total tokens, or `null` when any attempt omitted the bucket. */
  total_tokens: number | null
}

/** What the test gate did for this run. */
export interface RunTestsReport {
  /** Gate outcome: `absent` means the project declares no test command, `unavailable` that it could not run, and `not-run` that an earlier failure stopped the run before the gate. */
  status: 'passed' | 'failed' | 'unavailable' | 'absent' | 'not-run'
  /** The exact command executed, or `null` when none was resolvable. */
  command: string | null
  /** The command's process exit code, or `null` when it did not run. */
  exit_code: number | null
}

/** Why no push happened; the closed set a caller may branch on. */
export type RunPushReason =
  | 'not-requested'
  | 'not-attempted'
  | 'run-not-finished'
  | 'task-not-completed'
  | 'tests-not-passed'
  | 'commit-failed'
  | 'merge-failed'
  | 'no-remote-origin'
  | 'push-rejected'
  | 'nothing-to-push'

/** Whether and why the run reached the remote. */
export interface RunPushReport {
  /** Whether this invocation requested a push. */
  requested: boolean
  /** Whether a push actually completed. */
  pushed: boolean
  /** Why no push happened (`null` when `pushed` is true). */
  reason: RunPushReason | null
}

/** The worktree lease this run held, if any. */
export interface RunWorktreeReport {
  /** Whether this run leased a worktree (false for `--no-worktree` or a non-git target). */
  created: boolean
  /** The worktree path, or `null` when none was leased. */
  path: string | null
  /** The run branch name, or `null` when none was created. */
  branch: string | null
  /** Whether the worktree and branch were removed by the end of the run. */
  cleaned: boolean
}

/** The single machine-readable result object `dsh run` writes to stdout. */
export interface DshRunResult {
  /** Result schema identifier; bumped only on a breaking field change. */
  schema: 'dsh-run/1'
  /** `success` only when the task completed and every requested step ran. */
  outcome: 'success' | 'failure' | 'timeout' | 'interrupted'
  /** Why the run did not succeed, or `null` on success. */
  error: { code: string; message: string } | null
  /** Session identity the agent run used, or `null` when no session started. */
  session_id: string | null
  /** Run identity naming the run lease; `--abort` accepts it in place of the session id. */
  run_id: string | null
  /** Whether `--session-id` resumed an existing session. */
  resumed: boolean
  /** Model turns observed in the run interval, or `null` when the stream reported none. */
  turns: number | null
  /** Summed reported token usage, or `null` when no attempt reported usage. */
  usage: RunUsage | null
  /** False when any billed attempt omitted a usage sample, so `usage` may under-report. */
  usage_complete: boolean
  /** Cost at caller-declared prices, or `null` when no prices were declared. */
  cost_usd: number | null
  /** Final assistant answer text, or `null` when no answer was produced. */
  answer: string | null
  /** Repository-relative paths the run touched, or `null` when the target is not a git repository or git failed to report. */
  files_changed: string[] | null
  /** Repository-relative paths left uncommitted at the end of the run, or `null` under the same conditions as `files_changed`. */
  uncommitted: string[] | null
  /** Test gate report. */
  tests: RunTestsReport
  /** Push report. */
  push: RunPushReport
  /** Worktree lease report. */
  worktree: RunWorktreeReport
  /** Run start time in ISO 8601 UTC. */
  started_at: string
  /** Wall-clock duration in milliseconds. */
  duration_ms: number
  /** The process exit code this result corresponds to. */
  exit_code: number
}

/** One parsed `dsh run` invocation before defaults are resolved. */
export interface RunRequest {
  /** Target workspace directory (`--cwd`). */
  cwd: string
  /** Task text (`--task`), or `undefined` to take the task from `taskFile` or stdin. */
  task: string | undefined
  /** Task file path (`--task-file`), or `undefined`. */
  taskFile: string | undefined
  /** Session identity to resume (`--session-id`). */
  sessionId: string | undefined
  /** Whether the task still needs reading from stdin (rejected on an interactive terminal). */
  taskFromStdin: boolean
  /** Wall-clock timeout in milliseconds (`--timeout`). */
  timeoutMs: number | undefined
  /** Requested output mode. */
  output: 'json' | 'jsonl'
  /** Whether to lease an isolated worktree (default true when the target is a git repository). */
  worktree: boolean | undefined
  /** Whether to remove the worktree lease at the end of the run (default true). */
  cleanup: boolean | undefined
  /** Whether to push to the target branch after the gate passes. */
  push: boolean
  /** Target branch for merge and push (`--target-branch`). */
  targetBranch: string | undefined
  /** Explicit project test command (`--test-cmd`). */
  testCmd: string | undefined
  /** Caller-declared input price in USD per million tokens (`--price-in-usd-per-mtok`). */
  priceInUsdPerMtok: number | undefined
  /** Caller-declared output price in USD per million tokens (`--price-out-usd-per-mtok`). */
  priceOutUsdPerMtok: number | undefined
  /** Extra `--patch` overlays forwarded to the agent profile boot. */
  patches: string[]
  /** Session identity whose stranded run lease to release (`--abort`). */
  abortSessionId: string | undefined
}

/** The resolved run specification: every default decided in one place. */
export interface RunSpec {
  /** Absolute target workspace directory. */
  cwd: string
  /** The task text to submit. */
  task: string
  /** Session identity to resume, or `undefined` for a fresh `session-<uuid>`. */
  sessionId: string | undefined
  /** Wall-clock timeout in milliseconds, or `undefined` for no bound. */
  timeoutMs: number | undefined
  /** Requested result output mode. */
  output: 'json' | 'jsonl'
  /** Whether the run leases a git worktree. */
  worktree: boolean
  /** Whether the run removes its lease before exit. */
  cleanup: boolean
  /** Whether to push to the target branch after the gate passes. */
  push: boolean
  /** Explicit project test command, or `undefined` to discover it. */
  testCmd: string | undefined
  /** USD per million input tokens, or `undefined` to leave `cost_usd` unknown. */
  priceInUsdPerMtok: number | undefined
  /** USD per million output tokens, or `undefined` to leave `cost_usd` unknown. */
  priceOutUsdPerMtok: number | undefined
  /** Extra `--patch` overlays forwarded to the agent profile boot. */
  patches: string[]
}
