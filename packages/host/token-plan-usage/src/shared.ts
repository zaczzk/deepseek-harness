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
}

/** Observed usage trend of the current plan period, computed Host-side. */
export interface UsageBurnReport {
  /** Tokens per day from observed usage deltas over elapsed fractional days. */
  dailyTokens: number
  /** RFC 3339 moment the current observation began. */
  observedSince: string
  /** Projected days to exhaustion at `dailyTokens`, ceiling-rounded. */
  projectedDays: number
}

/** The plan window the provider reports through its detail endpoint. */
export interface UsagePlanReport {
  /** Plan name as the provider reports it. */
  name: string
  /** Provider's naive `YYYY-MM-DD HH:mm:ss` period end, in the plan calendar. */
  resetsAt: string
  /** Whole days until `resetsAt`, floor-rounded. */
  daysUntilReset: number
  /** Present only with a usable observation; see the reader's presence gates. */
  burn?: UsageBurnReport
}

/** Compensation credits the provider reports alongside the plan window. */
export interface UsageCreditsReport {
  /** Tokens drawn from compensation credits. */
  usedTokens: number
  /** Compensation credit grant, if the provider reports one. */
  limitTokens: number
}

/** JSON served at {@link TOKEN_PLAN_USAGE_PATH}. */
export interface TokenPlanUsageResponse {
  /** Newest reported windows; empty before a first report or without a stored session. */
  limits: readonly UsageLimitReport[]
  /** The plan window; absent when the detail report is unavailable. */
  plan?: UsagePlanReport
  /** Compensation credits; present only when the provider reports a nonzero row. */
  credits?: UsageCreditsReport
  /** `'expired'` once any poll meets the console's login challenge. */
  state: 'ok' | 'expired'
}
