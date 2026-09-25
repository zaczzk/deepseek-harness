/**
 * Browser-facing vocabulary of the token-usage meter: the provider-reported
 * usage windows, plan, and credits it can render, and the registrant facts
 * injected beside the framework standard seats.
 */

import type { TokenPlanUsageResponse, UsageLimitReport } from '@deepseek-ai/dsh-host-token-plan-usage/shared'

/** One provider-reported usage window. */
export type UsageLimit = UsageLimitReport

/** The Host reader's full report: windows, plan, credits, and session state. */
export type UsageReport = TokenPlanUsageResponse

/** Browser facts injected into the Session-header usage meter. */
export interface UsageInjected {
  /**
   * Read the newest provider-reported usage report.
   * @returns the reported windows with the plan and credits when reported; an
   * empty report when no source reports any.
   */
  loadLimits: () => Promise<UsageReport>
}
