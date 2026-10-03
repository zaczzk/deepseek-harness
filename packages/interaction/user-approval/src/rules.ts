/**
 * Durable remembered-approval-rule store: the `approval_rules` storage-domain
 * table under the user-approval package. The rule record is tool-name-scoped
 * (the granularity the approval seam already carries); the effective rule for
 * a request is the one whose `tool` matches that request's tool name, evaluated
 * before any interactive or machine answerer. Expiry is not a domain primitive:
 * a stored `expiresAt` is a read-side filter the evaluation consults.
 *
 * @module @deepseek-ai/dsh-user-approval/rules
 */

import { z } from 'zod'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

/** Branded identity of one durable remembered rule. */
export type ApprovalRuleId = Branded<'ApprovalRuleId'>

/**
 * Brand a string as an {@link ApprovalRuleId}.
 * @param id - the raw rule id string to brand.
 * @returns the same string carrying the brand.
 */
export function ApprovalRuleId(id: string): ApprovalRuleId {
  return id as ApprovalRuleId
}

/** The closed remembered-rule effect; `allow` answers without asking. */
export type ApprovalRuleEffect = 'allow' | 'deny'

/** Every {@link ApprovalRuleEffect}, for runtime validation of stored effect strings. */
export const APPROVAL_RULE_EFFECTS: readonly ApprovalRuleEffect[] = ['allow', 'deny']

/**
 * Durable shape of one remembered approval rule. `tool` is the tool-name
 * granularity the approval seam already carries. `expiresAt` is an ISO-8601
 * string; an expired stored rule is filtered out on read and pruned on write.
 */
export const approvalRuleRecord = z.object({
  /** Human-readable rule name (the Settings form's name field). */
  name: z.string(),
  /** The tool name this rule answers for. */
  tool: z.string(),
  /** The rule's closed effect. */
  effect: z.enum(APPROVAL_RULE_EFFECTS),
  /** ISO-8601 expiry, if the rule is not permanent. */
  expiresAt: z.string().optional(),
})

/** One durable remembered rule, inferred from {@link approvalRuleRecord}. */
export type ApprovalRuleRecord = z.infer<typeof approvalRuleRecord>

/**
 * The approval-rules domain: one `rules` table keyed by {@link ApprovalRuleId}.
 * The table is a durable store the Host Remote injects rather than declaring a
 * second one, so the store grows no second grant lifecycle under this package.
 */
export const approvalRuleDomainSpec = defineDomain({
  name: 'approval_rules',
  version: 1,
  tables: { rules: domainTable<ApprovalRuleId, ApprovalRuleRecord>(approvalRuleRecord) },
})
