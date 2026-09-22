import { describe, expect, it } from 'vitest'
import { parseUsageLimits, reportFieldNames } from '../src/usage.ts'

describe('parseUsageLimits', () => {
  it('reads the console counts as one monthly window', () => {
    expect(parseUsageLimits({ used: 12_345, limit: 5_000_000, resetTime: '2026-10-01 00:00' })).toEqual([{
      period: 'month',
      usedTokens: 12_345,
      limitTokens: 5_000_000,
      resetsAt: '2026-10-01 00:00',
    }])
  })

  it('omits the reset moment the report leaves out', () => {
    expect(parseUsageLimits({ used: 0, limit: 1 })).toEqual([{
      period: 'month',
      usedTokens: 0,
      limitTokens: 1,
    }])
  })

  it.each([
    ['non-object body', 'used 12'],
    ['null body', null],
    ['string counts', { used: '12', limit: '5000' }],
    ['fractional count', { used: 1.5, limit: 10 }],
    ['negative count', { used: -1, limit: 10 }],
    ['zero limit', { used: 1, limit: 0 }],
    ['non-string reset', { used: 1, limit: 10, resetTime: 7 }],
  ])('refuses %s', (_label, report) => {
    expect(parseUsageLimits(report)).toBeNull()
  })
})

describe('reportFieldNames', () => {
  it('names the fields one nesting level deep', () => {
    expect(reportFieldNames({ data: { usedTokens: 1, limitTokens: 2 }, planName: 'Lite' }))
      .toEqual(['data', 'data.limitTokens', 'data.usedTokens', 'planName'])
  })

  it('names nothing in a non-object body', () => {
    expect(reportFieldNames('nope')).toEqual([])
    expect(reportFieldNames(null)).toEqual([])
  })
})
