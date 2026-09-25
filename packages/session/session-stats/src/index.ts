/**
 * Function plugin registering the session-stats projection units: whole-log
 * turn/step counts and LLM/tool/first-token/decode wall times, plus the
 * bounded per-route model-latency sample ring, served through the
 * session-projection seam (registry snapshot, change feed, and every
 * projection carrier), so clients render full-session figures that paging and
 * compaction cannot change. The plugin owns only the folds; delivery is the
 * seam's.
 *
 * @module @deepseek-ai/dsh-session-stats
 */

import type { Context } from '@deepseek-ai/cordis'
import { modelLatencyProjectionDefinition } from './latency-projection.ts'
import { sessionStatsProjectionDefinition } from './projection.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'session-stats'
/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
export const inject = ['sessionProjections']

/**
 * Register the `sessionStats` and `modelLatency` units; each registration is
 * an effect on this plugin's fiber, so unloading removes both keys.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(sessionStatsProjectionDefinition)
  ctx.sessionProjections.register(modelLatencyProjectionDefinition)
}
