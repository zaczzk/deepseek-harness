/**
 * The `ctx.approvalRuleSets` client service: RPC passthroughs over the
 * generated `approvalRuleSets` namespace. Each method maps to one Remote call
 * and returns the Remote result, so a Settings seat owns its own read
 * lifecycle and failure presentation. No shared rule or selection state lives
 * here — the remembered-rule list derives from the exact reads it issues.
 *
 * @module @deepseek-ai/dsh-api-approval-rules/client/service
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ApprovalRuleId, ApprovalRuleRecord } from '../types.ts'
import type {
  ApprovalRuleListValue,
  ApprovalRuleRevokeValue,
  ApprovalRuleSaveValue,
} from '../types.ts'

/** The generated `approvalRuleSets` namespace face. */
export interface ApprovalRuleSetsRemote {
  /**
   * List the durable remembered-approval-rule set.
   * @param request - reserved request wrapper.
   * @returns the unexpired rule rows, or a transport failure.
   */
  list(request: {}): Promise<RemoteResult<ApprovalRuleListValue>>
  /**
   * Save (create or replace) one remembered rule.
   * @param request - the durable rule fields to store.
   * @returns the branded id of the saved rule, or a typed/transport failure.
   */
  save(request: { record: ApprovalRuleRecord }): Promise<RemoteResult<ApprovalRuleSaveValue>>
  /**
   * Revoke one remembered rule by id.
   * @param request - the branded id of the rule to revoke.
   * @returns whether a rule with that id existed and was removed, or a failure.
   */
  revoke(request: { id: ApprovalRuleId }): Promise<RemoteResult<ApprovalRuleRevokeValue>>
}

/** The client approval-rules service face. */
export interface IApprovalRuleSets {
  /**
   * List every current (unexpired) remembered rule.
   * @returns the unexpired rule rows, or the failure for a rejected read.
   */
  list(): Promise<RemoteResult<ApprovalRuleListValue>>
  /**
   * Save (create or replace) one remembered rule.
   * @param record - the durable rule fields to store.
   * @returns the branded id of the saved rule, or the failure.
   */
  save(record: ApprovalRuleRecord): Promise<RemoteResult<ApprovalRuleSaveValue>>
  /**
   * Revoke one remembered rule by id.
   * @param id - the branded id of the rule to revoke.
   * @returns whether a rule with that id existed and was removed, or the failure.
   */
  revoke(id: ApprovalRuleId): Promise<RemoteResult<ApprovalRuleRevokeValue>>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** React-free approval-rule-management Remote passthroughs. */
    approvalRuleSets: IApprovalRuleSets
  }
}

/** Owns the three RPC passthroughs over the generated `approvalRuleSets` namespace. */
export class ClientApprovalRuleSets extends Service implements IApprovalRuleSets {
  /**
   * @param ctx - client root Context.
   * @param remote - the generated `approvalRuleSets` namespace.
   */
  constructor(
    ctx: Context,
    private readonly remote: ApprovalRuleSetsRemote,
  ) {
    super(ctx, 'approvalRuleSets')
  }

  list(): Promise<RemoteResult<ApprovalRuleListValue>> {
    return this.remote.list({})
  }

  save(record: ApprovalRuleRecord): Promise<RemoteResult<ApprovalRuleSaveValue>> {
    return this.remote.save({ record })
  }

  revoke(id: ApprovalRuleId): Promise<RemoteResult<ApprovalRuleRevokeValue>> {
    return this.remote.revoke({ id })
  }
}