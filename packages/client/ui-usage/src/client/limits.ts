/**
 * Wire reader for the Host's token-plan usage route: the Host owns the
 * provider session and the polls, and this side reads the reported windows,
 * plan, and credits at the route's JSON boundary.
 */

import { TOKEN_PLAN_USAGE_PATH, type TokenPlanUsageResponse } from '@deepseek-ai/dsh-host-token-plan-usage/shared'
import type { UsageLimit, UsageReport } from './contract.ts'

/** The honest empty report: no rows is the meter's state before a first read. */
const EMPTY_REPORT: UsageReport = { limits: [], state: 'ok' }

/**
 * A wire token count. JSON can still deliver overflowed infinities and
 * precision-destroyed magnitudes (`1e400`, `1e22`), so a number type alone
 * does not make a count renderable.
 * @param value - one decoded count member.
 * @returns true for a non-negative safe integer.
 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** One reported window as the wire carries it, or null when malformed. */
function readWindow(entry: unknown): UsageLimit | null {
  if (typeof entry !== 'object' || entry === null) return null
  const { period, usedTokens, limitTokens } = entry as { period?: unknown; usedTokens?: unknown; limitTokens?: unknown }
  const shape = (period === 'week' || period === 'month')
    && isCount(usedTokens)
    && isCount(limitTokens)
  return shape ? { period, usedTokens, limitTokens } : null
}

/**
 * Read one plan report out of a route payload.
 * @param entry - the payload's `plan` member.
 * @returns the plan fields this side renders, or null when malformed.
 */
function readPlan(entry: unknown): NonNullable<TokenPlanUsageResponse['plan']> | null {
  if (typeof entry !== 'object' || entry === null) return null
  const { name, resetsAt, daysUntilReset, burn } = entry as {
    name?: unknown
    resetsAt?: unknown
    daysUntilReset?: unknown
    burn?: unknown
  }
  if (typeof name !== 'string' || name.length === 0) return null
  if (typeof resetsAt !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(resetsAt)) return null
  if (typeof daysUntilReset !== 'number' || !Number.isInteger(daysUntilReset)) return null
  if (burn === undefined) return { name, resetsAt, daysUntilReset }
  if (typeof burn !== 'object' || burn === null) return null
  const { dailyTokens, observedSince, projectedDays } = burn as {
    dailyTokens?: unknown
    observedSince?: unknown
    projectedDays?: unknown
  }
  const burnShape = typeof dailyTokens === 'number'
    && Number.isInteger(dailyTokens)
    && dailyTokens >= 0
    && typeof observedSince === 'string'
    && typeof projectedDays === 'number'
  return burnShape && Number.isInteger(projectedDays)
    ? { name, resetsAt, daysUntilReset, burn: { dailyTokens, observedSince, projectedDays } }
    : null
}

/**
 * Read the whole report out of one route payload.
 * @param body - the decoded JSON body served at the usage route.
 * @returns the report, or null when the body is not a report at all.
 */
export function readReport(body: unknown): UsageReport | null {
  if (typeof body !== 'object' || body === null) return null
  const { limits, plan, credits, state } = body as {
    limits?: unknown
    plan?: unknown
    credits?: unknown
    state?: unknown
  }
  if (!Array.isArray(limits)) return null
  const windows = limits.map(readWindow)
  if (windows.some(window => window === null)) return null
  if (state !== 'ok' && state !== 'expired') return null
  const readPlanValue = plan === undefined ? undefined : readPlan(plan)
  if (readPlanValue === null) return null
  const readCreditsValue = credits === undefined ? undefined : readCredits(credits)
  if (readCreditsValue === null) return null
  return {
    limits: windows as readonly UsageLimit[],
    ...readPlanValue === undefined ? {} : { plan: readPlanValue },
    ...readCreditsValue === undefined ? {} : { credits: readCreditsValue },
    state,
  }
}

/** One credits pair as the wire carries it, or null when malformed. */
function readCredits(entry: unknown): { usedTokens: number; limitTokens: number } | null {
  if (typeof entry !== 'object' || entry === null) return null
  const { usedTokens, limitTokens } = entry as { usedTokens?: unknown; limitTokens?: unknown }
  return isCount(usedTokens) && isCount(limitTokens)
    ? { usedTokens, limitTokens }
    : null
}

/**
 * Read the newest provider-reported usage report from the Host route.
 * @returns the report, or the empty report while no source reports any —
 * including on a failed read, so the meter shows no rows rather than a zero.
 */
export async function loadLimits(): Promise<UsageReport> {
  try {
    const response = await fetch(TOKEN_PLAN_USAGE_PATH, { headers: { accept: 'application/json' } })
    return readReport(await response.json()) ?? EMPTY_REPORT
  } catch (_readFailure) {
    // A failed read publishes nothing: no rows is the honest meter state.
    return EMPTY_REPORT
  }
}
