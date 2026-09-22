/**
 * Durable run state for `dsh run`, written under the target repository's
 * documented scratch location (`<git-common-dir>/dsh-scratch/runs/<runId>/`)
 * as the run advances, so a crash or interrupt leaves a record a later
 * `--session-id` run or `--abort` can act on instead of an orphaned worktree.
 * @module @deepseek-ai/dsh/run/state
 */

import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, rmdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { clearJunctions } from './git.ts'

/** Durable record of one `dsh run` invocation. */
export interface RunState {
  /** State schema identifier. */
  schema: 'dsh-run-state/1'
  /** Run identity naming the run directory and worktree branch. */
  run_id: string
  /** Session identity the agent run used, or `null` before the stream reported it. */
  session_id: string | null
  /** Absolute worktree path the run leased, or `null` without worktree isolation. */
  worktree: string | null
  /** Run branch name, or `null` without worktree isolation. */
  branch: string | null
  /** Commit the run's worktree was cut from, or `null` without worktree isolation. */
  base: string | null
  /** Phase the run reached last: `leased`, `agent-running`, or `interrupted` (kept for resume). */
  phase: 'leased' | 'agent-running' | 'interrupted'
}

/**
 * Create the scratch directory for one run and its initial state record.
 * @param commonDir - target repository's common git directory.
 * @param state - the initial state record.
 * @returns the run directory path.
 */
export function writeRunState(commonDir: string, state: RunState): string {
  const runDir = join(commonDir, 'dsh-scratch', 'runs', state.run_id)
  mkdirSync(runDir, { recursive: true })
  persistRunState(runDir, state)
  return runDir
}

/**
 * Overwrite one run's state record, advancing it as the run progresses.
 * @param runDir - the run directory returned by {@link writeRunState}.
 * @param state - the current state record.
 */
export function persistRunState(runDir: string, state: RunState): void {
  writeFileSync(join(runDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/**
 * Read one run's state record.
 * @param runDir - the run directory.
 * @returns the record, or `null` when absent or unreadable JSON.
 */
export function readRunState(runDir: string): RunState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(runDir, 'state.json'), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const state = parsed as Partial<RunState>
    if (state.schema !== 'dsh-run-state/1' || typeof state.run_id !== 'string') return null
    return state as RunState
  } catch {
    return null
  }
}

/**
 * Find the run directory whose state record names `sessionId`, or whose run id
 * names `sessionId` — `--abort` accepts either handle.
 * @param commonDir - target repository's common git directory.
 * @param sessionId - session identity or run identity to match exactly.
 * @returns the run directory path, or `null` when no run recorded the identity.
 */
export function findRunDir(commonDir: string, sessionId: string): string | null {
  const runsDir = join(commonDir, 'dsh-scratch', 'runs')
  let entries: string[]
  try {
    entries = readdirSync(runsDir)
  } catch {
    return null
  }
  for (const entry of entries) {
    const runDir = join(runsDir, entry)
    const state = readRunState(runDir)
    if (state?.session_id === sessionId || state?.run_id === sessionId) return runDir
  }
  return null
}

/**
 * Remove one run's state directory and prune the scratch parents it leaves
 * empty, so a released run contributes no residue to the repository. Junctions
 * are cleared first: Windows recursive deletion follows them into their
 * targets.
 * @param runDir - the run directory to remove.
 */
export function removeRunState(runDir: string): void {
  clearJunctions(runDir)
  rmSync(runDir, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 })
  const runsDir = dirname(runDir)
  for (const dir of [runsDir, dirname(runsDir)]) {
    try {
      rmdirSync(dir)
    } catch (error) {
      // A non-empty scratch directory (another run's lease) or a directory a
      // killed process still holds is expected; anything else is real residue
      // and must surface.
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOTEMPTY' && code !== 'ENOENT' && code !== 'EPERM') throw error
    }
  }
}

/**
 * Mint the run identity for a fresh invocation.
 * @returns a `run-<uuid>` identity.
 */
export function newRunId(): string {
  return `run-${randomUUID()}`
}
