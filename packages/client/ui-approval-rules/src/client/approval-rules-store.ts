/**
 * Remembered-approval-rule settings controller: owns the rule list, its
 * loading/empty/failed states, and the add/edit/revoke write paths, all over
 * the `ctx.approvalRuleSets` client service. Reads and writes map one-to-one
 * onto that Remote's list/save/revoke methods; no shared rule or selection
 * state lives elsewhere, and a successful write re-reads the list so the row
 * just written appears at once.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ApprovalRuleId,
  ApprovalRuleRecord,
  ApprovalRuleView,
} from '@deepseek-ai/dsh-user-approval'
import type { IApprovalRuleSets } from '@deepseek-ai/dsh-api-approval-rules/client'

/** The closed rule-management failure the section can surface. */
export type ApprovalRuleWriteAction = 'save' | 'allow' | 'deny' | 'revoke'

/**
 * One rule-form draft under edit. `expiresAt` is an ISO-8601 date string when
 * the operator set an expiry, undefined for a permanent rule.
 */
export interface ApprovalRuleDraft {
  readonly name: string
  readonly tool: string
  readonly effect: 'allow' | 'deny'
  readonly expiresAt?: string
}

/** The draft fields a section write may change; `expiresAt` may be cleared to
 * `undefined` explicitly (exactOptionalPropertyTypes-safe). */
export type ApprovalRuleDraftPatch = Partial<Omit<ApprovalRuleDraft, 'expiresAt'>> & {
  readonly expiresAt?: string | undefined
}

/** Shared controller state for the Settings section. */
export interface ApprovalRulesSectionState {
  /** Roster read and form/write lifecycle. */
  status: 'idle' | 'loading' | 'ready' | 'read-error' | 'write-error' | 'refresh-error'
  /** Reserved for the pending.read marker between first load and settle. */
  pending: boolean
  /** The durable rule rows as read (the Remote returns them ordered by name). */
  rows: readonly ApprovalRuleView[]
  /** The write action that failed, for the keyed `rules.error` interpolation. */
  failedAction: ApprovalRuleWriteAction | null
  /** The form's current draft; null when no form is open. */
  draft: ApprovalRuleDraft | null
  /** True while a write is in flight (`rules.save.pending` on Save). */
  saving: boolean
}
const INITIAL: ApprovalRulesSectionState = {
  status: 'idle',
  pending: false,
  rows: [],
  failedAction: null,
  draft: null,
  saving: false,
}

type ApprovalRuleSets = Pick<IApprovalRuleSets, 'list' | 'save' | 'revoke'>

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** All documented rule-form values are present. */
function validDraft(draft: ApprovalRuleDraft): boolean {
  return draft.name !== '' && draft.tool !== '' && (draft.effect === 'allow' || draft.effect === 'deny')
}

/**
 * Settings controller for the remembered-rule list and its add/edit/revoke
 * writes. Each write re-reads the roster on success; a landed-write whose
 * re-read fails surfaces the refresh-error state over the kept rows.
 */
export class ApprovalRulesSectionController {
  /** Observable section state. */
  readonly store: SnapshotStore<ApprovalRulesSectionState> = createSnapshotStore(INITIAL)
  private loading: Promise<void> | undefined

  /**
   * @param approvalRuleSets - the client approval-rules service.
   */
  constructor(private readonly approvalRuleSets: ApprovalRuleSets) {}

  private set(patch: Partial<ApprovalRulesSectionState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private async readRoster(): Promise<void> {
    // The pending.read marker shows between first load and settle — only for
    // the never-loaded (idle) read. Retry() re-reads set loading explicitly
    // in the caller; a landed write's re-read keeps the current rows on
    // screen (no loading flash over live data).
    if (this.store.getSnapshot().status === 'idle') this.set({ status: 'loading', pending: true })
    try {
      const result = await this.approvalRuleSets.list()
      if (!result.ok) throw new Error(result.error.message)
      this.set({ status: 'ready', rows: result.value, pending: false, failedAction: null })
    } catch (error) {
      void message(error)
      this.set({ status: 'read-error', pending: false })
    }
  }

  /** Load the rule roster; concurrent calls share one read.
   * @returns Once the roster read settles.
   */
  load(): Promise<void> {
    return this.loading ??= this.readRoster().finally(() => { this.loading = undefined })
  }

  /** Retry a failed roster read.
   * @returns Once the read settles.
   */
  retry(): Promise<void> {
    this.set({ status: 'loading', pending: true })
    return this.load()
  }

  /** Open the add-rule form with an empty draft. */
  startCreate(): void {
    this.set({
      draft: { name: '', tool: '', effect: 'allow' },
      failedAction: null,
      status: this.store.getSnapshot().status === 'read-error' ? 'read-error' : 'ready',
    })
  }

  /** Open the edit form prefilled with one row's record.
   * @param id - the row's branded id to edit.
   */
  startEdit(id: ApprovalRuleId): void {
    const row = this.store.getSnapshot().rows.find(r => r.id === id)
    if (row === undefined) return
    this.set({
      draft: {
        name: row.record.name,
        tool: row.record.tool,
        effect: row.record.effect,
        ...(row.record.expiresAt === undefined ? {} : { expiresAt: row.record.expiresAt }),
      },
      failedAction: null,
    })
  }

  /** Close the form without writing. */
  cancelEdit(): void {
    this.set({ draft: null, failedAction: null })
  }

  /** Update one draft field as the operator types.
   * @param patch - the field(s) to change in the draft.
   */
  updateDraft(patch: ApprovalRuleDraftPatch): void {
    const draft = this.store.getSnapshot().draft
    if (draft === null) return
    const name = patch.name ?? draft.name
    const tool = patch.tool ?? draft.tool
    const effect = patch.effect ?? draft.effect
    // The section clears an explicit expiry by passing `expiresAt: undefined`
    // (key present); a patch with the key absent leaves the current value.
    const expiresAt = 'expiresAt' in patch ? patch.expiresAt : draft.expiresAt
    this.set({
      draft: expiresAt === undefined
        ? { name, tool, effect }
        : { name, tool, effect, expiresAt },
    })
  }

  /** Write the current draft (create or replace).
   * @returns true once the roster re-read settles with the new row visible.
   */
  async save(): Promise<boolean> {
    const draft = this.store.getSnapshot().draft
    if (draft === null || this.store.getSnapshot().saving) return false
    if (!validDraft(draft)) return false
    this.set({ saving: true, failedAction: 'save' })
    const record: ApprovalRuleRecord = {
      name: draft.name,
      tool: draft.tool,
      effect: draft.effect,
      ...(draft.expiresAt === undefined ? {} : { expiresAt: draft.expiresAt }),
    }
    try {
      const result = await this.approvalRuleSets.save(record)
      if (!result.ok) throw new Error(result.error.message)
      await this.load()
      const next = this.store.getSnapshot()
      this.set({
        draft: null,
        saving: false,
        failedAction: null,
        status: next.status === 'read-error' ? 'refresh-error' : 'ready',
      })
      return true
    } catch (error) {
      void message(error)
      this.set({ status: 'write-error', saving: false })
      return false
    }
  }

  /** Revoke one rule by id.
   * @param id - the branded id of the rule to revoke.
   * @returns true once the roster re-read settles.
   */
  async revoke(id: ApprovalRuleId): Promise<boolean> {
    if (this.store.getSnapshot().saving) return false
    this.set({ failedAction: 'revoke' })
    try {
      const result = await this.approvalRuleSets.revoke(id)
      if (!result.ok) throw new Error(result.error.message)
      await this.load()
      const next = this.store.getSnapshot()
      this.set({ failedAction: null, status: next.status === 'read-error' ? 'refresh-error' : 'ready' })
      return true
    } catch (error) {
      void message(error)
      this.set({ status: 'write-error', failedAction: this.store.getSnapshot().failedAction })
      return false
    }
  }

  /** Dismiss a failed-write line, leaving the list and form as they were. */
  dismissError(): void {
    this.set({ failedAction: null, status: 'ready' })
  }
}
