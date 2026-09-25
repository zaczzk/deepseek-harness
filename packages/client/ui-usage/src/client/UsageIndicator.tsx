/** Session and project token-usage meter: a quiet per-route bar with the compact
 * session total in the Session header's utility row, and a click-open panel of
 * scope totals, provider-reported limits, and per-route usage. Renders nothing
 * until the session reports usage. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the `tokenUsage`, `tokenUsageByModel`, and `modelSelection` key merges.
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { Tooltip, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { UsageInjected, UsageLimit } from './contract.ts'
import { NS } from './locales.ts'
import { bucketTotal, deriveUsageTotals, limitPercent } from './usage.ts'
import { formatTokens } from './format.ts'
import css from './UsageIndicator.module.css'

/** Route tint classes in bar-segment order; each also tints its panel swatch. */
const TINTS = [css.tintA, css.tintB, css.tintC] as const
/** Full props for the Session-header usage meter. */
export type UsageIndicatorProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<UsageInjected>

/**
 * Adapt the usage projections to the header meter and its detail panel.
 * @param props - framework standard seats, the meter's copy seat, and the injected limit source.
 * @returns the meter, or null before the session reports usage.
 */
export function UsageIndicator(props: UsageIndicatorProps): React.JSX.Element | null {
  const { sessionId, useProjection, useSessions, useWorkspaces, loadLimits, t } = props
  const split = useProjection('tokenUsageByModel')
  const totals = useProjection('tokenUsage')
  const selection = useProjection('modelSelection')
  const byId = useSessions(state => state)
  const workspaces = useWorkspaces(state => state)
  const [limits, setLimits] = useState<readonly UsageLimit[]>([])
  const usage = useMemo(
    () => deriveUsageTotals({ split, totals }, byId, workspaces, sessionId),
    [split, totals, byId, workspaces, sessionId],
  )
  const limitRows = useMemo(() => limits.flatMap((limit) => {
    const percent = limitPercent(limit)
    return percent === undefined ? [] : [{ limit, percent }]
  }), [limits])
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const available = usage.session !== undefined && usage.session > 0
  const position = useAnchoredPosition({
    open: open && available,
    anchorRef: rootRef,
    panelRef,
    side: 'bottom',
    gap: 8,
    margin: 12,
  })
  useDismissOnOutsidePointer(rootRef, open && available, setOpen, panelRef)

  // A session that stops reporting usage can leave the meter mid-read; close
  // the now-empty panel instead of presenting stale figures.
  useEffect(() => {
    if (!available && open) setOpen(false)
  }, [available, open])

  // Limits are provider reports, not session state: they load with the panel.
  useEffect(() => {
    if (!open || !available) return
    let settled = false
    void loadLimits().then((reported) => {
      if (!settled) setLimits(reported)
    })
    return () => { settled = true }
  }, [open, available, loadLimits])

  useEffect(() => {
    if (!open || !available) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, available])

  if (usage.session === undefined || usage.session === 0) return null
  const reading = t('count', { count: formatTokens(usage.session, t) })
  const current = selection?.next ?? selection?.lastUsed ?? undefined
  const routeLabel = (row: { provider: string; model: string }): string =>
    row.provider === '' && row.model === '' ? t('unknown') : `${row.provider}/${row.model}`
  const mixTotal = usage.models.reduce((total, row) => total + bucketTotal(row), 0)
  const segments = usage.models.map((row, index) => ({
    key: `${row.provider}\u0000${row.model}`,
    tint: TINTS[index % TINTS.length],
    width: bucketTotal(row) * 100 / mixTotal,
  }))

  const maxPercent = limitRows.reduce((max, r) => Math.max(max, r.percent), 0)
  const isDanger = maxPercent >= 90 || (usage.session !== undefined && usage.session >= 100_000)
  const isWarn = !isDanger && (maxPercent >= 80 || (usage.session !== undefined && usage.session >= 60_000))
  const triggerTone = isDanger ? css.triggerDanger : isWarn ? css.triggerWarn : ''

  return (
    <span ref={rootRef} className={css.root}>
      <Tooltip label={t('trigger.aria', { tokens: formatTokens(usage.session, t) })} side="bottom" delayMs={200} disabled={open}>
        <button
          type="button"
          className={`${css.trigger} ${triggerTone}`.trim()}
          aria-label={t('trigger.aria', { tokens: formatTokens(usage.session, t) })}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
        >
          <span className={css.mix} aria-hidden>
            {segments.length === 0
              ? <span className={css.segment} style={{ width: '100%' }} />
              : segments.map(segment => (
                <span
                  key={segment.key}
                  className={`${css.segment} ${segment.tint}`}
                  style={{ width: `${segment.width}%` }}
                />
              ))}
          </span>
          <span>{reading}</span>
        </button>
      </Tooltip>
      {open && createPortal(
        <div
          ref={panelRef}
          className={css.panel}
          style={position ?? { visibility: 'hidden', left: 0, top: 0 }}
          role="dialog"
          aria-label={t('panel.title')}
        >
          <dl className={css.rows}>
            <div className={css.row}>
              <dt>{t('panel.session')}</dt>
              <dd>{reading}</dd>
            </div>
            {usage.project !== undefined && (
              <div className={css.row}>
                <dt>{t('panel.project')}</dt>
                <dd>{t('count', { count: formatTokens(usage.project, t) })}</dd>
              </div>
            )}
            {limitRows.map(({ limit, percent }) => {
              const period = limit.period === 'week' ? t('panel.week') : t('panel.month')
              const fillTone = percent >= 90 ? css.limitDanger : percent >= 80 ? css.limitWarn : ''
              return (
                <div key={limit.period} className={css.row}>
                  <dt>{period}</dt>
                  <dd className={css.limit}>
                    <span
                      className={css.limitBar}
                      role="img"
                      aria-label={t('limit.aria', { percent, period })}
                    >
                      <span className={`${css.limitFill} ${fillTone}`.trim()} style={{ width: `${Math.min(100, percent)}%` }} />
                    </span>
                    <span>{`${percent}%`}</span>
                  </dd>
                </div>
              )
            })}
          </dl>
          {usage.models.length > 1 && (
            <dl className={css.rows}>
              {usage.models.map((row, index) => (
                <div
                  key={`${row.provider}\u0000${row.model}`}
                  className={current !== undefined && current.provider === row.provider && current.model === row.model
                    ? `${css.row} ${css.rowCurrent}`
                    : css.row}
                >
                  <dt>
                    <span className={`${css.swatch} ${TINTS[index % TINTS.length]}`} aria-hidden />
                    {routeLabel(row)}
                  </dt>
                  <dd>{t('count', { count: formatTokens(bucketTotal(row), t) })}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>,
        document.body,
      )}
    </span>
  )
}
