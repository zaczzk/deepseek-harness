/**
 * Pure parsing of the console's Token Plan usage report into meter windows.
 *
 * The console's plan-usage contract names its two counts `used` and `limit`
 * (`{{used}} / {{limit}}` in its own usage line); the window resets monthly,
 * so the report becomes one `month` window. A report that does not carry
 * those counts is not a usage report at all: parsing returns null and the
 * caller reports absence instead of guessing.
 */

import type { UsageLimitReport } from './shared.ts'

/**
 * Parse one Token Plan usage report.
 * @param report - the decoded JSON body of the provider's usage endpoint.
 * @returns the reported windows, or null when the body carries no usable counts.
 */
export function parseUsageLimits(report: unknown): UsageLimitReport[] | null {
  if (typeof report !== 'object' || report === null) return null
  const { used, limit, resetTime } = report as { used?: unknown; limit?: unknown; resetTime?: unknown }
  if (typeof used !== 'number' || !Number.isInteger(used) || used < 0) return null
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) return null
  if (resetTime !== undefined && typeof resetTime !== 'string') return null
  return [{
    period: 'month',
    usedTokens: used,
    limitTokens: limit,
    ...resetTime === undefined ? {} : { resetsAt: resetTime },
  }]
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
