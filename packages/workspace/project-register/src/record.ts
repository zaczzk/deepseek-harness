/**
 * Pure milestone logic for the project register: which todo items just became
 * completed milestones, the architecture-diagram evidence recorded with a
 * milestone, its record date, and the register row the milestone becomes. No
 * filesystem, Cordis, or clock access — every input is a parameter.
 */
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/types'
import {
  diagramFingerprint, diagramSource, nextRegisterId,
  type DiagramFlag, type DiagramMark, type RegisterRow,
} from '@deepseek-ai/dsh-util-project-register'

/** The milestone record one append will make: its title and diagram evidence. */
export interface MilestonePlan {
  /** Milestone title: the todo content or goal objective with whitespace trimmed. */
  readonly title: string
  /** Diagram state recorded with the milestone. */
  readonly flag: DiagramFlag
  /** Fingerprint of the diagram source at the milestone, or null without a diagram. */
  readonly fingerprint: string | null
}

/**
 * The milestone titles newly completed by one todo-list snapshot. A milestone
 * is a todo item whose trimmed `content` starts with `marker`
 * case-insensitively; it records once, when it first appears as `completed`
 * while the previously observed list did not already complete it (absent from
 * `previous` counts as not completed). The title is the content with the
 * marker prefix removed and whitespace trimmed; an empty title is skipped.
 * @param previous - the previously observed todo list, or undefined for a
 *   resumed session's first observed list.
 * @param next - the new whole-list snapshot.
 * @param marker - configured milestone prefix, matched against trimmed content.
 * @returns the newly completed milestone titles in `next` order; empty when
 *   `previous` is undefined, because a milestone records only on an observed
 *   transition.
 */
export function completedMilestones(
  previous: readonly TodoItem[] | undefined,
  next: readonly TodoItem[],
  marker: string,
): readonly string[] {
  if (previous === undefined) return []
  const titles: string[] = []
  for (const item of next) {
    const content = item.content.trim()
    if (item.status !== 'completed' || !content.toLowerCase().startsWith(marker.toLowerCase())) continue
    if (previous.some(old => old.content.trim() === content && old.status === 'completed')) continue
    const title = content.slice(marker.length).trim()
    if (title !== '') titles.push(title)
  }
  return titles
}

/**
 * The diagram evidence to record at a milestone, read from the architecture
 * document and compared with the previous milestone's recorded fingerprint.
 * @param architectureText - the `ARCHITECTURE.md` document, or undefined when
 *   the file is absent.
 * @param previous - the previous milestone's diagram evidence, or null when no
 *   milestone row exists yet.
 * @returns `absent` with a null fingerprint without a diagram source; otherwise
 *   the diagram fingerprint with `stale` when it equals `previous`'s recorded
 *   fingerprint (the diagram is unchanged since the last milestone) and
 *   `updated` otherwise.
 */
export function milestoneDiagram(
  architectureText: string | undefined,
  previous: DiagramMark | null,
): { flag: DiagramFlag; fingerprint: string | null } {
  const source = architectureText === undefined ? undefined : diagramSource(architectureText)
  if (source === undefined) return { flag: 'absent', fingerprint: null }
  const fingerprint = diagramFingerprint(source)
  return { flag: previous?.fingerprint === fingerprint ? 'stale' : 'updated', fingerprint }
}

/**
 * The register `Date` cell for one milestone.
 * @param now - the recording time.
 * @returns the UTC calendar date as `YYYY-MM-DD`.
 */
export function milestoneDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The register row for one milestone, with its identity minted from the
 * current document so an existing `M<n>` is never reissued.
 * @param text - the `DECISIONS.md` document before the append, possibly empty.
 * @param title - the milestone title.
 * @param flag - diagram state recorded with the milestone.
 * @param fingerprint - diagram fingerprint, or null without a diagram.
 * @param date - `YYYY-MM-DD` record date.
 * @returns a `done` `milestone` row carrying the diagram evidence and the
 *   next unused `M<n>` identity — an existing identity is never reissued.
 */
export function milestoneRow(
  text: string,
  title: string,
  flag: DiagramFlag,
  fingerprint: string | null,
  date: string,
): RegisterRow {
  return {
    id: nextRegisterId(text, 'milestone'),
    date,
    kind: 'milestone',
    title,
    status: 'done',
    diagram: { flag, fingerprint },
  }
}
