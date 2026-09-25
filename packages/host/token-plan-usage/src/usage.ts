/**
 * Pure parsing and window math for the console's Token Plan reports.
 *
 * The usage report nests its counters under `data.monthUsage.items`; each row
 * names one counter and carries the console's own `used`/`limit` counts. The
 * row named `month_total_token` is the monthly quota, and
 * `compensation_total_token` is the credit grant. The detail report carries
 * `planName` and the naive period end `currentPeriodEnd`, which this module
 * reads structurally — the provider's plan calendar is Asia/Shanghai, and
 * `new Date(naive)` would resolve in the Host's own zone instead.
 */

import type { UsageBurnReport, UsageCreditsReport, UsageLimitReport } from './shared.ts'

/** Provider plan calendar: the console renders its plan dates in UTC+8. */
const PLAN_UTC_OFFSET_HOURS = 8

/** The naive period-end shape the console reports (`YYYY-MM-DD HH:mm:ss`). */
const PERIOD_END = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

/** Minimum observation before a burn figure is reported, ms. */
const BURN_MIN_OBSERVATION_MS = 6 * 60 * 60 * 1000

/**
 * Parse one Token Plan usage report's monthly window.
 * @param report - the decoded JSON body of the provider's usage endpoint.
 * @returns the reported windows, or null when the body carries no usable counts.
 */
export function parseUsageLimits(report: unknown): UsageLimitReport[] | null {
  if (typeof report !== 'object' || report === null) return null
  const data = (report as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const monthUsage = (data as { monthUsage?: unknown }).monthUsage
  if (typeof monthUsage !== 'object' || monthUsage === null) return null
  const items = (monthUsage as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  const rows: readonly unknown[] = items
  const row = rows.find(item => typeof item === 'object'
    && item !== null
    && (item as { name?: unknown }).name === 'month_total_token')
  if (row === undefined) return null
  const { used, limit } = row as { used?: unknown; limit?: unknown }
  if (typeof used !== 'number' || !Number.isInteger(used) || used < 0) return null
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) return null
  return [{ period: 'month', usedTokens: used, limitTokens: limit }]
}

/**
 * Parse the compensation-credit row of one usage report.
 * @param report - the decoded JSON body of the provider's usage endpoint.
 * @returns the credit grant, or null when absent or unusable; a zero limit is
 * legitimate here, so the row is present whenever either count is nonzero.
 */
export function parseCredits(report: unknown): UsageCreditsReport | null {
  if (typeof report !== 'object' || report === null) return null
  const data = (report as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const usage = (data as { usage?: unknown }).usage
  if (typeof usage !== 'object' || usage === null) return null
  const items = (usage as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  const rows: readonly unknown[] = items
  const row = rows.find(item => typeof item === 'object'
    && item !== null
    && (item as { name?: unknown }).name === 'compensation_total_token')
  if (row === undefined) return null
  const { used, limit } = row as { used?: unknown; limit?: unknown }
  if (typeof used !== 'number' || !Number.isInteger(used) || used < 0) return null
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) return null
  return used > 0 || limit > 0 ? { usedTokens: used, limitTokens: limit } : null
}

/**
 * Parse one Token Plan detail report's plan identity and window.
 * @param report - the decoded JSON body of the provider's detail endpoint.
 * @param now - Host clock, epoch ms.
 * @returns the plan name, naive period end, and whole days until it, or null
 * when any field is unusable.
 */
export function parsePlan(
  report: unknown,
  now: number,
): { name: string; resetsAt: string; daysUntilReset: number } | null {
  if (typeof report !== 'object' || report === null) return null
  const data = (report as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const { planName, currentPeriodEnd } = data as { planName?: unknown; currentPeriodEnd?: unknown }
  if (typeof planName !== 'string' || planName.length === 0) return null
  if (typeof currentPeriodEnd !== 'string') return null
  const daysLeft = daysUntilReset(currentPeriodEnd, now)
  return daysLeft === null ? null : { name: planName, resetsAt: currentPeriodEnd, daysUntilReset: daysLeft }
}

/** The period's first observed counts, keyed by the plan period end. */
export interface FirstSeen {
  /** Tokens used when the period was first observed. */
  readonly usedTokens: number
  /** Observation start, epoch ms. */
  readonly at: number
  /** Period end that names this observation; empty before the plan is known. */
  readonly period: string
}

/**
 * Advance the burn observation for one reported period.
 * @param firstSeen - the observation so far.
 * @param month - the reported monthly window, when one arrived.
 * @param period - the plan's period end, empty before the plan is known.
 * @param now - Host clock, epoch ms.
 * @returns the observation to keep.
 */
export function recordObservation(
  firstSeen: FirstSeen | undefined,
  month: { usedTokens: number } | undefined,
  period: string,
  now: number,
): FirstSeen | undefined {
  if (month === undefined) return firstSeen
  if (firstSeen === undefined) return { usedTokens: month.usedTokens, at: now, period }
  if (period !== '' && firstSeen.period === '') return { ...firstSeen, period }
  if (period !== '' && firstSeen.period !== period) return { usedTokens: month.usedTokens, at: now, period }
  return firstSeen
}

/**
 * Whole days until the provider's naive period end, in the plan calendar.
 * @param resetsAt - the naive `YYYY-MM-DD HH:mm:ss` period end.
 * @param now - Host clock, epoch ms.
 * @returns floor-rounded days, or null when the string is not a period end.
 */
export function daysUntilReset(resetsAt: string, now: number): number | null {
  const parts = PERIOD_END.exec(resetsAt)
  if (parts === null) return null
  const [, year, month, day, hour, minute, second] = parts
  const target = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - PLAN_UTC_OFFSET_HOURS,
    Number(minute),
    Number(second),
  )
  return Math.floor((target - now) / 86_400_000)
}

/**
 * Observed usage trend of the current plan period.
 *
 * Burn is the usage delta over the observation's own elapsed time (fractional
 * days, never calendar days), so a same-observation day can never divide by
 * zero while the six-hour gate holds.
 * @param usedNow - tokens used in the current period.
 * @param limit - the current period's token limit.
 * @param firstSeen - the period's first observed counts, when observed.
 * @param now - Host clock, epoch ms.
 * @param daysLeft - whole days until the period resets.
 * @returns the trend, or null when any presence gate refuses it.
 */
export function computeBurn(
  usedNow: number,
  limit: number,
  firstSeen: { usedTokens: number; at: number } | undefined,
  now: number,
  daysLeft: number,
): UsageBurnReport | null {
  if (firstSeen === undefined) return null
  const elapsedMs = now - firstSeen.at
  if (elapsedMs < BURN_MIN_OBSERVATION_MS) return null
  const remaining = limit - usedNow
  if (remaining <= 0) return null
  const dailyTokens = (usedNow - firstSeen.usedTokens) / (elapsedMs / 86_400_000)
  if (!(dailyTokens > 0)) return null
  const projectedDays = Math.ceil(remaining / dailyTokens)
  if (projectedDays > daysLeft) return null
  return {
    dailyTokens: Math.round(dailyTokens),
    observedSince: new Date(firstSeen.at).toISOString(),
    projectedDays,
  }
}

/**
 * Field names of an unparsed report, one nesting level deep, for the failure
 * diagnostic: names are enough to retarget the parser and never carry values.
 * @param report - the decoded JSON body that failed to parse.
 * @returns sorted `parent.child` field paths found in the body.
 */
export function reportFieldNames(report: unknown): string[] {
  if (typeof report !== 'object' || report === null) return []
  const names = new Set<string>()
  for (const [key, value] of Object.entries(report as Record<string, unknown>)) {
    names.add(key)
    if (typeof value === 'object' && value !== null) {
      for (const nested of Object.keys(value)) names.add(`${key}.${nested}`)
    }
  }
  return [...names].sort()
}
