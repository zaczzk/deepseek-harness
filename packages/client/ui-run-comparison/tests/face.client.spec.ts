/** The run-comparison face: ordered roster and log reads into the store. */
import { describe, expect, it, vi } from 'vitest'
import { registerFace } from '../src/client/face.ts'
import { createRunComparisonStore } from '../src/client/store.ts'
import type {
  SessionQueryListValue,
  SessionQueryReadValue,
} from '@deepseek-ai/dsh-api-session-query-controller/types'

function bench() {
  const store = createRunComparisonStore()
  const instance = store.create('session-1')
  return {
    instance, actions: instance.actions,
    state: () => instance.getSnapshot(),
  }
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

interface IQueries {
  listSessions(): Promise<unknown>
  readSession(id: string): Promise<unknown>
}

const listValue = (records: unknown[]): SessionQueryListValue => records as unknown as SessionQueryListValue
const readValue = (): SessionQueryReadValue => ({
  sessionId: 's1',
  header: { id: 's1', title: 'run' },
  events: [{ type: 'assistant/message', data: { turn: 1, usage: { inputTokens: 3 } }, time: 10 }],
}) as unknown as SessionQueryReadValue

describe('registerFace', () => {
  it('loads the roster into the store on a successful list', async () => {
    const b = bench()
    const queries = {
      listSessions: vi.fn(async () => ({ ok: true, value: listValue([{ header: { id: 's1', title: 'one' }, persisted: true }]) })),
      readSession: vi.fn(),
    } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.loadRoster()
    await flush()
    expect(b.state().roster).toBe('ready')
    expect(b.state().records).toHaveLength(1)
  })

  it('records the failure code of a failed roster read', async () => {
    const b = bench()
    const queries = {
      listSessions: vi.fn(async () => ({ ok: false, error: { code: 'session-query/boom' } })),
    } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.loadRoster()
    await flush()
    expect(b.state().roster).toBe('failed')
    expect(b.state().rosterFailure).toBe('session-query/boom')
  })

  it('falls back to the default code when a Remote error has no code', async () => {
    const b = bench()
    const queries = { listSessions: vi.fn(async () => ({ ok: false, error: {} })) } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.loadRoster()
    await flush()
    expect(b.state().rosterFailure).toBe('session-query/error')
  })

  it('reports a rejected roster read as a gateway failure', async () => {
    const b = bench()
    const queries = { listSessions: vi.fn(async () => { throw new Error('transport') }) } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.loadRoster()
    await flush()
    expect(b.state().roster).toBe('failed')
    expect(b.state().rosterFailure).toBe('gateway/internal')
  })

  it('picks a side and reads its log into the store', async () => {
    const b = bench()
    const queries = {
      listSessions: vi.fn(),
      readSession: vi.fn(async () => ({ ok: true, value: readValue() })),
    } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.pick('a', 's1')
    expect(b.state().sideA.sessionId).toBe('s1')
    await flush()
    expect(queries.readSession).toHaveBeenCalledWith('s1')
    expect(b.state().sideA.status).toBe('ready')
    expect(b.state().sideA.metrics).toMatchObject({ inputTokens: 3, failures: 0 })
  })

  it('clears a side without reading when pick receives null', () => {
    const b = bench()
    const queries = {
      listSessions: vi.fn(),
      readSession: vi.fn(),
    } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.pick('b', null)
    expect(b.state().sideB.sessionId).toBeNull()
    expect(queries.readSession).not.toHaveBeenCalled()
  })

  it('records the failure code of a failed log read', async () => {
    const b = bench()
    const queries = { readSession: vi.fn(async () => ({ ok: false, error: { code: 'session-query/not-found' } })) } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.pick('a', 's1')
    await flush()
    expect(b.state().sideA.status).toBe('failed')
    expect(b.state().sideA.failureCode).toBe('session-query/not-found')
  })

  it('reports a rejected log read as a gateway failure and clears retry', async () => {
    const b = bench()
    const queries = { readSession: vi.fn(async () => { throw new Error('transport') }) } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.pick('a', 's1')
    await flush()
    expect(b.state().sideA.status).toBe('failed')
    expect(b.state().sideA.failureCode).toBe('gateway/internal')
    expect(b.state().sideA.retrying).toBe(false)
  })

  it('retryRoster re-issues the roster read', async () => {
    const b = bench()
    const queries = { listSessions: vi.fn(async () => ({ ok: true, value: listValue([]) })) } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.loadRoster()
    await vi.waitFor(() => { expect((queries as { listSessions: ReturnType<typeof vi.fn> }).listSessions).toHaveBeenCalledTimes(1) })
    face.retryRoster()
    await vi.waitFor(() => { expect((queries as { listSessions: ReturnType<typeof vi.fn> }).listSessions).toHaveBeenCalledTimes(2) })
  })

  it('retryRead re-issues the side read and sets the retrying marker', async () => {
    const b = bench()
    const queries = {
      listSessions: vi.fn(),
      readSession: vi.fn(async () => ({ ok: true, value: readValue() })),
    } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    face.pick('b', 's5')
    await flush()
    expect(b.state().sideB.retrying).toBe(false)
    face.retryRead('b')
    await flush()
    expect(b.state().sideB.status).toBe('ready')
  })

  it('retryRead does nothing when the side was never picked', async () => {
    const b = bench()
    const queries = {
      listSessions: vi.fn(),
      readSession: vi.fn(async () => ({ ok: true, value: readValue() })),
    } as unknown as IQueries
    const face = registerFace(queries as never)(b.actions)
    // No side has been picked: retryRead must no-op rather than chase a stale target.
    face.retryRead('a')
    await flush()
    expect(queries.readSession).not.toHaveBeenCalled()
    expect(b.state().sideA.sessionId).toBeNull()
  })
})