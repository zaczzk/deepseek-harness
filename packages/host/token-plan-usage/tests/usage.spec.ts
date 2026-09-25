import { describe, expect, it } from 'vitest'
import { parseUsageLimits, reportFieldNames } from '../src/usage.ts'

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
  ])('refuses %s', (_label, report) => {
    expect(parseUsageLimits(report)).toBeNull()
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
