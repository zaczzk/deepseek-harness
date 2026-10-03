/**
 * Milestone transcript row: the title line plus the keyed diagram mark. The
 * mark's visible text is the resolved `mark.*` vocabulary value (a non-null
 * `diagram` resolves by flag, `null` renders `mark.none`); its accessible name
 * is the `node.mark` label, and `node.markTooltip` is the tooltip and aria
 * description for the non-null case only — the `null` case carries no tooltip.
 * Every string this row renders is a keyed `milestone` namespace value.
 */
import { memo } from 'react'
import type { DiagramMark } from '@deepseek-ai/dsh-util-project-register'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MilestoneKey } from './locales.ts'
import css from './MilestoneView.module.css'

type MilestoneViewProps =
  PropsRuntime<'conversation.chat.node', 'milestone'>
  & PropsLocale<'milestone'>

/** resolved mark label for a diagram, or `mark.none` without one. */
function markLabel(mark: DiagramMark | null, t: PropsLocale<'milestone'>['t']): string {
  if (mark === null) return t('mark.none')
  return t(`mark.${mark.flag}` satisfies MilestoneKey)
}

/** tooltip text for a non-null diagram; `undefined` carries no tooltip. */
function markTooltip(mark: DiagramMark | null, t: PropsLocale<'milestone'>['t']): string | undefined {
  if (mark === null) return undefined
  return t('node.markTooltip', { mark: markLabel(mark, t) })
}

/** Accessible label for a non-null diagram mark. */
function markAria(mark: DiagramMark | null, t: PropsLocale<'milestone'>['t']): string | undefined {
  if (mark === null) return undefined
  return t('node.mark')
}

/**
 * One committed project milestone shown in the transcript. The title line
 * interpolates the event's `id` and `title` verbatim; the diagram mark renders
 * beside it per the keyed vocabulary.
 */
export const MilestoneView = memo(function MilestoneView({ node, t }: MilestoneViewProps) {
  const data = node.data
  const title = t('node.title', { id: String(data.id), title: data.title })
  const tooltip = markTooltip(data.diagram, t)
  const aria = markAria(data.diagram, t)
  return (
    <div className={css.view} role="group" aria-label={title}>
      <span className={css.title}>{title}</span>
      <span
        className={css.mark}
        data-milestone-mark={data.diagram === null ? 'none' : data.diagram.flag}
        title={tooltip}
        aria-label={aria}
        aria-description={tooltip}
      >
        {markLabel(data.diagram, t)}
      </span>
    </div>
  )
})
