/**
 * Function plugin registering the `milestoneCost` projection unit: a
 * per-session fold of a Session's own `project/milestone` events and its
 * usage records into a MilestoneRowId-keyed figure map, served through the
 * session-projection seam (registry snapshot, change feed, and every
 * projection carrier) so a Workspace register renders a derived cost per
 * milestone row. The plugin owns only the fold; delivery is the seam's.
 *
 * @module @deepseek-ai/dsh-decision-cost
 */

import type { Context } from '@deepseek-ai/cordis'
import { milestoneCostProjectionDefinition } from './projection.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'decision-cost'
/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
export const inject = ['sessionProjections']

/**
 * Register the `milestoneCost` unit; the registration is an effect on this
 * plugin's fiber, so unloading removes the key.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(milestoneCostProjectionDefinition)
}
