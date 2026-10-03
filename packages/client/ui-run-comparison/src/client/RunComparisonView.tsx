/**
 * The Run comparison conversation view body: two pickers over the
 * session-query roster (side A the baseline, side B the comparison) and the
 * six-metric table folded from the two picked runs' recorded logs, or the
 * one line saying why the comparison is not showing. Work reads arrive
 * through the injected face, which drives the store; the view only asks and
 * renders the store's lifecycle.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import type { RunMetrics } from './metrics.ts'
import type { RunComparisonInjected } from './face.ts'
import type { RunComparisonStore, RunSideState } from './store.ts'
import type { RunComparisonKey } from './locales.ts'
import css from './RunComparisonView.module.css'

/** Full props of the Run comparison view body. */
export type RunComparisonViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsStore<RunComparisonStore>
  & InjectFace<RunComparisonInjected>
  & PropsLocale<'runComparison'>

/** Same-shape zero metrics used only before both sides resolve (never rendered alone). */
const ZERO_METRICS: RunMetrics = {
  turns: 0, toolCalls: 0, inputTokens: null, outputTokens: null, wallClockMs: null, failures: 0,
}

/** One pickable run as a wish to qualify, worked into a Menu entry. */
export interface QualifyingRun {
  /** The run's session id. */
  id: SessionId
  /**
   * Display label: the run's session id — the only stable durable identity
   * the roster record carries (the Session header has no human title field).
   */
  title: string
  /** Whether the run is `persisted` (a readable log exists). */
  persisted: boolean
}

/**
 * Compute the current Session's Workspace membership, so side B's picker can
 * be scoped to the Sessions that Session's caller may inspect.
 * @param items - the registered Workspaces' session memberships.
 * @param sessionId - the view's own Session.
 * @returns the Workspace's session ids, or an empty set when unknown.
 */
export function workspaceSessionIds(
  items: WorkspaceSnapshot['items'],
  sessionId: SessionId,
): ReadonlySet<string> {
  const ws = items.find(w => w.sessionIds.includes(sessionId))
  return new Set(ws?.sessionIds ?? [])
}

/**
 * Reduce a roster into the pickable runs scoped to one Workspace.
 * @param records - the session-query roster.
 * @param scope - the Workspace's session ids.
 * @returns qualifying runs, newest first, limited to the scope.
 */
export function qualifyingRuns(
  records: readonly SessionRecord[],
  scope: ReadonlySet<string>,
): QualifyingRun[] {
  return records
    .filter(r => scope.has(r.header.id))
    .map(r => ({ id: r.header.id, title: r.header.id, persisted: r.persisted }))
}

/** The six metric rows in display order, each a locale key. */
const METRIC_ROWS: readonly RunComparisonKey[] = [
  'metric.turns',
  'metric.toolCalls',
  'metric.inputTokens',
  'metric.outputTokens',
  'metric.wallClock',
  'metric.failures',
]

/** Format a measured figure, or the unavailable label for `null`. */
function figure(value: number | null, t: (key: RunComparisonKey) => string): ReactNode {
  return value === null ? t('metric.unavailable') : String(value)
}

/**
 * Render the Run comparison view.
 * @param props - composed slot props.
 * @returns the pickers and metric table, or one status line.
 */
export function RunComparisonView({
  sessionId, useWorkspaces, useStore, t,
  loadRoster, pick, retryRoster, retryRead,
}: RunComparisonViewProps): ReactNode {
  // The scope of the Sessions this caller may inspect: the Workspace that
  // owns the view's own Session.
  const workspaces = useWorkspaces((s: WorkspaceSnapshot) => s.items)
  const scope = useMemo(() => workspaceSessionIds(workspaces, sessionId), [workspaces, sessionId])
  const roster = useStore(s => s.roster)
  const records = useStore(s => s.records)
  const sideA = useStore(s => s.sideA)
  const sideB = useStore(s => s.sideB)

  const runs = useMemo(() => qualifyingRuns(records, scope), [records, scope])
  const sideAId = sideA.sessionId
  const sideBId = sideB.sessionId

  // Load the roster when it is still idle (first render); the face serialises
  // reads and the store holds the lifecycle, so a later re-read can never
  // overwrite a newer one.
  useEffect(() => {
    if (roster !== 'idle') return
    loadRoster()
  }, [roster, loadRoster])

  // Side A defaults to the view's own Session when it qualifies; the pick is
  // issued once per roster activation (no loop while the read settles).
  const defaulted = useRef(false)
  useEffect(() => {
    if (roster !== 'ready' || sideAId !== null || defaulted.current) return
    defaulted.current = true
    if (runs.some(r => r.id === sessionId)) {
      pick('a', sessionId)
    }
  }, [roster, sideAId, runs, sessionId, pick])

  const [openA, setOpenA] = useState(false)
  const [openB, setOpenB] = useState(false)

  // Mutual exclusion in both directions: a picker never offers the Session the
  // other side currently holds, so two sides can never land on one log.
  const aItems = runs
    .filter(r => r.id !== sideBId)
    .map(r => ({ id: r.id, label: r.title, disabled: !r.persisted }))
  const bItems = runs
    .filter(r => r.id !== sideAId)
    .map(r => ({ id: r.id, label: r.title, disabled: !r.persisted }))

  // Picker values, rendered as the current pick's title or the prompt.
  const pickerValue = (side: QualifyingRun | undefined, fallback: RunComparisonKey): string =>
    side === undefined ? t(fallback) : side.title

  const header = (
    <div className={css.header}>
      <span className={css.tab}>{t('view.tab')}</span>
      <div className={css.pickRow}>
        <Menu
          open={openA}
          onClose={() => { setOpenA(false) }}
          items={aItems}
          selectedId={sideAId ?? undefined}
          onSelect={(id) => { pick('a', id); setOpenA(false) }}
          align="start"
          anchor={(
            <button type="button" className={css.picker} aria-haspopup="menu" aria-expanded={openA} onClick={() => { setOpenA(v => !v) }}>
              {pickerValue(runs.find(r => r.id === sideAId), 'picker.baseline')}
              <IconChevronDownOutlineRegular className={css.chevron} />
            </button>
          )}
        />
        <Menu
          open={openB}
          onClose={() => { setOpenB(false) }}
          items={bItems}
          selectedId={sideBId ?? undefined}
          onSelect={(id) => { pick('b', id); setOpenB(false) }}
          align="start"
          anchor={(
            <button type="button" className={css.picker} aria-haspopup="menu" aria-expanded={openB} onClick={() => { setOpenB(v => !v) }}>
              {pickerValue(runs.find(r => r.id === sideBId), 'picker.comparison')}
              <IconChevronDownOutlineRegular className={css.chevron} />
            </button>
          )}
        />
        {/* Either picker's open state shows the disabled-pick reason at its foot. */}
        {(openA || openB) && <span className={css.reason}>{t('reason.disabled')}</span>}
      </div>
    </div>
  )

  const rowState = (side: RunSideState, sideKey: 'a' | 'b'): ReactNode => {
    /* v8 ignore next -- the :226 either-side-loading guard exits before rowState reads a side, so it never sits on 'loading' */
    if (side.status === 'loading') return <p className={css.status} data-run-comparison-state="loading">{t('loading')}</p>
    if (side.status === 'failed') {
      return (
        <p className={css.status} data-run-comparison-state="failed">
          <span>{t('error.read')}</span>
          <button
            type="button"
            className={css.retry}
            data-run-comparison-retry={sideKey}
            onClick={() => { retryRead(sideKey) }}
          >
            {side.retrying ? t('loading') : t('retry')}
          </button>
        </p>
      )
    }
    if (side.metrics !== undefined && side.metrics.turns === 0) {
      return <p className={css.status} data-run-comparison-state="noTurns">{t('empty.noTurns')}</p>
    }
    return null
  }

  const body = (): ReactNode => {
    if (roster === 'idle' || roster === 'loading') {
      return <p className={css.status} data-run-comparison-state="rosterLoading">{t('picker.pending')}</p>
    }
    if (roster === 'failed') {
      return (
        <p className={css.status} data-run-comparison-state="rosterFailed">
          <span>{t('picker.error.read')}</span>
          <button type="button" className={css.retry} data-run-comparison-roster-retry onClick={retryRoster}>
            {t('picker.retry')}
          </button>
        </p>
      )
    }
    // Ready: fewer than two qualifying runs shows the roster-empty claim.
    if (runs.length < 2) {
      return <p className={css.status} data-run-comparison-state="noRun">{t('empty.noRun')}</p>
    }
    // Side A unselected takes precedence over side B when both are unselected.
    if (sideAId === null) {
      return <p className={css.status} data-run-comparison-state="noBaseline">{t('empty.noBaseline')}</p>
    }
    if (sideBId === null) {
      return <p className={css.status} data-run-comparison-state="noSelection">{t('empty.noSelection')}</p>
    }
    // One side still loading: no metric labels, so no figure renders half-joined.
    if (sideA.status === 'loading' || sideB.status === 'loading') {
      return <p className={css.status} data-run-comparison-state="loading">{t('loading')}</p>
    }
    const aError = rowState(sideA, 'a')
    const bError = rowState(sideB, 'b')
    if (aError !== null || bError !== null) {
      return <div className={css.statuses}>{aError}{bError}</div>
    }
    const mA = sideA.metrics ?? ZERO_METRICS
    const mB = sideB.metrics ?? ZERO_METRICS
    return (
      <table className={css.table}>
        <thead>
          <tr>
            <th className={css.head} />
            <th className={css.head}>{t('picker.baseline')}</th>
            <th className={css.head}>{t('picker.comparison')}</th>
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((key) => {
            const valueA = metricValue(key, mA)
            const valueB = metricValue(key, mB)
            return (
              <tr key={key} className={css.row}>
                <td className={css.cell}>{t(key)}</td>
                <td className={css.cell} data-run-comparison-a={key}>{figure(valueA, t)}</td>
                <td className={css.cell} data-run-comparison-b={key}>{figure(valueB, t)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <div className={css.view}>
      {header}
      {body()}
    </div>
  )
}

/** Pull one metric's figure from a side's fold for the table. */
function metricValue(key: RunComparisonKey, m: RunMetrics): number | null {
  switch (key) {
    case 'metric.turns': return m.turns
    case 'metric.toolCalls': return m.toolCalls
    case 'metric.inputTokens': return m.inputTokens
    case 'metric.outputTokens': return m.outputTokens
    case 'metric.wallClock': return m.wallClockMs
    case 'metric.failures': return m.failures
    /* v8 ignore next -- only the six METRIC_ROWS keys reach metricValue */
    default: return null
  }
}