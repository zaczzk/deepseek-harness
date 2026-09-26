import { describe, expect, it } from 'vitest'
import { computeBurn, daysUntilReset, parseCredits, parsePlan, parseUsageLimits, recordObservation, reportFieldNames } from '../src/usage.ts'

/** The console's live report shape, captured from `tokenPlan/usage`. */
const REPORT = {
  code: 0,
  message: '',
  data: {
    monthUsage: {
      percent: 0.3356,
      items: [{ name: 'month_total_token', used: 12_751_091_709, limit: 38_000_000_000, percent: 0.3356 }],
    },
    usage: {
      percent: 0.34,
      items: [
        { name: 'plan_total_token', used: 12_751_091_709, limit: 38_000_000_000, percent: 0.34 },
        { name: 'compensation_total_token', used: 0, limit: 0, percent: 0 },
      ],
    },
  },
}

const DETAIL = {
  code: 0,
  message: '',
  data: {
    planCode: 'pro',
    planName: 'Pro',
    currentPeriodEnd: '2026-10-22 23:59:59',
    expired: false,
  },
}

describe('parseUsageLimits', () => {
  it('reads the monthly quota row as one monthly window', () => {
    expect(parseUsageLimits(REPORT)).toEqual([{
      period: 'month',
      usedTokens: 12_751_091_709,
      limitTokens: 38_000_000_000,
    }])
  })

  it('reads a report whose month row is the only item', () => {
    expect(parseUsageLimits({
      data: { monthUsage: { items: [{ name: 'month_total_token', used: 0, limit: 1 }] } },
    })).toEqual([{ period: 'month', usedTokens: 0, limitTokens: 1 }])
  })

  it('reads the month row wherever it sits in a large report', () => {
    const items = Array.from({ length: 10_000 }, (_unused, index) => ({ name: `row_${String(index)}`, used: index, limit: 10 }))
    items.push({ name: 'month_total_token', used: 5, limit: 9 })
    expect(parseUsageLimits({ data: { monthUsage: { items } } }))
      .toEqual([{ period: 'month', usedTokens: 5, limitTokens: 9 }])
  })

  it('ignores a row whose name rides a `__proto__` key', () => {
    const body: unknown = JSON.parse('{"data":{"monthUsage":{"items":[{"__proto__":{"name":"month_total_token"},"used":1,"limit":2}]}}}')
    expect(parseUsageLimits(body)).toBeNull()
    expect(Object.hasOwn(Object.prototype, 'name')).toBe(false)
  })

  it.each([
    ['a non-object body', 'used 12'],
    ['null body', null],
    ['a body without data', {}],
    ['a body without monthUsage', { data: {} }],
    ['a body without items', { data: { monthUsage: {} } }],
    ['a report without the month row', { data: { monthUsage: { items: [{ name: 'plan_total_token', used: 1, limit: 2 }] } } }],
    ['string counts', { data: { monthUsage: { items: [{ name: 'month_total_token', used: '1', limit: 2 }] } } }],
    ['a fractional count', { data: { monthUsage: { items: [{ name: 'month_total_token', used: 1.5, limit: 2 }] } } }],
    ['a negative count', { data: { monthUsage: { items: [{ name: 'month_total_token', used: -1, limit: 2 }] } } }],
    ['a zero limit', { data: { monthUsage: { items: [{ name: 'month_total_token', used: 1, limit: 0 }] } } }],
    ['a NaN count', { data: { monthUsage: { items: [{ name: 'month_total_token', used: Number.NaN, limit: 2 }] } } }],
    ['an infinite count', { data: { monthUsage: { items: [{ name: 'month_total_token', used: Number.POSITIVE_INFINITY, limit: 2 }] } } }],
    ['a count beyond the safe integer range', { data: { monthUsage: { items: [{ name: 'month_total_token', used: 2 ** 53, limit: 2 }] } } }],
    ['a limit beyond the safe integer range', { data: { monthUsage: { items: [{ name: 'month_total_token', used: 1, limit: 2 ** 53 }] } } }],
  ])('refuses %s', (_label, report) => {
    expect(parseUsageLimits(report)).toBeNull()
  })
})

describe('parseCredits', () => {
  const withCreditRow = (used: number, limit: number): unknown => ({
    data: { usage: { items: [{ name: 'compensation_total_token', used, limit }] } },
  })

  it('reports a nonzero grant', () => {
    expect(parseCredits(withCreditRow(2_400, 0))).toEqual({ usedTokens: 2_400, limitTokens: 0 })
    expect(parseCredits(withCreditRow(0, 500))).toEqual({ usedTokens: 0, limitTokens: 500 })
  })

  it('keeps an all-zero row off the wire', () => {
    expect(parseCredits(REPORT)).toBeNull()
    expect(parseCredits(withCreditRow(0, 0))).toBeNull()
  })

  it.each([
    ['a non-object body', 7],
    ['a null body', null],
    ['a body without data', {}],
    ['a null data member', { data: null }],
    ['a body without usage', { data: {} }],
    ['a body without items', { data: { usage: {} } }],
    ['a body without the row', { data: { usage: { items: [] } } }],
    ['string counts', { data: { usage: { items: [{ name: 'compensation_total_token', used: '1', limit: 0 }] } } }],
    ['a non-numeric credit limit', { data: { usage: { items: [{ name: 'compensation_total_token', used: 0, limit: 'x' }] } } }],
    ['a negative count', { data: { usage: { items: [{ name: 'compensation_total_token', used: -1, limit: 0 }] } } }],
    ['a negative credit limit', { data: { usage: { items: [{ name: 'compensation_total_token', used: 0, limit: -1 }] } } }],
    ['a count beyond the safe integer range', { data: { usage: { items: [{ name: 'compensation_total_token', used: 2 ** 53, limit: 0 }] } } }],
  ])('refuses %s', (_label, report) => {
    expect(parseCredits(report)).toBeNull()
  })

  it('serializes a negative-zero count as zero on the wire', () => {
    const parsed = parseCredits(withCreditRow(-0, 5))
    expect(JSON.stringify(parsed)).toBe('{"usedTokens":0,"limitTokens":5}')
  })
})

describe('parsePlan', () => {
  it('reads the plan name and the naive period end', () => {
    expect(parsePlan(DETAIL, Date.UTC(2026, 8, 25)))
      .toEqual({ name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27 })
  })

  it.each([
    ['a non-object body', 'detail'],
    ['a null body', null],
    ['a body without data', {}],
    ['a null data member', { data: null }],
    ['an empty name', { data: { planName: '', currentPeriodEnd: '2026-10-22 23:59:59' } }],
    ['a non-string name', { data: { planName: 5, currentPeriodEnd: '2026-10-22 23:59:59' } }],
    ['a missing name', { data: { currentPeriodEnd: '2026-10-22 23:59:59' } }],
    ['a non-string period end', { data: { planName: 'Pro', currentPeriodEnd: 5 } }],
    ['a malformed period end', { data: { planName: 'Pro', currentPeriodEnd: '2026-10-22' } }],
    ['an offset-carrying period end', { data: { planName: 'Pro', currentPeriodEnd: '2026-10-22T23:59:59Z' } }],
    ['a thirteenth month', { data: { planName: 'Pro', currentPeriodEnd: '2026-13-01 00:00:00' } }],
    ['a February date that does not exist', { data: { planName: 'Pro', currentPeriodEnd: '2026-02-30 00:00:00' } }],
    ['an hour beyond the day', { data: { planName: 'Pro', currentPeriodEnd: '2026-10-22 24:00:00' } }],
    ['a second beyond the minute', { data: { planName: 'Pro', currentPeriodEnd: '2026-10-22 23:59:60' } }],
  ])('refuses %s', (_label, report) => {
    expect(parsePlan(report, Date.UTC(2026, 8, 25))).toBeNull()
  })
})

describe('recordObservation', () => {
  it('starts, adopts, resets, and holds the period observation', () => {
    const seeded = { usedTokens: 100, at: 10, period: '' }
    const named = { usedTokens: 100, at: 10, period: '2026-10-22 23:59:59' }
    expect(recordObservation(undefined, { usedTokens: 100 }, '', 10)).toEqual(seeded)
    // An observation from before the plan adopts the period name and keeps its window.
    expect(recordObservation(seeded, { usedTokens: 700 }, '2026-10-22 23:59:59', 20)).toEqual(named)
    // A different named period starts a new observation.
    expect(recordObservation(named, { usedTokens: 700 }, '2026-11-22 23:59:59', 20))
      .toEqual({ usedTokens: 700, at: 20, period: '2026-11-22 23:59:59' })
    expect(recordObservation(named, { usedTokens: 700 }, '2026-10-22 23:59:59', 20)).toEqual(named)
    expect(recordObservation(named, undefined, '', 20)).toEqual(named)
  })
})

describe('daysUntilReset', () => {
  it('reads the naive period end in the plan calendar', () => {
    // 2026-10-22 23:59:59 +08:00 is 2026-10-22T15:59:59Z.
    const now = Date.UTC(2026, 9, 1, 15, 59, 59)
    expect(daysUntilReset('2026-10-22 23:59:59', now)).toBe(21)
  })

  it('floors a partial day and never rolls the date across the zone', () => {
    // One second past midnight plan time is 0 days, not 1; a full day plus a
    // second floors to 1.
    expect(daysUntilReset('2026-12-31 23:59:59', Date.UTC(2026, 11, 31, 15, 59, 59))).toBe(0)
    expect(daysUntilReset('2026-12-31 23:59:59', Date.UTC(2026, 11, 30, 14, 0, 0))).toBe(1)
  })

  it('counts from a clock before the epoch as one day per day', () => {
    expect(daysUntilReset('2026-10-22 23:59:59', -86_400_000))
      .toBe(daysUntilReset('2026-10-22 23:59:59', 0)! + 1)
  })

  it('refuses anything but the naive shape', () => {
    expect(daysUntilReset('2026-10-22', 0)).toBeNull()
  })

  it('refuses fields that are shaped right but form no calendar moment', () => {
    expect(daysUntilReset('2026-13-01 00:00:00', 0)).toBeNull()
    expect(daysUntilReset('2026-02-30 00:00:00', 0)).toBeNull()
    expect(daysUntilReset('2026-10-22 24:00:00', 0)).toBeNull()
    expect(daysUntilReset('2026-10-22 23:59:60', 0)).toBeNull()
  })
})

describe('computeBurn', () => {
  const HOUR = 3_600_000
  const firstSeen = { usedTokens: 100, at: 0 }

  it('projects the observed usage delta over elapsed fractional days', () => {
    // 24h of observation, 2400 more tokens → 2400/day; 31200 remaining → 13 days.
    const burn = computeBurn(2_500, 33_700, firstSeen, 24 * HOUR, 30)
    expect(burn).toEqual({ dailyTokens: 2_400, observedSince: '1970-01-01T00:00:00.000Z', projectedDays: 13 })
  })

  it('refuses an observation that is too short, empty, or out of runway', () => {
    expect(computeBurn(2_500, 33_700, firstSeen, 5 * HOUR, 30)).toBeNull()
    expect(computeBurn(2_500, 33_700, undefined, 24 * HOUR, 30)).toBeNull()
    expect(computeBurn(2_500, 33_700, firstSeen, 24 * HOUR, 12)).toBeNull()
  })

  it('refuses when the clock stands still or moves backwards', () => {
    // `firstSeen.at` is the observation start: zero and negative elapsed both
    // refuse instead of dividing by zero or a negative window.
    expect(computeBurn(2_500, 33_700, firstSeen, firstSeen.at, 30)).toBeNull()
    expect(computeBurn(2_500, 33_700, firstSeen, -HOUR, 30)).toBeNull()
  })

  it('refuses a zero burn, a spent period, and an exhausted limit', () => {
    expect(computeBurn(100, 33_700, firstSeen, 24 * HOUR, 30)).toBeNull()
    expect(computeBurn(2_500, 2_500, firstSeen, 24 * HOUR, 30)).toBeNull()
    expect(computeBurn(2_500, 1_000, firstSeen, 24 * HOUR, 30)).toBeNull()
  })
})

describe('reportFieldNames', () => {
  it('names the fields one nesting level deep', () => {
    expect(reportFieldNames({ data: { usedTokens: 1, limitTokens: 2 }, planName: 'Pro' }))
      .toEqual(['data', 'data.limitTokens', 'data.usedTokens', 'planName'])
  })

  it('names nothing in a non-object body', () => {
    expect(reportFieldNames('nope')).toEqual([])
    expect(reportFieldNames(null)).toEqual([])
  })
})
