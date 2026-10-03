/**
 * Pure types of the decision-cost domain: the ONE home of the `milestoneCost`
 * projection-key declaration plus its wire view type, free of this package's
 * host-side value imports. The projection table's merge-extensible entry is
 * declared here, so client aggregates and the seat import the key without
 * dragging in cordis or zod.
 *
 * @module @deepseek-ai/dsh-decision-cost/types
 */

// Marks this file a module so the declaration below AUGMENTS the projection
// table instead of declaring an ambient module.
export {}

// Type-only: re-exported so client consumers of this package's projection key
// can name the row identity without taking an edge onto project-register
// directly (ui-decisions resolves ui-decisions → decision-cost →
// workspace/project-register). The `/src/types.ts` subpath is named because
// project-register's index re-exports neither the branded type nor the
// `SessionEventMap` `'project/milestone'` augmentation this package folds (the
// same reason ui-milestone imports the subpath); importing the file also pulls
// that augmentation into the program so the fold's switch narrows to the event.
import type { MilestoneRowId } from '@deepseek-ai/dsh-project-register/src/types.ts'
export type { MilestoneRowId }

/**
 * The `milestoneCost` session projection's client value: this Session's own
 * register milestone rows keyed by their branded `M<n>` identity, each a
 * token figure (`number`) or `null` where the milestone's interval data is
 * missing. The map carries exactly the rows this Session's own
 * `project/milestone` events mint — a row absent from the map is by
 * construction a row this Session does not own — and a key present with a
 * `null` value reads as a real "no figure available", never as a zero.
 */
export interface MilestoneCostProjection
  extends Readonly<Record<MilestoneRowId, number | null>> {}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /**
     * This Session's register milestone rows fold to a derived token figure
     * (the committed usage of the turns from that milestone's event sequence
     * to the next milestone's, or to the session end); `null` when no turn in
     * the milestone's interval records usage. Key absent means the row is a
     * sibling Session's — clients render `cost.unavailable`, never `'—'` and
     * never zero. Decision rows (`D<n>`) appear in no session event and are
     * never in the map — the seat's row-class discriminator renders them
     * `'—'`.
     */
    milestoneCost: MilestoneCostProjection
  }
}
