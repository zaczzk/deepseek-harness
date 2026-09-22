/**
 * Wire reader for the Host's token-plan usage route: the Host owns the
 * provider session and the poll, and this side reads the reported windows.
 */

import { TOKEN_PLAN_USAGE_PATH, type UsageLimitReport } from '@deepseek-ai/dsh-host-token-plan-usage/shared'
import type { UsageLimit } from './contract.ts'

/**
 * Read the reported windows out of one route payload.
 * @param body - the decoded JSON body served at the usage route.
 * @returns the windows it reports, or an empty list for any other body.
 */
export function readLimits(body: unknown): readonly UsageLimit[] {
  if (typeof body !== 'object' || body === null) return []
  const { limits } = body as { limits?: unknown }
  if (!Array.isArray(limits)) return []
  return limits.filter((entry): entry is UsageLimitReport => {
    if (typeof entry !== 'object' || entry === null) return false
    const { period, usedTokens, limitTokens } = entry as { period?: unknown; usedTokens?: unknown; limitTokens?: unknown }
    return (period === 'week' || period === 'month')
      && typeof usedTokens === 'number'
      && typeof limitTokens === 'number'
  })
}

/**
 * Read the newest provider-reported usage windows from the Host route.
 * @returns the reported windows; an empty list while no source reports any,
 * including on a failed read — the meter shows no rows rather than a zero.
 */
export async function loadLimits(): Promise<readonly UsageLimit[]> {
  try {
    const response = await fetch(TOKEN_PLAN_USAGE_PATH, { headers: { accept: 'application/json' } })
    return readLimits(await response.json())
  } catch (_readFailure) {
    // A failed read publishes nothing: no rows is the honest meter state.
    return []
  }
}
