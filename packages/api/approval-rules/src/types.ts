/**
 * Public Remote request and response types for the approval-rules controller.
 * Both Host and Client compiler faces compile these shared types; the wire
 * records are reused from the `user-approval` package's durable rule store
 * rather than re-declared, so the browser sees the same records the Host
 * evaluates.
 *
 * @module @deepseek-ai/dsh-api-approval-rules/types
 */

import type {
  ApprovalRuleId,
  ApprovalRuleRecord,
  ApprovalRuleView,
} from '@deepseek-ai/dsh-user-approval'

export type {
  ApprovalRuleId,
  ApprovalRuleRecord,
  ApprovalRuleView,
} from '@deepseek-ai/dsh-user-approval'

/** Map the store's failures onto the Remote error vocabulary for this controller. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The store threw (e.g. the domain is not open); carries the failing method. */
    'approval-rules/error': { readonly method: string }
  }
}

/** List the durable remembered-approval-rule set, unexpired, newest first. */
export interface ApprovalRuleListRequest {
  /** Reserved for a caller-argument fence if the fenced list is ever introduced. */
  readonly _?: never
}

/** The unexpired remembered-approval-rule set, ordered by name. */
export type ApprovalRuleListValue = readonly ApprovalRuleView[]

/** Save (create or replace) one remembered rule, then write-prune expired rules. */
export interface ApprovalRuleSaveRequest {
  /** The durable rule fields to store (name, tool, effect, optional expiry). */
  readonly record: ApprovalRuleRecord
}

/** The branded id of the saved rule. */
export interface ApprovalRuleSaveValue {
  readonly id: ApprovalRuleId
}

/** Revoke one remembered rule by its branded id. */
export interface ApprovalRuleRevokeRequest {
  readonly id: ApprovalRuleId
}

/** Whether a rule with that id existed and was removed. */
export interface ApprovalRuleRevokeValue {
  readonly revoked: boolean
}