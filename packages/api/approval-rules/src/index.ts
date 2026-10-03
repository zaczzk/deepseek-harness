/**
 * Host approval-rules Remote owner: exposes the durable remembered-rule store
 * the `interaction/user-approval` package opens (list, save, revoke) to
 * browsers over the generated `approvalRuleSets` namespace. The controller is
 * a thin seam over `ctx.approvalRules` — it reuses the store's branded rule
 * records and translates the store's untyped failures onto the Remote error
 * channel so a Settings seat renders one story. It owns no grant lifecycle:
 * the user-approval package remains the single owner of rule evaluation and
 * the audit trail.
 *
 * @module @deepseek-ai/dsh-api-approval-rules
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-user-approval'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ApprovalRuleListRequest,
  ApprovalRuleListValue,
  ApprovalRuleRevokeRequest,
  ApprovalRuleRevokeValue,
  ApprovalRuleSaveRequest,
  ApprovalRuleSaveValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host approval-rules Remote namespace owner. */
    approvalRuleController: ApprovalRuleController
  }
}

/** Approval Rules Controller deployment policy. */
export interface Config {
  /** Reserved for deployment-tunable rule-management bounds; no field is shipped. */
  readonly _?: never
}

/** Host service backing the generated `ctx.remote.approvalRuleSets` namespace. */
export class ApprovalRuleController extends TypertRemoteService {
  static inject = ['approvalRules', 'typert']

  static Config: z<Config> = z.object({})

  /**
   * @param ctx - Host context carrying the durable remembered-rule store.
   * @param config - reserved deployment policy (none shipped).
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'approvalRuleController', { namespace: 'approvalRuleSets' })
    // schemastery has filled the (empty) schema; the assertion records that.
    void config
  }

  /**
   * List every current (unexpired) remembered rule, ordered by name. The
   * roster is a request/response snapshot: a UI re-reads it to refresh after
   * a write, and no stream state lives on this side.
   * @param _request - reserved request wrapper (the un-fenced rule list takes no argument).
   * @returns the unexpired remembered-rule rows, ordered by name.
   */
  @Remote('list')
  async list(_request: ApprovalRuleListRequest): Promise<ApprovalRuleListValue> {
    try {
      return this.ctx.approvalRules.list()
    } catch (error) {
      throw this.translate(error, 'list')
    }
  }

  /**
   * Save (create or replace) one remembered rule and write-prune any rule now
   * expired, atomically through the store's single-open domain. The returned
   * branded id is the rule the row renders and revoke targets.
   * @param request - the durable rule fields to store.
   * @returns the branded id of the saved rule.
   */
  @Remote('save')
  async save(request: ApprovalRuleSaveRequest): Promise<ApprovalRuleSaveValue> {
    try {
      const id = await this.ctx.approvalRules.save(request.record)
      return { id }
    } catch (error) {
      throw this.translate(error, 'save')
    }
  }

  /**
   * Revoke one remembered rule by its branded id.
   * @param request - the branded id of the rule to revoke.
   * @returns whether a rule with that id existed and was removed.
   */
  @Remote('revoke')
  async revoke(request: ApprovalRuleRevokeRequest): Promise<ApprovalRuleRevokeValue> {
    try {
      const revoked = await this.ctx.approvalRules.revoke(request.id)
      return { revoked }
    } catch (error) {
      throw this.translate(error, 'revoke')
    }
  }

  /**
   * Translate a store failure onto the Remote error channel. The store throws
   * untyped errors (`approvalRules store is not open`), so the controller maps
   * them onto a single stable `approval-rules/error` Remote code with the
   * failing method as context; the browser renders one failure story.
   * @param error - the store's thrown failure.
   * @param method - the Remote method name, carried as diagnosis context.
   * @returns a RemoteError the generated namespace propagates to the client.
   */
  private translate(error: unknown, method: string): RemoteError {
    return new RemoteError('approval-rules/error', String(error), { method })
  }
}

export default ApprovalRuleController
