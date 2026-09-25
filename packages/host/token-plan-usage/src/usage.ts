/**
 * Pure parsing of the console's Token Plan usage report into meter windows.
 *
 * The report nests its counters under `data.monthUsage.items`; each row names
 * one counter and carries the console's own `used`/`limit` counts. The row
 * named `month_total_token` is the monthly quota, so the report becomes one
 * `month` window. A report without that row is not a usage report at all:
 * parsing returns null and the caller reports absence instead of guessing.
 */

import type { UsageLimitReport } from './shared.ts'

/**
 * Parse one Token Plan usage report.
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
  const row = items.find(item => typeof item === 'object'
    && item !== null
    && (item as { name?: unknown }).name === 'month_total_token')
  if (row === undefined) return null
  const { used, limit } = row as { used?: unknown; limit?: unknown }
  if (typeof used !== 'number' || !Number.isInteger(used) || used < 0) return null
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) return null
  return [{ period: 'month', usedTokens: used, limitTokens: limit }]
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
