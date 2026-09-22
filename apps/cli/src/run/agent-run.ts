/**
 * The agent-run plane of `dsh run`: spawn the `dsh` launcher's own headless
 * profile as a child process, feed it the task on stdin, and fold its `--json`
 * event stream into the summary the result object reports. The child owns its
 * agent loop and session; this module never reaches inside it.
 * @module @deepseek-ai/dsh/run/agent-run
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import type { RunUsage } from './types.ts'

/** Why the child's owned turn ended, as the stream reported it. */
export interface AgentTurnEnd {
  /** `turn/end` reason kind. */
  kind: string
  /** Error code the reason carried, or `null`. */
  code: string | null
  /** Error message the reason carried, or `null`. */
  message: string | null
}

/** Everything the child's stream and exit contribute to the run result. */
export interface AgentRunSummary {
  /** Session identity from the opening `session` event, or `null` when none opened. */
  sessionId: string | null
  /** Final answer text from the terminal `final` event, or `null`. */
  answer: string | null
  /** Highest turn number the stream observed, or `null` when no turn started. */
  turns: number | null
  /** Summed per-step reported usage, or `null` when no step reported usage. */
  usage: RunUsage | null
  /** False when any step omitted a usage sample, so `usage` may under-report. */
  usageComplete: boolean
  /** Final `turn/end` reason, or `null` when no turn ended. */
  turnEnd: AgentTurnEnd | null
  /** `error` event message (a failure outside any turn), or `null`. */
  streamError: string | null
  /** Child spawn failure message, or `null`. */
  spawnError: string | null
  /** Child process exit code, or `null` when it never spawned. */
  exitCode: number | null
  /** True when this module killed the child because the timeout expired. */
  timedOut: boolean
  /** True when the caller's interrupt signal killed the child. */
  signalAborted: boolean
}

/** How to spawn the `dsh` launcher for the agent run; tests override it. */
export interface LauncherCommand {
  /** Executable to spawn. */
  execPath: string
  /** Arguments placed before this module's own flags. */
  argsPrefix: readonly string[]
}

/** Options for {@link runAgentChild}. */
export interface AgentRunOptions {
  /** Working directory for the child (the leased worktree). */
  cwd: string
  /** Task text, delivered on stdin. */
  task: string
  /** Session identity to resume, or `undefined` for a fresh session. */
  sessionId: string | undefined
  /** `--patch` overlay paths forwarded to the profile boot. */
  patches: readonly string[]
  /** Wall-clock bound in milliseconds, or `undefined` for none. */
  timeoutMs: number | undefined
  /** Interrupt signal; aborting it kills the child so the caller can keep the run resumable. */
  signal?: AbortSignal | undefined
  /** Launcher command override (tests); defaults to re-spawning this `dsh` installation. */
  launcher?: LauncherCommand | undefined
  /** Receives each parsed `--json` stream line (for `--output jsonl` forwarding). */
  onEvent?: ((line: Record<string, unknown>) => void) | undefined
  /** Receives raw child stderr chunks (the `dsh:` diagnostics and reasoning). */
  onStderr?: ((chunk: string) => void) | undefined
}

/** Accumulated usage across steps, tracking whether every sample is present. */
interface UsageState {
  total: RunUsage | null
  /** False once any step reported no usage sample. */
  complete: boolean
  /** Whether every sample carried the optional buckets. */
  hasReasoning: boolean
  hasCacheRead: boolean
  hasCacheWrite: boolean
  hasTotal: boolean
}

/** One step's usage as carried by a `status`/`step_end` stream line. */
interface StepUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

/**
 * Validate one wire usage sample at the process boundary: every present field
 * must be a finite number, or the sample is disowned rather than summed into
 * `NaN` mid-object.
 * @param value - the raw `usage` field of a `step_end` line.
 * @returns the validated sample, or `undefined`.
 */
function validStepUsage(value: unknown): StepUsage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Partial<StepUsage>
  const count = (field: keyof StepUsage): number | undefined => {
    const raw = candidate[field]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
  }
  const inputTokens = count('inputTokens')
  const outputTokens = count('outputTokens')
  if (inputTokens === undefined || outputTokens === undefined) return undefined
  const totalTokens = count('totalTokens')
  const cacheReadTokens = count('cacheReadTokens')
  const cacheWriteTokens = count('cacheWriteTokens')
  const reasoningTokens = count('reasoningTokens')
  return {
    inputTokens,
    outputTokens,
    ...totalTokens === undefined ? {} : { totalTokens },
    ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
    ...cacheWriteTokens === undefined ? {} : { cacheWriteTokens },
    ...reasoningTokens === undefined ? {} : { reasoningTokens },
  }
}

function addStepUsage(state: UsageState, step: StepUsage): UsageState {
  const total = state.total
  const sum = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined || b === undefined ? undefined : a + b
  const hasReasoning = state.hasReasoning && step.reasoningTokens !== undefined
  const hasCacheRead = state.hasCacheRead && step.cacheReadTokens !== undefined
  const hasCacheWrite = state.hasCacheWrite && step.cacheWriteTokens !== undefined
  const hasTotal = state.hasTotal && step.totalTokens !== undefined
  const next: RunUsage = {
    input_tokens: (total?.input_tokens ?? 0) + step.inputTokens,
    output_tokens: (total?.output_tokens ?? 0) + step.outputTokens,
    reasoning_tokens: hasReasoning ? sum(total?.reasoning_tokens ?? 0, step.reasoningTokens) ?? null : null,
    cache_read_tokens: hasCacheRead ? sum(total?.cache_read_tokens ?? 0, step.cacheReadTokens) ?? null : null,
    cache_write_tokens: hasCacheWrite ? sum(total?.cache_write_tokens ?? 0, step.cacheWriteTokens) ?? null : null,
    total_tokens: hasTotal ? sum(total?.total_tokens ?? 0, step.totalTokens) ?? null : null,
  }
  return { total: next, complete: state.complete, hasReasoning, hasCacheRead, hasCacheWrite, hasTotal }
}

/** Fold one parsed stream line into the summary state. */
function foldLine(record: Record<string, unknown>, summary: AgentRunSummary, usage: UsageState): UsageState {
  if (record.type === 'session' && typeof record.sessionId === 'string') {
    summary.sessionId = record.sessionId
    return usage
  }
  if (record.type === 'final' && typeof record.text === 'string') {
    summary.answer = record.text
    return usage
  }
  if (record.type === 'error' && typeof record.message === 'string') {
    summary.streamError = record.message
    return usage
  }
  if (record.type !== 'status') return usage
  const phase = record.phase
  if (phase === 'turn_start' && typeof record.turn === 'number') {
    summary.turns = Math.max(summary.turns ?? 0, record.turn)
    return usage
  }
  if (phase === 'turn_end') {
    if (typeof record.turn === 'number') summary.turns = Math.max(summary.turns ?? 0, record.turn)
    const reason = record.reason
    if (typeof reason === 'object' && reason !== null) {
      const typed = reason as { kind?: unknown; error?: { code?: unknown; message?: unknown } }
      const error = typed.error
      summary.turnEnd = {
        kind: typeof typed.kind === 'string' ? typed.kind : 'unknown',
        code: typeof error?.code === 'string' ? error.code : null,
        message: typeof error?.message === 'string' ? error.message : null,
      }
    }
    return usage
  }
  if (phase === 'step_end') {
    const stepUsage = validStepUsage(record.usage)
    if (stepUsage === undefined) return { ...usage, complete: false }
    return addStepUsage(usage, stepUsage)
  }
  return usage
}

/**
 * Kill a run's child process and everything it spawned, escalating to a force
 * kill after a grace period so a signal-ignoring child cannot outlive the
 * wall-clock bound.
 * @param child - the agent child process.
 */
function killRun(child: ChildProcess): void {
  if (process.platform === 'win32') {
    // `child.kill()` terminates only the direct child; the shells and test
    // processes it spawned would keep the worktree pinned.
    const killer = spawn('taskkill', ['/pid', String(child.pid ?? ''), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    // EACCES/ENOENT on taskkill falls back to the direct kill below.
    killer.on('error', () => {})
    killer.unref()
  }
  child.kill()
  const escalation = setTimeout(() => { child.kill('SIGKILL') }, 5_000)
  escalation.unref()
}

/**
 * Resolve one module specifier to a cwd-independent value for a child process.
 * `import.meta.resolve` keeps the import condition (for example `tsx/esm`);
 * the CommonJS resolver is the fallback, and an unresolvable specifier is kept
 * verbatim so the child's own diagnostics name it.
 * @param specifier - bare specifier or path from the launcher's execArgv.
 * @returns the resolved absolute specifier, or the input when neither resolver applies.
 */
function resolveSpecifier(specifier: string): string {
  try {
    return import.meta.resolve(specifier)
  } catch {
    // ERR_MODULE_NOT_FOUND: the specifier has no import condition here.
  }
  try {
    return pathToFileURL(createRequire(import.meta.url).resolve(specifier)).href
  } catch {
    // ERR_PACKAGE_PATH_NOT_EXPORTED: the child's spawn error will name the
    // unresolvable specifier.
  }
  return specifier
}

/**
 * Copy this process's execArgv for a child whose working directory is a leased
 * worktree: bare `--import`/`--require` specifiers resolve here, because the
 * worktree of an external repository sits outside the node_modules tree that
 * provides the launcher's loader hooks.
 * @param execArgv - the launcher's own Node flags.
 * @returns the flags with resolvable module specifiers made absolute.
 */
export function resolveExecArgv(execArgv: readonly string[]): string[] {
  const resolved: string[] = []
  const isBare = (value: string): boolean =>
    !value.startsWith('.') && !value.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(value) && !value.includes(':')
  for (const entry of execArgv) {
    const equals = /^--(import|require|loader)=/.exec(entry)
    if (equals !== null) {
      const value = entry.slice(equals[0].length)
      resolved.push(isBare(value) ? `${equals[0]}${resolveSpecifier(value)}` : entry)
      continue
    }
    resolved.push(entry)
  }
  for (let index = 0; index < resolved.length; index += 1) {
    const flag = resolved[index] as string
    const value = resolved[index + 1]
    if (value !== undefined && (flag === '--import' || flag === '--require' || flag === '--loader') && isBare(value)) {
      resolved[index + 1] = resolveSpecifier(value)
      index += 1
    }
  }
  return resolved
}

/**
 * The default launcher command: re-spawn this `dsh` installation exactly as it
 * was started (same Node binary, same loader flags resolved absolutely, same
 * entry script).
 * @returns the launcher command, or `null` when no entry script is resolvable.
 */
function defaultLauncher(): LauncherCommand | null {
  const entry = process.argv[1]
  if (entry === undefined) return null
  return { execPath: process.execPath, argsPrefix: [...resolveExecArgv(process.execArgv), entry] }
}

/**
 * Spawn one headless agent run and fold its stream into a summary.
 * @param options - child working directory, task, resume identity, and bounds.
 * @returns the summary the run result reports.
 */
export async function runAgentChild(options: AgentRunOptions): Promise<AgentRunSummary> {
  const summary: AgentRunSummary = {
    sessionId: null,
    answer: null,
    turns: null,
    usage: null,
    usageComplete: true,
    turnEnd: null,
    streamError: null,
    spawnError: null,
    exitCode: null,
    timedOut: false,
    signalAborted: false,
  }
  const launcher = options.launcher ?? defaultLauncher()
  if (launcher === null) {
    summary.spawnError = 'dsh run: cannot locate the dsh launcher to spawn the agent run'
    return summary
  }
  const args = [
    ...launcher.argsPrefix,
    ...options.patches.flatMap(path => ['--patch', path]),
    '--profile', 'headless',
    '--json',
    ...options.sessionId === undefined ? [] : ['--session-id', options.sessionId],
  ]
  const child = spawn(launcher.execPath, args, {
    cwd: options.cwd,
    env: process.env,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let usage: UsageState = {
    total: null, complete: true, hasReasoning: true, hasCacheRead: true, hasCacheWrite: true, hasTotal: true,
  }
  const lines = createInterface({ input: child.stdout })
  const settled = new Promise<void>((resolveSettled) => {
    child.stderr.on('data', (chunk: Buffer) => { options.onStderr?.(chunk.toString('utf8')) })
    // A spawn failure emits `error` and may never emit `close`; settle on both.
    child.on('error', (error) => {
      summary.spawnError = error.message
      resolveSettled()
    })
    lines.on('line', (line) => {
      if (line.trim() === '') return
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(line) as Record<string, unknown>
      } catch {
        summary.streamError = summary.streamError ?? `unparseable stream line: ${line.slice(0, 200)}`
        return
      }
      options.onEvent?.(parsed)
      usage = foldLine(parsed, summary, usage)
    })
    child.on('close', (code) => {
      summary.exitCode = code
      resolveSettled()
    })
  })
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
    summary.timedOut = true
    killRun(child)
  }, options.timeoutMs)
  const onAbort = (): void => {
    summary.signalAborted = true
    killRun(child)
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  // An EPIPE here is expected when the child exits before reading its task;
  // the error must not crash the run.
  child.stdin.on('error', () => {})
  child.stdin.write(options.task)
  child.stdin.end()
  await settled
  options.signal?.removeEventListener('abort', onAbort)
  if (timer !== undefined) clearTimeout(timer)
  summary.usage = usage.total
  summary.usageComplete = usage.complete
  return summary
}
