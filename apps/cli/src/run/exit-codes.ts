/**
 * Contractual process exit codes for `dsh run`. A caller that would act
 * differently for two outcomes must be able to branch on the exit code alone;
 * `outcome` and `error.code` in the result object carry the detail.
 * @module @deepseek-ai/dsh/run/exit-codes
 */

/** The documented `dsh run` exit codes. */
export const RUN_EXIT = {
  /** The task completed; when push was requested, the gate passed and the push succeeded. */
  SUCCESS: 0,
  /** The agent ran but the turn did not complete (provider or tool failure, rate limiting excluded). */
  TASK_FAILED: 1,
  /** The invocation was invalid and nothing ran. */
  USAGE: 2,
  /** The run could not start: boot failure, missing or invalid credential, unusable `--session-id`, or a worktree that could not be leased. */
  COULD_NOT_START: 3,
  /** The project's test command ran and exited non-zero. Nothing was pushed. */
  TESTS_FAILED: 4,
  /** The project's test command is undeclared with `--push`, or could not run (missing interpreter or dependencies). Nothing was pushed. */
  TESTS_UNAVAILABLE: 5,
  /** The tests passed but delivery failed: merge conflict or push rejection. */
  DELIVERY_FAILED: 6,
  /** The provider rate-limited the run; retrying later is the caller's decision. */
  RATE_LIMITED: 7,
  /** The wall-clock timeout expired; the run's worktree lease is kept and `--session-id` resumes it. */
  TIMEOUT: 124,
  /** An interrupt signal stopped the run; the run's worktree lease is kept and `--session-id` resumes it. */
  INTERRUPTED: 130,
} as const
