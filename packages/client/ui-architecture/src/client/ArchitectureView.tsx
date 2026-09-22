/**
 * The Architecture view body: the workspace's current architecture diagram, or
 * the reason it is not showing. Metadata arrives through the standard
 * `useResource` hook; document text and the rendered SVG are the store's, so a
 * body coming back to its tab re-renders nothing until a document changes.
 * Status is carried by the strip's chip; a stale diagram earns one action line.
 */
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the 'file' ResourceProtocolMap row (declared by the workspace
// Files client face) must be in the program for useResource<'file'> to type.
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import {
  ARCHITECTURE_FILE,
  diagramFreshness, diagramSource, latestMilestone, parseRegister,
} from '@deepseek-ai/dsh-util-project-register'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { ArchitectureInjected } from './face.ts'
import type { ArchitectureStore } from './store.ts'
import css from './ArchitectureView.module.css'

/** Full props of the Architecture view body. */
export type ArchitectureViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsStore<ArchitectureStore>
  & InjectFace<ArchitectureInjected>
  & PropsLocale<'architecture'>

/**
 * Render the current architecture diagram with its milestone diagram status.
 * @param props - composed slot props.
 * @returns the diagram with its status strip, or one status line.
 */
export function ArchitectureView({
  sessionId, useResource, useStore, loadArchitecture, loadRegister, renderDiagram, t,
}: ArchitectureViewProps): ReactNode {
  const meta = useResource<'file'>(sessionFileAddress(sessionId, ARCHITECTURE_FILE))
  const registerMeta = useResource<'file'>(sessionFileAddress(sessionId, 'DECISIONS.md'))
  const architecture = useStore(state => state.architecture)
  const register = useStore(state => state.register)
  const render = useStore(state => state.render)

  // One read per observed metadata version: a failed read keeps its
  // observedVersion and is not retried until the file moves again.
  useEffect(() => {
    const version = meta.value?.version
    if (meta.status !== 'live' || version === undefined || architecture.observedVersion === version) return
    loadArchitecture(version)
  }, [meta.status, meta.value?.version, architecture.observedVersion, loadArchitecture])
  useEffect(() => {
    const version = registerMeta.value?.version
    if (registerMeta.status !== 'live' || version === undefined || register.observedVersion === version) return
    loadRegister(version)
  }, [registerMeta.status, registerMeta.value?.version, register.observedVersion, loadRegister])

  const source = useMemo(
    () => architecture.text === undefined ? undefined : diagramSource(architecture.text),
    [architecture.text],
  )
  useEffect(() => {
    if (source === undefined || render.source === source) return
    renderDiagram(source)
  }, [source, render.source, renderDiagram])

  const rows = useMemo(() => register.text === undefined ? [] : parseRegister(register.text), [register.text])
  const milestone = latestMilestone(rows)
  const freshness = diagramFreshness(source, milestone?.diagram ?? undefined)

  const canvas = (): ReactNode => {
    if (render.status === 'ready' && render.svg !== undefined) {
      return <div className={css.svg} data-architecture-svg dangerouslySetInnerHTML={{ __html: render.svg }} />
    }
    if (render.status === 'failed') return <p className={css.status} data-architecture-state="render-failed">{t('render.failed')}</p>
    if (architecture.status === 'failed') {
      if (architecture.failureCode === 'workspace-file/not-found') {
        return <p className={css.status} data-architecture-state="missing">{t('error.missing')}</p>
      }
      return (
        <p className={css.status} data-architecture-state="failed">
          <span>{t('error.read')}</span>
          <button
            type="button"
            className={css.retry}
            data-architecture-retry
            onClick={() => { loadArchitecture(architecture.observedVersion ?? '') }}
          >
            {t('retry')}
          </button>
        </p>
      )
    }
    if (architecture.status === 'ready' && source === undefined) {
      return <p className={css.status} data-architecture-state="no-diagram">{t('error.noDiagram')}</p>
    }
    return <p className={css.status} data-architecture-state="loading">{t('loading')}</p>
  }

  return (
    <div className={css.view} data-architecture-diagram={freshness}>
      <div className={css.bar}>
        <span className={css.file}>{ARCHITECTURE_FILE}</span>
        {milestone !== undefined && <span className={css.milestone}>{`${milestone.id} · ${milestone.date}`}</span>}
        <span className={clsx(css.chip, css[freshness])} data-architecture-chip={freshness}>
          {t(`diagram.${freshness}`)}
        </span>
      </div>
      {freshness === 'stale' && <p className={css.alert} data-architecture-stale-alert>{t('diagram.stale.action')}</p>}
      <div className={css.canvas}>{canvas()}</div>
    </div>
  )
}
