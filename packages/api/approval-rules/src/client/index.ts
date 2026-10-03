/**
 * Approval Rules Controller client half: installs `ctx.approvalRuleSets` over
 * the generated `approvalRuleSets` Remote namespace. The plugin resolves the
 * namespace face while its own context is current, because callers (a React
 * Settings seat) issue reads on caller stacks whose dynamic context has not
 * declared `remote.approvalRuleSets`.
 *
 * @module @deepseek-ai/dsh-api-approval-rules/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-approval-rules/remote'
import { ClientApprovalRuleSets } from './service.ts'

export type { IApprovalRuleSets } from './service.ts'
export type {
  ApprovalRuleListRequest,
  ApprovalRuleListValue,
  ApprovalRuleSaveRequest,
  ApprovalRuleSaveValue,
  ApprovalRuleRevokeRequest,
  ApprovalRuleRevokeValue,
} from '../types.ts'

/** Required Client Remote services. */
export const inject = ['remote', 'remote.approvalRuleSets']

/**
 * Install the client approval-rules service.
 * @param ctx - Client root Context.
 */
export function apply(ctx: Context): void {
  // Read the namespace now, not inside a caller stack: see the module JSDoc.
  const { remote } = ctx
  new ClientApprovalRuleSets(ctx, remote.approvalRuleSets)
}
