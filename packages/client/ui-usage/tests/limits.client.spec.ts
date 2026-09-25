import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_PLAN_USAGE_PATH } from '@deepseek-ai/dsh-host-token-plan-usage/shared'
import { loadLimits, readReport } from '../src/client/limits.ts'

afterEach(() => { vi.unstubAllGlobals() })

/** One wire report with every optional member present. */
const REPORT = {
  limits: [{ period: 'month', usedTokens: 4, limitTokens: 10 }],
  plan: {
    name: 'Pro',
    resetsAt: '2026-10-22 23:59:59',
    daysUntilReset: 27,
    burn: { dailyTokens: 2_104_075_691, observedSince: '2026-09-25T02:10:00.000Z', projectedDays: 12 },
  },
  credits: { usedTokens: 2_400, limitTokens: 0 },
  state: 'ok',
}

describe('readReport', () => {
  it('reads the windows, plan, credits, and session state', () => {
    expect(readReport(REPORT)).toEqual(REPORT)
    expect(readReport({ limits: [], state: 'expired' })).toEqual({ limits: [], state: 'expired' })
    expect(readReport({ limits: [{ period: 'week', usedTokens: 1, limitTokens: 2 }], state: 'ok' }))
      .toEqual({ limits: [{ period: 'week', usedTokens: 1, limitTokens: 2 }], state: 'ok' })
    expect(readReport({
      limits: [],
      plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27 },
      state: 'ok',
    })).toEqual({
      limits: [],
      plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27 },
      state: 'ok',
    })
    expect(readReport({ limits: [], credits: { usedTokens: 1, limitTokens: 0 }, state: 'ok' }))
      .toEqual({ limits: [], credits: { usedTokens: 1, limitTokens: 0 }, state: 'ok' })
  })

  it.each([
    ['a non-object body', 7],
    ['a null body', null],
    ['a missing list', {}],
    ['a non-array list', { limits: {}, state: 'ok' }],
    ['an unreported period', { limits: [{ period: 'day', usedTokens: 1, limitTokens: 2 }], state: 'ok' }],
    ['non-numeric counts', { limits: [{ period: 'week', usedTokens: '1', limitTokens: 2 }], state: 'ok' }],
    ['a non-object entry', { limits: ['nope'], state: 'ok' }],
    ['a null entry', { limits: [null], state: 'ok' }],
    ['a missing state', { limits: [] }],
    ['an unknown state', { limits: [], state: 'later' }],
    ['a null plan', { limits: [], plan: null, state: 'ok' }],
    ['a non-object plan', { limits: [], plan: 5, state: 'ok' }],
    ['a malformed plan', { limits: [], plan: { name: 'Pro' }, state: 'ok' }],
    ['a non-string name', {
      limits: [], plan: { name: 5, resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27 }, state: 'ok',
    }],
    ['an empty name', {
      limits: [], plan: { name: '', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27 }, state: 'ok',
    }],
    ['a non-string resetsAt', { limits: [], plan: { name: 'Pro', resetsAt: 5, daysUntilReset: 27 }, state: 'ok' }],
    ['a fractional days count', {
      limits: [], plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 1.5 }, state: 'ok',
    }],
    ['a plan with a non-naive period end', {
      limits: [], plan: { name: 'Pro', resetsAt: '2026-10-22T23:59:59Z', daysUntilReset: 27 }, state: 'ok',
    }],
    ['a null burn', {
      limits: [],
      plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27, burn: null },
      state: 'ok',
    }],
    ['a non-object burn', {
      limits: [],
      plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27, burn: 5 },
      state: 'ok',
    }],
    ['a malformed burn', {
      limits: [],
      plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27, burn: {} },
      state: 'ok',
    }],
    ['a fractional projected day', {
      limits: [],
      plan: {
        name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27,
        burn: { dailyTokens: 1, observedSince: '2026-09-25T02:10:00.000Z', projectedDays: 1.5 },
      },
      state: 'ok',
    }],
    ['a null credits pair', { limits: [], credits: null, state: 'ok' }],
    ['a non-object credits pair', { limits: [], credits: 5, state: 'ok' }],
    ['a malformed credits pair', { limits: [], credits: { usedTokens: 1 }, state: 'ok' }],
  ])('refuses %s', (_label, body) => {
    expect(readReport(body)).toBeNull()
  })
})

describe('loadLimits', () => {
  it('reads the Host usage route', async () => {
    const seen: { url: string | undefined; accept: string | undefined } = { url: undefined, accept: undefined }
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      seen.url = url
      seen.accept = (init?.headers as Record<string, string>).accept
      return Promise.resolve(new Response(JSON.stringify(REPORT), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetcher)
    expect(await loadLimits()).toEqual(REPORT)
    expect(seen).toEqual({ url: TOKEN_PLAN_USAGE_PATH, accept: 'application/json' })
  })

  it('publishes the empty report through a failed read', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('host unreachable'))))
    expect(await loadLimits()).toEqual({ limits: [], state: 'ok' })
  })

  it('publishes the empty report for a body that is not a report', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('oops', { status: 500 }))))
    expect(await loadLimits()).toEqual({ limits: [], state: 'ok' })
  })

  it('publishes the empty report for valid JSON that is not a report', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ hello: 1 }), { status: 200 }))))
    expect(await loadLimits()).toEqual({ limits: [], state: 'ok' })
  })
})
