/**
 * Item 12's effective-permission readout: the active retained Session's
 * effective sandbox mode, workspace root, and effective permission value —
 * three fields off the one `session.projections` read the Session controller
 * state carries (`projectionsBySession`). Rendered above item 4's durable
 * rule roster under its own `readout.subheading`; the write surface (rules)
 * and its read surface never interleave.
 *
 * The Session is not supplied by the slot (root-scoped seat): it is the one
 * retained in the current view, found by the panel-active gate
 * (`usePanelInfo`) plus the retained-Session scan over `useSessions`
 * (`retainedBy.mainView > 0`), coinciding with `ui-workspace`'s row chrome.
 * Session-less chrome shows the named deployment default for all three fields
 * under `label.sessionless`; with a Session the readout labels it and reads
 * its projections. A failed read renders `error.read` + one Retry in every
 * field's place at once (one read per Session); `pending.read` heads the
 * readout while that read is in flight.
 */
import { useEffect, useMemo, useState } from 'react'
import type { UsePanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { PermissionCatalog } from '@deepseek-ai/dsh-permission-presets'
import type { SandboxModeView } from '@deepseek-ai/dsh-sandbox-policy'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en, type ApprovalRulesKey } from './locales.ts'
import css from './ApprovalRulesSection.module.css'

/** Effective sandbox-mode grid label keys (the three non-default renders). */
const MODE_VALUE_KEYS: Record<string, ApprovalRulesKey> = {
  'read-only': 'value.readOnly',
  'workspace-write': 'value.workspaceWrite',
  'danger-full-access': 'value.fullAccess',
}

/**
 * Built-in permission preset labels: value key + the shipped default name.
 * The comparison names come from this seat's own `en` dictionary (the same
 * shipped strings the picker localizes), never hard-coded — the picker's
 * `DEFAULT_PRESET_LABELS` precedent (`presentation.ts:21-27`).
 */
const BUILT_IN_PRESETS: Record<string, { key: ApprovalRulesKey; label: string }> = {
  'read-only': { key: 'value.readOnly', label: en['value.readOnly'] },
  'workspace-write': { key: 'value.workspaceWrite', label: en['value.workspaceWrite'] },
  'danger-full-access': { key: 'value.fullAccess', label: en['value.fullAccess'] },
  'auto': { key: 'value.auto', label: en['value.auto'] },
}

/**
 * The permission preset's display name: a built-in whose Host name matches
 * its key or shipped default reads the localized `value.*` key; any matched
 * catalog entry's Host-supplied name renders title-cased; an unmatched value
 * title-cases itself. No raw machine token ever reaches the DOM.
 * @param value - the `permissions.currentValue` machine identity.
 * @param catalog - the process permission catalog options, when loaded.
 * @param t - the bound `approval.rules` translator.
 * @returns the localized or title-cased display label.
 */
export function displayPermission(
  value: string,
  catalog: PermissionCatalog | undefined,
  t: (key: ApprovalRulesKey, params?: Record<string, string>) => string,
): string {
  const builtIn = BUILT_IN_PRESETS[value]
  const option = catalog?.options.find(option => option.value === value)
  if (builtIn !== undefined && (option === undefined || option.name === value || option.name === builtIn.label)) {
    return t(builtIn.key)
  }
  const name = option?.name ?? value
  return titleCase(name)
}

/** Title-case a conventional kebab-case preset key; leave other labels alone. */
export function titleCase(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/** Props the readout takes from the section seat. */
export interface PermissionsReadoutProps {
  readonly usePanelInfo: UsePanelInfo
  readonly useSessions: UseSessions
  readonly readCatalog: () => Promise<PermissionCatalog>
  readonly refreshProjects: (sessionId: SessionId) => void
  readonly t: (key: ApprovalRulesKey, params?: Record<string, string>) => string
}

/**
 * One effective-permission field row: a label + a value line.
 * @param label - the field's `readout.*` label.
 * @param value - the resolved field value node.
 */
function Field({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className={css.field} data-permission-field="">
      <span className={css.fieldLabel}>{label}</span>
      <span className={css.fieldValue} data-permission-value="">{value}</span>
    </div>
  )
}

/**
 * Resolve this readout's named Session: the panel gate plus the
 * retained-Session scan. Returns undefined when a global panel holds the main
 * area or no Session is retained (session-less chrome).
 * @param panelHeld - whether a global panel holds the main area.
 * @param byId - the session rows keyed by id.
 * @returns the retained Session id, or undefined.
 */
export function selectSession(
  panelHeld: boolean,
  byId: Record<string, { retainedBy: { mainView?: number } }>,
): SessionId | undefined {
  if (panelHeld) return undefined
  const retained = Object.entries(byId).find(([, session]) => (session.retainedBy.mainView ?? 0) > 0)
  return retained === undefined ? undefined : retained[0] as SessionId
}

/**
 * The effective-permission readout block. Reads the retained Session's
 * projections through the `useSessions` framework seat and the panel gate.
 * @param props - composed readout props.
 */
export function PermissionsReadout({
  usePanelInfo, useSessions, readCatalog, refreshProjects, t,
}: PermissionsReadoutProps) {
  const panelHeld = usePanelInfo(info => info.activePanelId !== null)
  const byId = useSessions(state => state.byId)
  const sessionId = useMemo(() => selectSession(panelHeld, byId), [panelHeld, byId])
  const projection = useSessions(state => (sessionId === undefined ? undefined : state.projectionsBySession[sessionId]))
  const [catalog, setCatalog] = useState<PermissionCatalog | undefined>(undefined)
  const [retrying, setRetrying] = useState(false)

  // One process-catalog read for the permission-join branch rules; a failed
  // read leaves it undefined and every value falls through to its key or
  // title-cased form (never a raw token).
  useEffect(() => {
    let alive = true
    readCatalog().then(
      (value) => { if (alive) setCatalog(value) },
      () => { if (alive) setCatalog(undefined) },
    )
    return () => { alive = false }
  }, [readCatalog])

  const named = sessionId === undefined ? undefined : byId[sessionId]
  const readState = projection?.state
  const values = projection?.values

  const retry = (): void => {
    /* v8 ignore next 1 -- unreachable: the Retry button is disabled while
       retrying, and retry() only renders in the named-Session branch. */
    if (sessionId === undefined || retrying) return
    setRetrying(true)
    void Promise.resolve(refreshProjects(sessionId)).then(() => { setRetrying(false) })
  }

  const sandboxMode = values?.sandboxMode as SandboxModeView | undefined
  const currentValue = values?.permissions?.currentValue
  const modeLabel = sandboxMode === undefined || sandboxMode.mode === undefined
    ? t('value.deploymentDefault')
    : t(MODE_VALUE_KEYS[sandboxMode.mode] ?? 'value.deploymentDefault')
  const rootLabel = (sandboxMode?.workspaceRoot.trim() || undefined) ?? t('value.deploymentDefault')
  const permissionLabel = currentValue === undefined
    ? t('value.deploymentDefault')
    : displayPermission(currentValue, catalog, t)

  return (
    <div className={css.readout} data-permission-readout="">
      <h4 className={css.readoutHeading} data-permission-subheading>{t('readout.subheading')}</h4>
      {named === undefined ? (
        <>
          <p className={css.sessionNote} data-permission-session="none">{t('label.sessionless')}</p>
          <Field label={t('readout.sandboxMode')} value={t('value.deploymentDefault')} />
          <Field label={t('readout.workspaceRoot')} value={t('value.deploymentDefault')} />
          <Field label={t('readout.permission')} value={t('value.deploymentDefault')} />
        </>
      ) : (
        <>
          <p className={css.sessionNote} data-permission-session="named">{t('label.session', { name: named.displayTitle })}</p>
          {readState === 'error' ? (
            <p className={css.error} data-permission-state="error">
              <span>{t('error.read')}</span>
              <button
                type="button"
                className={css.retry}
                data-permission-retry
                disabled={retrying}
                onClick={retry}
              >
                {t(retrying ? 'pending.read' : 'retry')}
              </button>
            </p>
          ) : readState === 'ready' ? (
            <div data-permission-state="ready">
              <Field label={t('readout.sandboxMode')} value={modeLabel} />
              <Field label={t('readout.workspaceRoot')} value={rootLabel} />
              <Field label={t('readout.permission')} value={permissionLabel} />
            </div>
          ) : (
            <p className={css.note} data-permission-state="pending">{t('pending.read')}</p>
          )}
        </>
      )}
    </div>
  )
}
