/**
 * Remembered-approval-rule Settings section: the durable rule roster with its
 * add/edit form and revoke control, driven by `ApprovalRulesSectionController`
 * over the `approvalRuleSets` client service. Every string it renders or
 * labels is a keyed `approval.rules` namespace value; the write-failure line
 * and the pending marker read the same keys the transcript row's namespace
 * owns.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ApprovalRuleId, ApprovalRuleView } from '@deepseek-ai/dsh-user-approval'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ApprovalRulesSectionState } from './approval-rules-store.ts'
import type { ApprovalRuleWriteAction } from './approval-rules-store.ts'
import type { ApprovalRulesKey } from './locales.ts'
import css from './ApprovalRulesSection.module.css'

/** Settings actions and their shared controller state. */
export interface ApprovalRulesSectionInjected {
  hooks: {
    approvalRulesSection: SnapshotStore<ApprovalRulesSectionState>
  }
  load: () => Promise<void>
  retry: () => Promise<void>
  startCreate: () => void
  startEdit: (id: ApprovalRuleId) => void
  cancelEdit: () => void
  updateDraft: (patch: Partial<{ name: string; tool: string; effect: 'allow' | 'deny'; expiresAt?: string | undefined }>) => void
  save: () => Promise<boolean>
  revoke: (id: ApprovalRuleId) => Promise<boolean>
  dismissError: () => void
}
/** Props assembled by the settings renderer. */
export type ApprovalRulesSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'approval.rules'>
  & InjectFace<ApprovalRulesSectionInjected>

/** Lowercase verb rendered in the keyed `rules.error` write-failure line. */
const ACTION_KEY: Record<ApprovalRuleWriteAction, ApprovalRulesKey> = {
  save: 'rules.action.save',
  allow: 'rules.action.allow',
  deny: 'rules.action.deny',
  revoke: 'rules.action.revoke',
}

function EffectSelect({ effect, onChange, t }: {
  readonly effect: 'allow' | 'deny'
  readonly onChange: (effect: 'allow' | 'deny') => void
  readonly t: ApprovalRulesSectionProps['t']
}) {
  return (
    <select
      className={css.effect}
      value={effect}
      onChange={(event) => { onChange(event.currentTarget.value === 'deny' ? 'deny' : 'allow') }}
      aria-label={t('rules.form.effect')}
    >
      <option value="allow">{t('rules.allow')}</option>
      <option value="deny">{t('rules.deny')}</option>
    </select>
  )
}

function listRow(
  row: ApprovalRuleView,
  onEdit: (id: ApprovalRuleId) => void,
  onRevoke: (id: ApprovalRuleId) => void,
  t: ApprovalRulesSectionProps['t'],
) {
  return (
    <li key={String(row.id)} className={css.row} data-approval-rule-row={String(row.id)}>
      <span className={css.name}>{row.record.name}</span>
      <span className={css.tool} data-rule-tool>{row.record.tool}</span>
      <span className={css.effectText}>
        {row.record.effect === 'allow' ? t('rules.allow') : t('rules.deny')}
      </span>
      <span className={css.expiryText}>
        {row.record.expiresAt === undefined
          ? t('rules.noExpiry')
          : t('rules.expiry', { date: new Intl.DateTimeFormat(document.documentElement.lang, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(row.record.expiresAt)) })}
      </span>
      <span className={css.actions}>
        <Button variant="ghost" onClick={() => onEdit(row.id)}>{t('rules.edit')}</Button>
        <Button variant="ghost" onClick={() => { void onRevoke(row.id) }}>{t('rules.revoke')}</Button>
      </span>
    </li>
  )
}

/**
 * The rule roster block with its add/edit form. Loading, empty, failed-read,
 * and failed-write states each render their own keyed line; a landed write
 * whose re-read failed shows the kept rows under `rules.refreshError`.
 */
export function ApprovalRulesSection({
  useApprovalRulesSection, load, retry, startCreate, startEdit, cancelEdit,
  updateDraft, save, revoke, dismissError, t,
}: ApprovalRulesSectionProps) {
  const state = useApprovalRulesSection(value => value)
  const [formKey, setFormKey] = useState<number>(0)
  useEffect(() => { void load() }, [load])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    void save().then((ok) => {
      if (ok) setFormKey(key => key + 1)
    })
  }

  return (
    <section className={css.section} data-approval-rules-section="" aria-label={t('rules.heading')}>
      <h3 className={css.heading}>{t('rules.heading')}</h3>

      {state.status === 'loading' && state.rows.length === 0 && <p className={css.note}>{t('pending.read')}</p>}
      {state.status === 'read-error' && <p className={css.error}>{t('rules.error.read')} <Button variant="ghost" onClick={() => { void retry() }}>{t('retry')}</Button></p>}
      {state.status === 'write-error' && <p className={css.error}>{t('rules.error', { action: state.failedAction === null ? t('rules.action.save') : t(ACTION_KEY[state.failedAction]) })} <Button variant="ghost" onClick={dismissError}>{t('rules.dismiss')}</Button></p>}
      {state.status === 'refresh-error' && <p className={css.error}>{t('rules.refreshError')} <Button variant="ghost" onClick={() => { void retry() }}>{t('retry')}</Button></p>}

      {state.rows.length === 0 && state.status !== 'loading' && state.status !== 'read-error' && state.status !== 'write-error' && (
        <p className={css.note}>{t('rules.empty')}</p>
      )}

      {state.rows.length > 0 && (
        <ul className={css.list}>
          {state.rows.map(row => listRow(row, startEdit, revoke, t))}
        </ul>
      )}

      {!state.saving && (
        <div className={css.addRow}>
          <Button variant="outline" onClick={startCreate}>{t('rules.add')}</Button>
        </div>
      )}

      {state.draft !== null && (
        <form key={formKey} className={css.form} onSubmit={submit} aria-label={t('rules.form.label')}>
          <label>
            {t('rules.form.name')}
            <Input
              value={state.draft.name}
              onChange={(event) => { updateDraft({ name: event.currentTarget.value }) }}
              aria-label={t('rules.form.name')}
            />
          </label>
          <label>
            {t('rules.form.tool')}
            <Input
              value={state.draft.tool}
              onChange={(event) => { updateDraft({ tool: event.currentTarget.value }) }}
              aria-label={t('rules.form.tool')}
            />
          </label>
          <label>
            {t('rules.form.effect')}
            <EffectSelect effect={state.draft.effect} onChange={(effect) => { updateDraft({ effect }) }} t={t} />
          </label>
          <label>
            {t('rules.form.expiry')}
            <Input
              type="date"
              value={state.draft.expiresAt ?? ''}
              onChange={(event) => { updateDraft({ expiresAt: event.currentTarget.value === '' ? undefined : event.currentTarget.value }) }}
              aria-label={t('rules.form.expiry')}
            />
          </label>
          <div className={css.formActions}>
            <Button
              variant="primary"
              type="submit"
              disabled={state.saving || state.draft.name === '' || state.draft.tool === ''}
            >{state.saving ? t('rules.save.pending') : t('rules.save')}</Button>
            <Button variant="ghost" onClick={cancelEdit}>{t('rules.cancel')}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
