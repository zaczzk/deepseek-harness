/**
 * The Decisions view body: the workspace's `DECISIONS.md` decision register,
 * newest first, or the one line saying why it is not showing. Metadata
 * arrives through the standard `useResource` hook; register text is the
 * store's, so a body coming back to its tab re-renders nothing until the
 * document changes.
 */
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
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
import css from './DecisionsView.module.css'

/** Full props of the Decisions view body. */
export type DecisionsViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsStore<RegisterStore>
  & InjectFace<RegisterInjected>
  & PropsLocale<'decisions'>

/**
 * Render the decision register table with its milestone diagram status.
 * @param props - composed slot props.
 * @returns the register table, or one status line.
 */
export function DecisionsView({
  sessionId, useResource, useStore, loadRegister, t,
}: DecisionsViewProps): ReactNode {
  const meta = useResource<'file'>(sessionFileAddress(sessionId, REGISTER_FILE))
  const doc = useStore(state => state.doc)

  // One read per observed metadata version: a failed read keeps its
  // observedVersion and is not retried until the file moves again.
  useEffect(() => {
    const version = meta.value?.version
    if (meta.status !== 'live' || version === undefined || doc.observedVersion === version) return
    loadRegister(version)
  }, [meta.status, meta.value?.version, doc.observedVersion, loadRegister])

  const rows = useMemo(() => doc.text === undefined ? [] : parseRegister(doc.text), [doc.text])
  const milestone = latestMilestone(rows)

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
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    return <p className={css.status} data-decisions-state="loading">{t('loading')}</p>
  }

  return <div className={css.view}>{body()}</div>
}
