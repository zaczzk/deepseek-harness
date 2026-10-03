/**
 * The milestone row's session event: the `project/milestone` log record.
 * Declared as a plugin augmentation of {@link SessionEventMap} so the event
 * reaches the model-visible surface, the durable log, and the persistence
 * catalog without editing core's declaration. Log-only — it never joins the
 * ordered surface — and an {@link IgnorableEventType} member, so its envelope
 * carries `ignorable: true` and builds that predate the type still read the log.
 */
import { type Branded, brandString } from '@deepseek-ai/dsh-brand'
import type { DiagramMark } from '@deepseek-ai/dsh-util-project-register'

/**
 * Branded identity of one register milestone row, minted as `M<n>` by the
 * append the event announces. Crosses the boundary between the register file
 * and the session log, so it is branded rather than a bare string.
 */
export type MilestoneRowId = Branded<'MilestoneRowId'>

/** Apply the milestone-row brand to a register row id. */
export const brandMilestoneRow = (id: string): MilestoneRowId => brandString<MilestoneRowId>(id)

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * A register milestone row was committed to its workspace's `DECISIONS.md`,
     * carrying the architecture diagram's state at the milestone and the row's
     * branded `M<n>` identity. Log-only: it records that a row committed so a
     * milestone's recorded title, identity, and diagram evidence are
     * reconstructable from the session log, without joining the surface.
     */
    'project/milestone': {
      /** The row's branded `M<n>` identity, the same id the committed row carries. */
      readonly id: MilestoneRowId
      /** The milestone title, exactly as recorded in the row. */
      readonly title: string
      /** The diagram evidence recorded with the row; null without a diagram source. */
      readonly diagram: DiagramMark | null
    }
  }
}
