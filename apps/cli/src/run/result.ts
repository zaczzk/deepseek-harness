/**
 * Result-object assembly for `dsh run`: cost computation from caller-declared
 * prices and the single-line stdout write. Unknown values are `null`, never a
 * value that could read as a pass.
 * @module @deepseek-ai/dsh/run/result
 */

import type { DshRunResult, RunUsage } from './types.ts'

/** The stdout sink receiving the one result object. */
export interface ResultSink {
  /** Write one chunk to stdout. */
  write(chunk: string): unknown
}

/**
 * Compute the run's cost at caller-declared per-million-token prices. With no
 * declared prices — or no reported usage — the cost is unknown and `null`.
 * @param usage - summed reported usage, or `null`.
 * @param priceInUsdPerMtok - declared input price, or `undefined`.
 * @param priceOutUsdPerMtok - declared output price, or `undefined`.
 * @returns the cost in USD, or `null` when it cannot be known.
 */
export function computeCostUsd(
  usage: RunUsage | null,
  priceInUsdPerMtok: number | undefined,
  priceOutUsdPerMtok: number | undefined,
): number | null {
  if (usage === null || priceInUsdPerMtok === undefined || priceOutUsdPerMtok === undefined) return null
  const cost = (usage.input_tokens * priceInUsdPerMtok + usage.output_tokens * priceOutUsdPerMtok) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

/**
 * Write the one machine-readable result object: a single line, so a caller
 * reading stdout receives exactly one parseable object and nothing else.
 * @param sink - stdout sink.
 * @param result - the complete result.
 */
export function writeResult(sink: ResultSink, result: DshRunResult): void {
  sink.write(`${JSON.stringify(result)}\n`)
}
