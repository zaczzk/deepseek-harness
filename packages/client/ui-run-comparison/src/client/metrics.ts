/**
 * The run-comparison metric fold: six per-run figures computed over one
 * recorded raw event log with the same rule for both sides. Values are the
 * wire event envelope's `SessionQueryWireEvent` records, whose `data` is
 * validated JSON — the fold reads it defensively and never throws on a
 * malformed event.
 *
 * Absence rule (the item-9 unavailable-not-zero rule, applied per metric):
 * counts over recorded events are `0` when none gathered (a run that never
 * called a tool has zero tool calls); measured quantities are `null` when
 * their measurement source was absent (no usage record → no token figure; no
 * first/last event pair → no wall-clock). A `null` renders the locale-owned
 * unavailable label, never a zero that would read as a measurement.
 *
 * @module @deepseek-ai/dsh-client-ui-run-comparison/client/metrics
 */
import type {
  SessionQueryReadValue,
  SessionQueryWireEvent,
} from '@deepseek-ai/dsh-api-session-query-controller/types'

/** The six per-run comparison figures for one side. */
export interface RunMetrics {
  /** Distinct committed turns (distinct `turn` values seen on a transported event). */
  turns: number
  /** Number of `tool/call` events in the log. */
  toolCalls: number
  /** Summed input-side usage (input + cache read + cache write) over transported usage records, or `null`. */
  inputTokens: number | null
  /** Summed output tokens over transported usage records, or `null`. */
  outputTokens: number | null
  /** Elapsed wall time (last − first event timestamp), or `null` with fewer than two events. */
  wallClockMs: number | null
  /** Error events (committed-no-surface `assistant/attempt`) plus denied tool results (`tool/result` with `isError`). */
  failures: number
}

/** Events the fold reports as failures: a settled attempt that committed no surface message. */
const ERROR_EVENT_TYPES: ReadonlySet<string> = new Set(['assistant/attempt'])

/** Extract an object field value from the JSON-bounded event data, or `undefined`. */
function field(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  return (data as Record<string, unknown>)[key]
}

/** Read a non-negative finite number field, or `undefined`. */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** True when the `isError` marker on a tool-result message is present and truthy. */
function isDeniedMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return false
  return (message as Record<string, unknown>).isError === true
}

/**
 * Fold one recorded log's wire events into the six per-run metrics.
 * @param snapshot - one bounded read of the side's complete raw event log.
 * @returns the six figures, with measured quantities `null` when their source was absent.
 */
export function foldMetrics(snapshot: SessionQueryReadValue): RunMetrics {
  let toolCalls = 0
  let failures = 0
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  let firstTime: number | undefined
  let lastTime: number | undefined
  const turns = new Set<number>()

  for (const event of snapshot.events) {
    const data = event.data
    const turn = num(field(data, 'turn'))
    if (turn !== undefined) turns.add(turn)

    if (event.type === 'tool/call') {
      toolCalls += 1
      continue
    }
    if (event.type === 'tool/result') {
      if (isDeniedMessage(field(data, 'message'))) failures += 1
      continue
    }
    if (ERROR_EVENT_TYPES.has(event.type)) {
      failures += 1
    }
    // A transported assistant-message usage record feeds the token metrics.
    if (event.type === 'assistant/message') {
      const usage = field(data, 'usage')
      if (typeof usage === 'object' && usage !== null && !Array.isArray(usage)) {
        const inTokens = num(field(usage, 'inputTokens'))
        const cacheRead = num(field(usage, 'cacheReadTokens'))
        const cacheWrite = num(field(usage, 'cacheWriteTokens'))
        const outTokens = num(field(usage, 'outputTokens'))
        if (inTokens !== undefined) inputTokens = (inputTokens ?? 0) + inTokens
        if (cacheRead !== undefined) inputTokens = (inputTokens ?? 0) + cacheRead
        if (cacheWrite !== undefined) inputTokens = (inputTokens ?? 0) + cacheWrite
        if (outTokens !== undefined) outputTokens = (outputTokens ?? 0) + outTokens
      }
    }

    if (event.time <= -1) continue
    if (firstTime === undefined || event.time < firstTime) firstTime = event.time
    if (lastTime === undefined || event.time > lastTime) lastTime = event.time
  }

  const wallClock = firstTime !== undefined && lastTime !== undefined && lastTime > firstTime
    ? lastTime - firstTime
    : undefined

  return {
    turns: turns.size,
    toolCalls,
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    wallClockMs: wallClock ?? null,
    failures,
  }
}

/** Convenience re-export so a caller can type one wire event without the long import. */
export type { SessionQueryWireEvent as RunWireEvent }