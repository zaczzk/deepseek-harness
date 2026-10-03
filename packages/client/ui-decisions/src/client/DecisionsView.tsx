/**
 * The Decisions view body: the workspace's `DECISIONS.md` decision register,
 * newest first, or the one line saying why it is not showing. Metadata
 * arrives through the standard `useResource` hook; register text is the
 * store's, so a body coming back to its tab re-renders nothing until the
 * document changes. Each milestone row's Cost cell reads this Session's own
 * `milestoneCost` projection through the standard `useProjection` seat, so a
 * figure always pairs with the register row already on screen and never
 * invents a cost it cannot support.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  type MilestoneCostProjection, type MilestoneRowId,
} from '@deepseek-ai/dsh-decision-cost/client'
// Type-only: the `file` ResourceProtocolMap merge behind `useResource<'file'>`.
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import {
  latestMilestone, parseRegister, REGISTER_FILE,
  type DiagramMark,
} from '@deepseek-ai/dsh-util-project-register'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { RegisterInjected } from './face.ts'
import type { RegisterStore } from './store.ts'
import type { DecisionsKey } from './locales.ts'
import css from './DecisionsView.module.css'

/** Full props of the Decisions view body. */
export type DecisionsViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsStore<RegisterStore>
  & InjectFace<RegisterInjected>
  & PropsLocale<'decisions'>

/** The register's own state as the copy control holds it. */
type CopyState = 'idle' | 'copied' | 'denied'

/** Milliseconds a copy result stays on the button before it reverts to idle. */
const COPY_FEEDBACK_MS = 2_000

/** The button label each copy state carries. */
const COPY_LABEL: Record<CopyState, DecisionsKey> = {
  idle: 'action.copy',
  copied: 'action.copied',
  denied: 'action.copyDenied',
}

/**
 * A register row's Cost cell, one of the item-9 five renders: pre-resolution
 * shows the pending marker and no figure; a milestone row this Session mints
 * shows the figure (or the unavailable label where the fold value is `null`);
 * a decision row shows the placeholder `'—'`; a cross-Session milestone row
 * shows the unavailable label; a failed read shows `cost.error.read`.
 * @param rowId - the register row's `M<n>` or `D<n>` identity.
 * @param kind - the row's decision-or-milestone class.
 * @param projection - this Session's `milestoneCost` map when resolved.
 * @param readState - the Session's projection-read lifecycle.
 * @param t - the bound `decisions` translator.
 * @returns the cell node.
 */
export function costCell(
  rowId: string,
  kind: 'decision' | 'milestone',
  projection: MilestoneCostProjection | undefined,
  readState: 'idle' | 'loading' | 'ready' | 'error' | undefined,
  t: (key: DecisionsKey) => string,
): ReactNode {
  // A decision row (`D<n>`) appears in no session event, so it has no join
  // key and no interval; it keeps the placeholder from the first render.
  if (kind === 'decision') {
    return <span className={css.none} data-decisions-cost="decision">{t('diagram.none')}</span>
  }
  // A failed projection read: this Session's figures all come from the one
  // read, so the cell reads the labelled failure and the single failed-read
  // strip carries the one Retry (rendered once, below the rows).
  if (readState === 'error') {
    return <span className={css.costError} data-decisions-cost="error">{t('cost.error.read')}</span>
  }
  // Pre-resolution: the projection has not yet arrived, so no figure exists
  // to show; the shipped `loading` marker stands in on figure-bearing rows.
  if (projection === undefined) {
    return <span className={css.pending} data-decisions-cost="pending">{t('loading')}</span>
  }
  const figure = projection[rowId as MilestoneRowId]
  // A present `null` (the milestone's interval data is missing) or an absent
  // key (a sibling Session's milestone row — this map mints only this
  // Session's rows) both render the labelled unavailable figure, never `'—'`
  // and never a zero that would read as a cost claim.
  if (figure === undefined || figure === null) {
    return <span className={css.unavailable} data-decisions-cost="unavailable">{t('cost.unavailable')}</span>
  }
  return (
    <span className={css.cost} data-decisions-cost={figure}>
      <span className={css.figure}>{figure}</span>
      <span className={css.estimate}>{t('cost.estimate')}</span>
    </span>
  )
}

/**
 * Render the decision register table with its milestone diagram status.
 * @param props - composed slot props.
 * @returns the register table, or one status line.
 */
export function DecisionsView({
  sessionId, useResource, useStore, useProjection, useSessions,
  loadRegister, retryCost, t,
}: DecisionsViewProps): ReactNode {
  const meta = useResource<'file'>(sessionFileAddress(sessionId, REGISTER_FILE))
  const doc = useStore(state => state.doc)
  // This Session's milestone→token figure map. `undefined` uniformly means
  // "capability absent" — before the baseline carries the key (pre-resolution)
  // or after a rejected read, which the lifecycle below surfaces.
  const projection = useProjection('milestoneCost')
  // The projection read lifecycle distinguishes a rejected read from a value
  // that has not arrived; the store keeps the last value across a re-read, so
  // the read's own state is the only honest failed-read signal.
  const readState = useSessions(list => list.projectionsBySession[sessionId]?.state)
  const [copy, setCopy] = useState<CopyState>('idle')

  // One read per observed metadata version: a failed read keeps its
  // observedVersion and is not retried until the file moves again.
  useEffect(() => {
    const version = meta.value?.version
    if (meta.status !== 'live' || version === undefined || doc.observedVersion === version) return
    loadRegister(version)
  }, [meta.status, meta.value?.version, doc.observedVersion, loadRegister])

  const rows = useMemo(() => doc.text === undefined ? [] : parseRegister(doc.text), [doc.text])
  const milestone = latestMilestone(rows)
  const text = doc.text

  // The register document is already the Markdown a reviewer wants, so the
  // control copies the file text rather than re-rendering the table.
  const onCopy = useCallback(async (text: string) => {
    setCopy(await writeClipboard(text) ? 'copied' : 'denied')
  }, [])

  useEffect(() => {
    if (copy === 'idle') return
    const timer = setTimeout(() => { setCopy('idle') }, COPY_FEEDBACK_MS)
    return () => { clearTimeout(timer) }
  }, [copy])

  const diagramCell = (mark: DiagramMark | null): ReactNode => {
    if (mark === null) return <span className={css.none}>{t('diagram.none')}</span>
    return (
      <span className={clsx(css.chip, css[mark.flag])} data-decisions-diagram={mark.flag}>
        {t(`diagram.${mark.flag}`)}
      </span>
    )
  }

  const body = (): ReactNode => {
    if (doc.status === 'failed') {
      if (doc.failureCode === 'workspace-file/not-found') {
        return <p className={css.status} data-decisions-state="missing">{t('error.missing')}</p>
      }
      return (
        <p className={css.status} data-decisions-state="failed">
          <span>{t('error.read')}</span>
          <button
            type="button"
            className={css.retry}
            data-decisions-retry
            onClick={() => { loadRegister(doc.observedVersion ?? '') }}
          >
            {t('retry')}
          </button>
        </p>
      )
    }
    if (doc.status === 'ready') {
      if (rows.length === 0) return <p className={css.status} data-decisions-state="empty">{t('empty')}</p>
      return (
        <table className={css.table}>
          <thead>
            <tr>
              <th className={css.head}>{t('column.id')}</th>
              <th className={css.head}>{t('column.date')}</th>
              <th className={css.head}>{t('column.kind')}</th>
              <th className={css.head}>{t('column.title')}</th>
              <th className={css.head}>{t('column.status')}</th>
              <th className={css.head}>{t('column.diagram')}</th>
              <th className={css.head}>{t('column.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {/* File order is oldest first; the table reads newest first. */}
            {[...rows].reverse().map(row => (
              <tr
                key={row.id}
                className={css.row}
                data-decisions-latest={row.id === milestone?.id ? '' : undefined}
              >
                <td className={css.cell}>{row.id}</td>
                <td className={css.cell}>{row.date}</td>
                <td className={css.cell}><span className={css.chip}>{t(`kind.${row.kind}`)}</span></td>
                <td className={css.cell}>{row.title}</td>
                <td className={css.cell}><span className={css.chip}>{t(`status.${row.status}`)}</span></td>
                <td className={css.cell}>{diagramCell(row.diagram)}</td>
                <td className={css.cell}>{costCell(row.id, row.kind, projection, readState, t)}</td>
              </tr>
            ))}
            {/* The projection read fails as a unit for every one of this
                Session's figure cells, so the one failed-read strip (with the
                one Retry) stands in place of the figure column. */}
            {readState === 'error' && retryCost !== undefined && (
              <tr className={css.failedStrip} data-decisions-cost-failed>
                <td className={css.cell} colSpan={7}>
                  <span className={css.costError}>{t('cost.error.read')}</span>
                  <button
                    type="button"
                    className={css.retry}
                    data-decisions-cost-retry
                    onClick={retryCost}
                  >
                    {t('retry')}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )
    }
    return <p className={css.status} data-decisions-state="loading">{t('loading')}</p>
  }

  return (
    <div className={css.view}>
      {doc.status === 'ready' && text !== undefined && (
        <div className={css.bar}>
          <button
            type="button"
            className={css.copy}
            data-decisions-copy={copy}
            onClick={() => { void onCopy(text) }}
          >
            {t(COPY_LABEL[copy])}
          </button>
        </div>
      )}
      {body()}
    </div>
  )
}
