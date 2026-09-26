/** Session and project token-usage meter: a quiet per-route bar with the compact
 * session total in the Session header's utility row, and a click-open panel of
 * scope totals, latency windows, provider-reported limits, plan, and per-route
 * usage. Renders nothing until the session reports usage. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the `tokenUsage`, `tokenUsageByModel`, and `modelSelection` key merges.
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-token-meter/client'
// Type-only: pulls the `modelLatency` projection key merge.
import type {} from '@deepseek-ai/dsh-session-stats/client'
import { Tooltip, useAnchoredPosition, useDismissOnOutsidePointer, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { UsageInjected, UsageReport } from './contract.ts'
import { NS } from './locales.ts'
import { bucketTotal, deriveUsageTotals, limitPercent, windowLatency, windowLatencyP95, windowLatencyTtft } from './usage.ts'
import { formatLatency, formatLatencyPair, formatLatencyTrio, formatPlanReset, formatRunway, formatTokens } from './format.ts'
import css from './UsageIndicator.module.css'

/** Route tint classes in bar-segment order; each also tints its panel swatch. */
const TINTS = [css.tintA, css.tintB, css.tintC] as const
/** Full props for the Session-header usage meter. */
export type UsageIndicatorProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<UsageInjected>

/** The report state before a first read: no rows, session healthy. */
const UNREPORTED: UsageReport = { limits: [], state: 'ok' }

/**
 * Adapt the usage projections to the header meter and its detail panel.
 * @param props - framework standard seats, the meter's copy seat, and the injected report source.
 * @returns the meter, or null before the session reports usage.
 */
export function UsageIndicator(props: UsageIndicatorProps): React.JSX.Element | null {
  const { sessionId, useProjection, useSessions, useWorkspaces, loadLimits, t } = props
  const split = useProjection('tokenUsageByModel')
  const totals = useProjection('tokenUsage')
  const selection = useProjection('modelSelection')
  const latency = useProjection('modelLatency')
  const byId = useSessions(state => state)
  const workspaces = useWorkspaces(state => state)
  const [report, setReport] = useState<UsageReport>(UNREPORTED)
  const current = selection?.next ?? selection?.lastUsed ?? undefined
  // Windows average at display time over durable sample timestamps: an idle
  // model contributes no samples, so its quiet time never dilutes a figure.
  const latencyWindows = useMemo(() => ({
    recent: windowLatency(latency?.routes, current?.provider, current?.model, Date.now(), 15 * 60_000),
    recentP95: windowLatencyP95(latency?.routes, current?.provider, current?.model, Date.now(), 15 * 60_000),
    recentTtft: windowLatencyTtft(latency?.routes, current?.provider, current?.model, Date.now(), 15 * 60_000),
    hour: windowLatency(latency?.routes, current?.provider, current?.model, Date.now(), 60 * 60_000),
    hourP95: windowLatencyP95(latency?.routes, current?.provider, current?.model, Date.now(), 60 * 60_000),
    hourTtft: windowLatencyTtft(latency?.routes, current?.provider, current?.model, Date.now(), 60 * 60_000),
  }), [latency, current])
  const usage = useMemo(
    () => deriveUsageTotals({ split, totals }, byId, workspaces, sessionId),
    [split, totals, byId, workspaces, sessionId],
  )
  const monthLimit = report.limits.find(limit => limit.period === 'month')
  const monthPercent = monthLimit === undefined ? undefined : limitPercent(monthLimit)
  const limitRows = useMemo(() => report.limits.flatMap((limit) => {
    const percent = limitPercent(limit)
    return percent === undefined ? [] : [{ limit, percent }]
  }), [report])
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | undefined>(undefined)
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

  // Provider reports are not session state: they load with the panel.
  useEffect(() => {
    if (!open || !available) return
    let settled = false
    void loadLimits().then((reported) => {
      if (!settled) setReport(reported)
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
  const latencyNote = latencyWindows.recent === undefined ? '' : ` · ${formatLatency(latencyWindows.recent, t)}`
  const quotaNote = monthPercent === undefined || report.state !== 'ok' ? '' : ` · ${String(monthPercent)}%`
  const ariaLabel = monthPercent === undefined
    ? t('trigger.aria', { tokens: formatTokens(usage.session, t) })
    : t('trigger.aria.quota', { tokens: formatTokens(usage.session, t), percent: monthPercent })
  // A session that met the console's login challenge keeps its rows dark:
  // the one actionable line belongs to the panel's error state.
  const showProvider = report.state === 'ok'
  const routeLabel = (row: { provider: string; model: string }): string =>
    row.provider === '' && row.model === '' ? t('unknown') : `${row.provider}/${row.model}`
  const mixTotal = usage.models.reduce((total, row) => total + bucketTotal(row), 0)
  const segments = usage.models.map((row, index) => ({
    key: `${row.provider}\u0000${row.model}`,
    tint: TINTS[index % TINTS.length],
    width: bucketTotal(row) * 100 / mixTotal,
  }))
  // Ladder: average alone, then its tail, then its first token.
  const latencyValue = (avg: number, p95: number | undefined, ttft: number | undefined): string => {
    if (p95 === undefined) return formatLatency(avg, t)
    return ttft === undefined
      ? formatLatencyPair(avg, p95, t)
      : formatLatencyTrio(avg, p95, ttft, t)
  }
  const rowValue = (rowKey: string, text: string): React.JSX.Element => (
    <dd>
      <span>{text}</span>
      <button
        type="button"
        className={copied === rowKey ? `${css.copy} ${css.copyDone}` : css.copy}
        aria-label={copied === rowKey ? t('row.copied') : t('row.copy')}
        onClick={() => {
          void writeClipboard(text)
          setCopied(rowKey)
        }}
      >
        {copied === rowKey ? '✓' : '⧉'}
      </button>
    </dd>
  )

  return (
    <span ref={rootRef} className={css.root}>
      <Tooltip label={ariaLabel} side="bottom" delayMs={200} disabled={open}>
        <button
          type="button"
          className={css.trigger}
          aria-label={ariaLabel}
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
          <span>{reading}{latencyNote}{quotaNote}</span>
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
          {report.state === 'expired' && <p className={css.expired}>{t('expired.action')}</p>}
          <dl className={css.rows} hidden={report.state === 'expired'}>
            <div className={css.row}>
              <dt>{t('panel.session')}</dt>
              {rowValue('session', reading)}
            </div>
            {usage.project !== undefined && (
              <div className={css.row}>
                <dt>{t('panel.project')}</dt>
                {rowValue('project', t('count', { count: formatTokens(usage.project, t) }))}
              </div>
            )}
            {latencyWindows.recent !== undefined && (
              <div className={css.row}>
                <dt>{t('panel.latency15')}</dt>
                {rowValue('latency15', latencyValue(latencyWindows.recent, latencyWindows.recentP95, latencyWindows.recentTtft))}
              </div>
            )}
            {latencyWindows.hour !== undefined && (
              <div className={css.row}>
                <dt>{t('panel.latency60')}</dt>
                {rowValue('latency60', latencyValue(latencyWindows.hour, latencyWindows.hourP95, latencyWindows.hourTtft))}
              </div>
            )}
            {showProvider && limitRows.map(({ limit, percent }) => {
              const period = limit.period === 'week' ? t('panel.week') : t('panel.month')
              return (
                <div key={limit.period} className={css.row}>
                  <dt>{period}</dt>
                  <dd className={css.limit}>
                    <span
                      className={css.limitBar}
                      role="img"
                      aria-label={t('limit.aria', { percent, period })}
                    >
                      <span className={css.limitFill} style={{ width: `${Math.min(100, percent)}%` }} />
                    </span>
                    <span>{`${percent}%`}</span>
                  </dd>
                </div>
              )
            })}
            {showProvider && report.credits !== undefined && (
              <div className={css.row}>
                <dt>{t('panel.compensation')}</dt>
                {rowValue('compensation', t('count', { count: formatTokens(report.credits.usedTokens, t) }))}
              </div>
            )}
            {showProvider && report.plan !== undefined && (
              <div className={css.row}>
                <dt>{t('panel.plan')}</dt>
                {rowValue('plan', report.plan.name)}
              </div>
            )}
            {showProvider && report.plan !== undefined && (
              <div className={css.row}>
                <dt>{t('panel.resets')}</dt>
                {rowValue('resets', report.plan.burn === undefined
                  ? formatPlanReset(report.plan.resetsAt)
                  : `${formatPlanReset(report.plan.resetsAt)} · ${formatRunway(report.plan.burn.projectedDays, t)}`)}
              </div>
            )}
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
