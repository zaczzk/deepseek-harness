// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createRunComparisonStore } from '../src/client/store.ts'
import type { RunMetrics, RunSideState } from '../src/client/store.ts'

const metrics = (over: Partial<RunMetrics> = {}): RunMetrics => ({
  turns: 4, toolCalls: 7, inputTokens: 120, outputTokens: 80, wallClockMs: 9000, failures: 0, ...over,
})

const snapshot = { seq: 5 } as never

/** Fresh per-session instance + its live state. */
function bench() {
  const store = createRunComparisonStore()
  const instance = store.create('session-1')
  return { instance, store, state: () => instance.getSnapshot(), actions: instance.actions }
}

describe('createRunComparisonStore', () => {
  it('initialises idle with an empty roster and both sides unselected', () => {
    const b = bench()
    expect(b.state()).toEqual({
      roster: 'idle',
      records: [],
      sideA: { sessionId: null, status: 'idle', retrying: false },
      sideB: { sessionId: null, status: 'idle', retrying: false },
    })
  })

  it('rosterLoading sets loading and clears a prior roster failure', () => {
    const b = bench()
    b.actions.rosterFailed('session-query/boom')
    expect(b.state().roster).toBe('failed')
    b.actions.rosterLoading()
    expect(b.state().roster).toBe('loading')
    expect(b.state().rosterFailure).toBeUndefined()
  })

  it('rosterLoaded records the roster newest-first and clears the failure', () => {
    const b = bench()
    const recs = [{ header: { id: 's1', title: 'one' }, persisted: true }]
    b.actions.rosterLoaded(recs as never)
    expect(b.state().roster).toBe('ready')
    expect(b.state().records).toEqual(recs)
  })

  it('rosterFailed stores the failure code', () => {
    const b = bench()
    b.actions.rosterFailed('session-query/error')
    expect(b.state().roster).toBe('failed')
    expect(b.state().rosterFailure).toBe('session-query/error')
  })

  it('pick clears a side and its carried read state', () => {
    const b = bench()
    b.actions.readLoaded('a', snapshot, metrics())
    expect(b.state().sideA.status).toBe('ready')
    b.actions.pick('a', 's1')
    expect(b.state().sideA.sessionId).toBe('s1')
    expect(b.state().sideA.status).toBe('idle')
    expect(b.state().sideA.retrying).toBe(false)
    expect(b.state().sideA.metrics).toBeUndefined()
    expect(b.state().sideA.snapshot).toBeUndefined()
    expect(b.state().sideA.failureCode).toBeUndefined()
  })

  it('pick with null clears the side', () => {
    const b = bench()
    b.actions.pick('a', 's1')
    b.actions.setRetrying('a', true)
    b.actions.pick('a', null)
    expect(b.state().sideA.sessionId).toBeNull()
    expect(b.state().sideA.status).toBe('idle')
  })

  it('pick routes side b to sideB and preserves side A', () => {
    const b = bench()
    b.actions.pick('b', 'sb')
    expect(b.state().sideB.sessionId).toBe('sb')
    expect(b.state().sideA.sessionId).toBeNull()
  })

  it('readLoading marks the side loading and clears its failure', () => {
    const b = bench()
    b.actions.readFailed('a', 'old')
    expect(b.state().sideA.status).toBe('failed')
    b.actions.readLoading('a')
    expect(b.state().sideA.status).toBe('loading')
    expect(b.state().sideA.failureCode).toBeUndefined()
  })

  it('readLoaded settles ready with snapshot/metrics and clears retry', () => {
    const b = bench()
    b.actions.pick('a', 's1')
    b.actions.setRetrying('a', true)
    b.actions.readLoading('a')
    b.actions.readLoaded('a', snapshot, metrics())
    const a = b.state().sideA
    expect(a.status).toBe('ready')
    expect(a.metrics).toEqual(metrics())
    expect(a.retrying).toBe(false)
    expect(a.failureCode).toBeUndefined()
  })

  it('readFailed marks the side failed with the code and clears retry', () => {
    const b = bench()
    b.actions.pick('a', 's1')
    b.actions.setRetrying('a', true)
    b.actions.readFailed('a', 'session-query/err')
    expect(b.state().sideA.status).toBe('failed')
    expect(b.state().sideA.failureCode).toBe('session-query/err')
    expect(b.state().sideA.retrying).toBe(false)
  })

  it('setRetrying toggles the in-flight marker per side', () => {
    const b = bench()
    b.actions.setRetrying('b', true)
    expect(b.state().sideB.retrying).toBe(true)
    expect(b.state().sideA.retrying).toBe(false)
    b.actions.setRetrying('b', false)
    expect(b.state().sideB.retrying).toBe(false)
  })
})