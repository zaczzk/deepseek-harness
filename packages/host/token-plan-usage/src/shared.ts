/**
 * Wire vocabulary of the token-plan usage route, shared by the Host reader
 * and the browser meter.
 *
 * @module @deepseek-ai/dsh-host-token-plan-usage/shared
 */

/** Route serving the newest provider-reported usage windows as JSON. */
export const TOKEN_PLAN_USAGE_PATH = '/dsh/token-plan/usage'

/**
 * One provider-reported usage window. Values come from the provider's own
 * accounting; a period the provider does not report is simply absent, so a
 * meter shows no row for it.
 */
export interface UsageLimitReport {
  /** The reported window. */
  period: 'week' | 'month'
  /** Tokens used inside the window. */
  usedTokens: number
  /** The window's token limit. */
  limitTokens: number
  /** Provider-reported moment the window resets, when it reports one. */
  resetsAt?: string
}

/** JSON served at {@link TOKEN_PLAN_USAGE_PATH}. */
export interface TokenPlanUsageResponse {
  /** Newest reported windows; empty before a first report or without a stored session. */
  limits: readonly UsageLimitReport[]
}
