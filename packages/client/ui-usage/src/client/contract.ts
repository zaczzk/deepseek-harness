/**
 * Browser-facing vocabulary of the token-usage meter: the provider-reported
 * usage windows it can render as limit percentages, and the registrant facts
 * injected beside the framework standard seats.
 */

import type { UsageLimitReport } from '@deepseek-ai/dsh-host-token-plan-usage/shared'

/** One provider-reported usage window. */
export type UsageLimit = UsageLimitReport

/** Browser facts injected into the Session-header usage meter. */
export interface UsageInjected {
  /**
   * Read the newest provider-reported usage windows.
   * @returns the reported windows; an empty list when no source reports any.
   */
  loadLimits: () => Promise<readonly UsageLimit[]>
}
