/**
 * Durable rule store facet under the user-approval package: opens the
 * `approval_rules` storage-domain table and exposes the management reads the
 * api/approval-rules Remote and the Settings seat share. The store holds rule
 * records only; approval records are not domain-persisted and share nothing
 * with it (a single-open domain; both the answerer path and the Remote read
 * the same opened table). Expiry is a read-side filter, not a domain primitive.
 *
 * @module @deepseek-ai/dsh-user-approval/rules
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import {
  ApprovalRuleId,
  approvalRuleDomainSpec,
  type ApprovalRuleRecord,
} from './rules.ts'

/**
 * Readonly view of one durable rule rendered for the seat, with the id and
 * the record. The id stays opaque (branded); the record carries the fields
 * the form edits and the row displays.
 */
export interface ApprovalRuleView {
  readonly id: ApprovalRuleId
  readonly record: ApprovalRuleRecord
}

/**
 * The rule store service: `ctx.approvalRules`. Opens the `approval_rules`
 * domain over the injected storage-domain facility and exposes the durable
 * rule CRUD the Remote and the Settings seat share. The answerer path reads
 * the same opened table through {@link ApprovalRuleStore.lookup}.
 */
export class ApprovalRuleStore extends Service {
  static readonly inject = ['storageDomain'] as const

  private table: KvTable<ApprovalRuleId, ApprovalRuleRecord> | undefined

  /**
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'approvalRules')
  }

  /** Whether the domain is open (false until storage-domain initializes the store). */
  get available(): boolean {
    return this.table !== undefined
  }

  /** Open the domain and take ownership of its close. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(approvalRuleDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'approvalRules.domainClose')
    this.table = domain.table('rules')
  }

  /**
   * List every current (unexpired) remembered rule. Expired rules are already
   * pruned on write, so this read is authoritative.
   * @returns the unexpired rules, newest first.
   */
  list(): ApprovalRuleView[] {
    const table = this.table
    if (table === undefined) return []
    const now = Date.now()
    const rows: ApprovalRuleView[] = []
    for (const [id, record] of table.entries()) {
      const expiry = record.expiresAt === undefined ? undefined : Date.parse(record.expiresAt)
      if (expiry !== undefined && !Number.isNaN(expiry) && expiry <= now) continue
      rows.push({ id, record })
    }
    rows.sort((a, b) => a.record.name.localeCompare(b.record.name))
    return rows
  }

  /**
   * Save (create or replace) one rule and write-prune any rule now expired.
   * @param record - the durable rule fields to store.
   * @returns the branded id of the saved rule.
   */
  async save(record: ApprovalRuleRecord): Promise<ApprovalRuleId> {
    const table = this.table
    if (table === undefined) throw new Error('approvalRules store is not open')
    const id = ApprovalRuleId(randomUUID())
    await table.put(id, record)
    await this.pruneExpired()
    return id
  }

  /**
   * Revoke one rule by id.
   * @param id - the branded id of the rule to revoke.
   * @returns whether a rule with that id existed and was removed.
   */
  async revoke(id: ApprovalRuleId): Promise<boolean> {
    const table = this.table
    if (table === undefined) throw new Error('approvalRules store is not open')
    return table.delete(id)
  }

  /**
   * The durable rule answering one tool name, if any, evaluating a rule's
   * `expiresAt` (an expired rule never answers). Tool-name granularity: the
   * first match by creation order wins.
   * @param tool - the tool name the request asks about.
   * @returns the answering rule and its id, or `undefined` when none applies.
   */
  lookup(tool: string): ApprovalRuleView | undefined {
    const table = this.table
    if (table === undefined) return undefined
    const now = Date.now()
    for (const [id, record] of table.entries()) {
      if (record.tool !== tool) continue
      const expiry = record.expiresAt === undefined ? undefined : Date.parse(record.expiresAt)
      if (expiry !== undefined && !Number.isNaN(expiry) && expiry <= now) continue
      return { id, record }
    }
    return undefined
  }

  /** Remove rules whose expiry has passed (called from the write path). */
  private async pruneExpired(): Promise<void> {
    const table = this.table
    if (table === undefined) return
    const now = Date.now()
    for (const [id, record] of table.entries()) {
      const expiry = record.expiresAt === undefined ? undefined : Date.parse(record.expiresAt)
      if (expiry !== undefined && !Number.isNaN(expiry) && expiry <= now) {
        await table.delete(id)
      }
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable remembered-approval-rule store. */
    approvalRules: ApprovalRuleStore
  }
}

/** The {@link ApprovalRuleRecord}, for importers of the store face. */
export type { ApprovalRuleRecord }
