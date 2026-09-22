/**
 * The test-before-push gate for `dsh run`: resolve the project's own test
 * command, then run it and trust only its process exit code. A command that
 * cannot run reports `unavailable`, never `passed`, so the guard can never
 * silently no-op; discovery honours a pinned package manager.
 * @module @deepseek-ai/dsh/run/gate
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The resolved project test command, or its absence or unreadability. */
export type TestSpec =
  | { kind: 'command'; command: string }
  | { kind: 'absent' }
  | { kind: 'unreadable'; error: string }

/** What the gate did. */
export interface GateOutcome {
  /** `absent` when the project declares no test command; `unavailable` when the command could not run at all. */
  status: 'passed' | 'failed' | 'unavailable' | 'absent'
  /** The exact command executed, or `null` when none was resolvable. */
  command: string | null
  /** The command's process exit code, or `null` when it did not run or was killed. */
  exit_code: number | null
  /** True when the wall-clock bound expired and the command was killed. */
  timedOut: boolean
  /** Bounded failure detail for stderr and the result object, or `null` on pass. */
  detail: string | null
}

/** Package managers a `packageManager` pin may name. */
const KNOWN_MANAGERS = new Set(['pnpm', 'npm', 'yarn', 'bun'])

/** Patterns a shell prints when the command's executable itself is missing. */
const MISSING_EXECUTABLE = /is not recognized as an internal or external command|^\S+: (?:command )?not found/m

/** Detail lines kept from a failing command. */
const DETAIL_LINES = 60

/**
 * Resolve the project's test command: `--test-cmd` wins verbatim, otherwise
 * `package.json`'s `test` script runs through the pinned package manager. Only
 * a missing manifest means "declares no test command"; an unreadable or
 * malformed one is reported loudly instead of silently absent.
 * @param cwd - project root to inspect.
 * @param explicit - the `--test-cmd` value, if given.
 * @returns the resolved spec.
 */
export function resolveTestSpec(cwd: string, explicit: string | undefined): TestSpec {
  if (explicit !== undefined) return { kind: 'command', command: explicit }
  let raw: string
  try {
    raw = readFileSync(join(cwd, 'package.json'), 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { kind: 'absent' }
      : { kind: 'unreadable', error: `package.json is unreadable: ${message}` }
  }
  let manifest: { scripts?: Record<string, unknown>; packageManager?: unknown }
  try {
    manifest = JSON.parse(raw) as typeof manifest
  } catch (error) {
    return { kind: 'unreadable', error: `package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (typeof manifest.scripts?.test !== 'string') return { kind: 'absent' }
  return { kind: 'command', command: `${packageManagerOf(manifest.packageManager)} run test` }
}

/** The pinned package manager name, or `npm` when the manifest pins none. */
function packageManagerOf(pin: unknown): string {
  if (typeof pin !== 'string') return 'npm'
  const name = pin.split('@')[0] ?? ''
  return KNOWN_MANAGERS.has(name) ? name : 'npm'
}

/**
 * Run the resolved test command and judge only its exit code. A spawn error, a
 * shell that cannot find the executable, or a timeout reports `unavailable`;
 * any other non-zero exit is `failed`.
 * @param cwd - project root to run in.
 * @param spec - the resolved test spec.
 * @param timeoutMs - wall-clock bound for the command, or `undefined` for none.
 * @returns the gate outcome.
 */
export function runGate(cwd: string, spec: TestSpec, timeoutMs?: number): GateOutcome {
  if (spec.kind === 'absent') return { status: 'absent', command: null, exit_code: null, timedOut: false, detail: null }
  if (spec.kind === 'unreadable') return { status: 'unavailable', command: null, exit_code: null, timedOut: false, detail: spec.error }
  const result = spawnSync(spec.command, {
    cwd,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
    ...timeoutMs === undefined ? {} : { timeout: timeoutMs },
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const detail = output.split('\n').filter(line => line.trim() !== '').slice(-DETAIL_LINES).join('\n')
  const timedOut = result.error !== undefined || result.signal !== null
  if (result.error !== undefined) {
    return { status: 'unavailable', command: spec.command, exit_code: null, timedOut, detail: String(result.error) }
  }
  if (result.signal !== null) {
    return { status: 'unavailable', command: spec.command, exit_code: null, timedOut, detail: `test command killed by ${result.signal}` }
  }
  // Only a shell that cannot find the executable counts as unavailable; a test
  // suite that merely prints "command not found" still failed normally.
  const stderrHead = (result.stderr ?? '').split('\n').slice(0, 2).join('\n')
  if (result.status === 127 || MISSING_EXECUTABLE.test(stderrHead)) {
    return {
      status: 'unavailable',
      command: spec.command,
      exit_code: result.status,
      timedOut: false,
      detail: detail === '' ? 'the test command could not start' : detail,
    }
  }
  if (result.status === 0) return { status: 'passed', command: spec.command, exit_code: 0, timedOut: false, detail: null }
  return { status: 'failed', command: spec.command, exit_code: result.status, timedOut: false, detail: detail === '' ? 'test command failed' : detail }
}
