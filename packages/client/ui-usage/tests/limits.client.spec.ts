import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_PLAN_USAGE_PATH } from '@deepseek-ai/dsh-host-token-plan-usage/shared'
import { loadLimits, readLimits } from '../src/client/limits.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('readLimits', () => {
  it('reads reported week and month windows', () => {
    expect(readLimits({
      limits: [
        { period: 'month', usedTokens: 4, limitTokens: 10 },
        { period: 'week', usedTokens: 1, limitTokens: 2, resetsAt: 'soon' },
      ],
    })).toEqual([
      { period: 'month', usedTokens: 4, limitTokens: 10 },
      { period: 'week', usedTokens: 1, limitTokens: 2, resetsAt: 'soon' },
    ])
  })

  it.each([
    ['a non-object body', 7],
    ['a missing list', {}],
    ['a non-array list', { limits: {} }],
    ['an unreported period', { limits: [{ period: 'day', usedTokens: 1, limitTokens: 2 }] }],
    ['non-numeric counts', { limits: [{ period: 'week', usedTokens: '1', limitTokens: 2 }] }],
    ['a non-object entry', { limits: ['nope'] }],
  ])('ignores %s', (_label, body) => {
    expect(readLimits(body)).toEqual([])
  })
})

describe('loadLimits', () => {
  it('reads the Host usage route', async () => {
    const seen: { url: string | undefined; accept: string | undefined } = { url: undefined, accept: undefined }
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      seen.url = url
      seen.accept = (init?.headers as Record<string, string>).accept
      return Promise.resolve(new Response(
        JSON.stringify({ limits: [{ period: 'month', usedTokens: 4, limitTokens: 10 }] }),
        { status: 200 },
      ))
    })
    vi.stubGlobal('fetch', fetcher)
    expect(await loadLimits()).toEqual([{ period: 'month', usedTokens: 4, limitTokens: 10 }])
    expect(seen).toEqual({ url: TOKEN_PLAN_USAGE_PATH, accept: 'application/json' })
  })

  it('reports no windows through a failed read', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('host unreachable'))))
    expect(await loadLimits()).toEqual([])
  })
})
