import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { formatLatency } from '../src/client/format.ts'
import { en } from '../src/client/locales.ts'
import { windowLatency } from '../src/client/usage.ts'

const NOW = 1_000_000
const MINUTE = 60_000

const routes = [{
  provider: 'mock',
  model: 'a',
  samples: [
    { at: NOW - 2 * 60 * MINUTE, ms: 9_900 }, // before both windows
    { at: NOW - 30 * MINUTE, ms: 2_400 }, // hour only
    { at: NOW - MINUTE, ms: 1_200 }, // both windows
  ],
}]

describe('windowLatency', () => {
  it('averages only the calls that ran inside the window', () => {
    expect(windowLatency(routes, 'mock', 'a', NOW, 15 * MINUTE)).toBe(1_200)
    expect(windowLatency(routes, 'mock', 'a', NOW, 60 * MINUTE)).toBe(1_800)
    expect(windowLatency(routes, 'mock', 'a', NOW, 2 * 60 * MINUTE)).toBe(4_500)
  })

  it('reports nothing without the model in use or without in-window calls', () => {
    expect(windowLatency(routes, 'mock', 'b', NOW, 60 * MINUTE)).toBeUndefined()
    expect(windowLatency(routes, undefined, 'a', NOW, 60 * MINUTE)).toBeUndefined()
    expect(windowLatency(routes, 'mock', undefined, NOW, 60 * MINUTE)).toBeUndefined()
    expect(windowLatency(undefined, 'mock', 'a', NOW, 60 * MINUTE)).toBeUndefined()
    expect(windowLatency(routes, 'mock', 'a', NOW, MINUTE / 2)).toBeUndefined()
  })
})

describe('formatLatency', () => {
  const t = makeTranslate(en, commonEn) as Parameters<typeof formatLatency>[1]

  it.each([
    [860, '860ms'],
    [1_200, '1.2s'],
    [9_900, '9.9s'],
  ])('formats %d ms as %s', (value, expected) => {
    expect(formatLatency(value, t)).toBe(expected)
  })
})
