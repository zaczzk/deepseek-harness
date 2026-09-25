import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { formatLatencyPair, formatPlanReset, formatRunway } from '../src/client/format.ts'
import { en } from '../src/client/locales.ts'
import { windowLatencyP95 } from '../src/client/usage.ts'

const t = makeTranslate(en, commonEn) as Parameters<typeof formatRunway>[1]
const NOW = 1_000_000
const MINUTE = 60_000

const routeWith = (...latencies: number[]): [{ provider: string; model: string; samples: { at: number; ms: number }[] }] =>
  [{ provider: 'mock', model: 'a', samples: latencies.map(ms => ({ at: NOW - MINUTE, ms })) }]

describe('windowLatencyP95', () => {
  it('reports the nearest-rank tail of the in-window samples', () => {
    // Five samples rank the tail at the largest value.
    expect(windowLatencyP95(routeWith(1_000, 1_200, 1_300, 1_400, 9_000), 'mock', 'a', NOW, 15 * MINUTE)).toBe(9_000)
    // Twenty samples rank at the 19th value: the single worst call sits
    // outside the tail, which is what makes the tail a tail.
    const twenty = routeWith(...[...Array.from({ length: 19 }, (_unused, index) => 1_000 + index), 9_000])
    expect(windowLatencyP95(twenty, 'mock', 'a', NOW, 15 * MINUTE)).toBe(1_018)
  })

  it('reports nothing below five samples or without the model in use', () => {
    const few = routeWith(1, 2)
    expect(windowLatencyP95(few, 'mock', 'a', NOW, 15 * MINUTE)).toBeUndefined()
    expect(windowLatencyP95(undefined, 'mock', 'a', NOW, 15 * MINUTE)).toBeUndefined()
    expect(windowLatencyP95(few, 'mock', 'b', NOW, 15 * MINUTE)).toBeUndefined()
    expect(windowLatencyP95(few, undefined, 'a', NOW, 15 * MINUTE)).toBeUndefined()
    expect(windowLatencyP95(few, 'mock', undefined, NOW, 15 * MINUTE)).toBeUndefined()
  })
})

describe('formatPlanReset', () => {
  it('reads the month and day out of the naive period end', () => {
    expect(formatPlanReset('2026-12-31 23:59:59')).toBe('12-31')
    expect(formatPlanReset('2026-10-22 23:59:59')).toBe('10-22')
  })
})

describe('formatLatencyPair and formatRunway', () => {
  it('compose the pinned row values', () => {
    expect(formatLatencyPair(1_200, 3_100, t)).toBe('1.2s · p95 3.1s')
    expect(formatLatencyPair(860, 3_100, t)).toBe('860ms · p95 3.1s')
    expect(formatRunway(12, t)).toBe('≈12d')
  })
})
