import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { apply, inject } from '../src/client/index.ts'
import type {
  SessionQueryFilterEventsRequest,
  SessionQueryFilterEventsValue,
  SessionQueryListValue,
  SessionQueryReadValue,
  SessionQueryTraceValue,
} from '../src/types.ts'

const roots = new Set<Context>()

afterEach(async () => {
  await Promise.all([...roots].map(ctx => ctx.fiber.dispose()))
  roots.clear()
})

async function mount(): Promise<{
  ctx: Context
  calls: Array<{ method: string; request: unknown }>
}> {
  const ctx = new Context()
  roots.add(ctx)
  const calls: Array<{ method: string; request: unknown }> = []
  const sessionQueries = {
    listSessions: async (request: unknown) => {
      calls.push({ method: 'listSessions', request })
      return { ok: true as const, value: [] }
    },
    readSession: async (request: unknown) => {
      calls.push({ method: 'readSession', request })
      return { ok: false as const, error: { code: 'session-query/session-not-found', message: 'missing', details: {} } }
    },
    filterEvents: async (request: unknown) => {
      calls.push({ method: 'filterEvents', request })
      return { ok: true as const, value: [] }
    },
    traceSession: async (request: unknown) => {
      calls.push({ method: 'traceSession', request })
      return { ok: true as const, value: { target: null, ancestors: [], descendants: [] } }
    },
  }
  ctx.reflect.provide('remote', { ...sessionQueries, sessionQueries })
  ctx.reflect.provide('remote.sessionQueries', sessionQueries)
  await apply(ctx)
  return { ctx, calls }
}

describe('SessionQueryController client half', () => {
  it('declares the Remote services it binds', () => {
    expect(inject).toEqual(['remote', 'remote.sessionQueries'])
  })

  it('installs ctx.sessionQueries and forwards exact reads to the namespace', async () => {
    const { ctx, calls } = await mount()
    expect(ctx.sessionQueries).toBeDefined()

    const list = await ctx.sessionQueries.listSessions()
    expect(list).toEqual({ ok: true, value: [] })
    const read = await ctx.sessionQueries.readSession(SessionId('s1'))
    expect(read).toEqual({
      ok: false,
      error: { code: 'session-query/session-not-found', message: 'missing', details: {} },
    })
    const filtered = await ctx.sessionQueries.filterEvents(SessionId('s1'), [])
    expect(filtered).toEqual({ ok: true, value: [] })
    const traced = await ctx.sessionQueries.traceSession(SessionId('s1'))
    expect((traced as RemoteResult<SessionQueryTraceValue>).ok ? (traced as { ok: true; value: SessionQueryTraceValue }).value : traced)
      .toMatchObject({ target: null })

    expect(calls).toEqual([
      { method: 'listSessions', request: {} },
      { method: 'readSession', request: { sessionId: 's1' } },
      { method: 'filterEvents', request: { sessionId: 's1', filters: [] } },
      { method: 'traceSession', request: { sessionId: 's1' } },
    ])
  })

  it('re-exports the request and value wire types', () => {
    // Type-level re-export contract: the public client surface names the same
    // request/value types the Host declares, so a comparison seat compiles
    // against one shared vocabulary.
    const sessionId = 're-export-check' as SessionId
    const _req: SessionQueryFilterEventsRequest = { sessionId, filters: [] }
    const _list: SessionQueryListValue = [] as unknown as SessionQueryListValue
    const _read: SessionQueryReadValue = {
      session: { id: 'x', type: 'session', createdAt: 1 },
      inheritedEventCount: 0,
      events: [],
    }
    const _filter: SessionQueryFilterEventsValue = []
    void _req; void _list; void _read; void _filter
    expect(true).toBe(true)
  })
})
