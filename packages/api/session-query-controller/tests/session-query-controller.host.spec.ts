import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionLogSnapshot } from '@deepseek-ai/dsh-session-query'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import SessionQueryController from '../src/index.ts'
import type { SessionQueryReadValue } from '../src/types.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

function sessionId(raw: string): SessionId {
  return SessionId(raw)
}

function event(overrides: Record<string, unknown> = {}): SessionEvent {
  return {
    type: 'user/message',
    seq: 0,
    time: 1,
    data: { text: 'hi' },
    ...overrides,
  } as unknown as SessionEvent
}

function snapshot(events: readonly SessionEvent[]): SessionLogSnapshot {
  return {
    session: {
      version: 4,
      id: 'snapshot-session',
      createdAt: 1,
    },
    inheritedEventCount: 0,
    events: events as SessionEvent[],
  } as unknown as SessionLogSnapshot
}

/** A live `ctx.sessionQuery` engine whose reads the spec drives synchronously. */
function engine(reads: {
  list?: () => Promise<Array<{ header: { id: string }; live: true; persisted: true }>>
  read?: (id: SessionId) => Promise<unknown>
  filter?: (id: SessionId) => Promise<unknown>
  trace?: (id: SessionId) => Promise<unknown>
}) {
  return {
    // The abstract engine also declares searchSessions/searchEvents; the
    // controller never reaches them, so resilient stubs keep the interface real.
    listSessions: reads.list ?? (async () => []),
    readSession: reads.read ?? (async (_id: SessionId) => snapshot([])),
    filterEvents: reads.filter ?? (async () => []),
    traceSession: reads.trace ?? (async (_id: SessionId) => ({ target: null, ancestors: [], descendants: [] })),
    searchSessions: async () => ({ items: [] }),
    searchEvents: async () => ({ items: [] }),
  }
}

async function mount(reads: Parameters<typeof engine>[0]): Promise<SessionQueryController> {
  const ctx = new Context()
  roots.push(ctx)
  ctx.provide('sessionQuery', engine(reads) as never)
  const controller = new SessionQueryController(ctx, {})
  return controller
}

function remoteCode(run: () => Promise<unknown>): Promise<string> {
  return run().then(
    () => Promise.reject(new Error('expected the Remote method to reject')),
    (error: unknown) => {
      const failure = remoteErrorOf(error)
      if (failure === undefined) throw error
      return failure.code
    },
  )
}

describe('SessionQueryController host face', () => {
  it('lists the complete corpus, reusing the domain record set', async () => {
    const controller = await mount({
      list: async () => [{ header: { id: 's1', type: 'session', createdAt: 1 }, live: true, persisted: true }],
    })
    expect(await controller.listSessions({})).toEqual([
      { header: { id: 's1', type: 'session', createdAt: 1 }, live: true, persisted: true },
    ])
  })

  it('projects a read onto the JSON-bounded wire envelope', async () => {
    const controller = await mount({
      read: async () => snapshot([
        event({ seq: 0, data: { text: 'hello' }, surfaceOp: 'append', sourceEventSeqs: [3], ignorable: true }),
        event({ seq: 1, data: { n: 2 } }),
      ]),
    })
    const value = await controller.readSession({ sessionId: sessionId('s1') }) as SessionQueryReadValue
    expect(value.inheritedEventCount).toBe(0)
    expect(value.session).toEqual({ version: 4, id: 'snapshot-session', createdAt: 1 })
    expect(value.events).toEqual([
      { type: 'user/message', seq: 0, time: 1, data: { text: 'hello' }, surfaceOp: 'append', sourceEventSeqs: [3], ignorable: true },
      { type: 'user/message', seq: 1, time: 1, data: { n: 2 } },
    ])
  })

  it('filters one session and traces a lineage through the domain', async () => {
    const controller = await mount({
      filter: async () => [{ sessionId: sessionId('s1'), seq: 1, type: 'user/message', time: 2, surface: 'current' }],
      trace: async () => ({
        target: { header: { id: 's1', type: 'session', createdAt: 1 }, live: true, persisted: true },
        ancestors: [],
        descendants: [],
      }),
    })
    const documents = await controller.filterEvents({ sessionId: sessionId('s1'), filters: [] })
    expect(documents).toHaveLength(1)
    const trace = await controller.traceSession({ sessionId: sessionId('s1') })
    expect(trace.target.header.id).toBe('s1')
  })

  it('maps a typed SESSION_QUERY failure onto its kebab Remote code', async () => {
    const controller = await mount({
      read: async () => {
        const error = new Error('missing') as Error & { code: string }
        error.code = 'SESSION_QUERY_SESSION_NOT_FOUND'
        throw error
      },
    })
    expect(await remoteCode(() => controller.readSession({ sessionId: sessionId('nope') })))
      .toBe('session-query/session-not-found')
  })

  it('falls back to session-query/error for an untyped throw', async () => {
    const controller = await mount({
      list: async () => { throw new Error('boom') },
      filter: async () => { throw 'not-an-error' },
      trace: async () => { throw new Error('trace bomb') },
    })
    expect(await remoteCode(() => controller.listSessions({}))).toBe('session-query/error')
    expect(await remoteCode(() => controller.filterEvents({ sessionId: sessionId('s1'), filters: [] })))
      .toBe('session-query/error')
    expect(await remoteCode(() => controller.traceSession({ sessionId: sessionId('s1') })))
      .toBe('session-query/error')
  })
})
