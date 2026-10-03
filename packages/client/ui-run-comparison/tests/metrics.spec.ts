// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { foldMetrics } from '../src/client/metrics.ts'
import type { SessionQueryReadValue, SessionQueryWireEvent } from '@deepseek-ai/dsh-api-session-query-controller/types'

/** Build one bounded wire event for the fold. */
function event(
  type: string,
  data: unknown,
  time = 0,
): SessionQueryWireEvent {
  return { type, data, time } as unknown as SessionQueryWireEvent
}

/** An assistant-message usage record shape as the fold reads it. */
function usageData(input: number | undefined, output: number | undefined, cacheRead?: number, cacheWrite?: number) {
  return {
    turn: 1,
    usage: {
      ...(input !== undefined ? { inputTokens: input } : {}),
      ...(cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {}),
      ...(cacheWrite !== undefined ? { cacheWriteTokens: cacheWrite } : {}),
      ...(output !== undefined ? { outputTokens: output } : {}),
    },
  }
}

const snapshot = (events: SessionQueryWireEvent[]): SessionQueryReadValue =>
  ({ events }) as unknown as SessionQueryReadValue

describe('foldMetrics', () => {
  it('counts distinct committed turns across transported events', () => {
    const m = foldMetrics(snapshot([
      event('assistant/message', { turn: 1 }, 100),
      event('tool/call', { turn: 1 }, 200),
      event('tool/result', { turn: 2, message: { isError: false } }, 300),
      // malformed turn (not a number) is ignored
      event('assistant/message', { turn: 'x' as never }, 400),
    ]))
    expect(m.turns).toBe(2)
  })

  it('counts tool/call events and skips their turn handling', () => {
    const m = foldMetrics(snapshot([
      event('tool/call', { turn: 1 }, 10),
      event('tool/call', { turn: 2 }, 20),
    ]))
    expect(m.toolCalls).toBe(2)
    // tool/call events still feed the turn set
    expect(m.turns).toBe(2)
  })

  it('counts denied tool results as failures via a truthy isError message', () => {
    const m = foldMetrics(snapshot([
      event('tool/result', { turn: 1, message: { isError: true } }, 10),
      event('tool/result', { turn: 2, message: { isError: false } }, 20),
      // message absent / non-object / array -> not denied
      event('tool/result', { turn: 3, message: null }, 30),
      event('tool/result', { turn: 4 }, 40),
    ]))
    expect(m.failures).toBe(1)
  })

  it('counts assistant/attempt as an error event and keeps toolCalls independent', () => {
    const m = foldMetrics(snapshot([
      event('assistant/attempt', { turn: 1 }, 10),
      event('tool/call', { turn: 2 }, 20),
    ]))
    expect(m.failures).toBe(1)
    expect(m.toolCalls).toBe(1)
  })

  it('sums input + cache-read + cache-write tokens and output tokens over usage records', () => {
    const m = foldMetrics(snapshot([
      event('assistant/message', usageData(100, 50, 10, 5), 10),
      event('assistant/message', usageData(30, 20), 20),
    ]))
    // input: 100+10+5 + 30 = 145; output: 50+20 = 70
    expect(m.inputTokens).toBe(145)
    expect(m.outputTokens).toBe(70)
  })

  it('counts cache-read and cache-write tokens toward input when no input figure is present', () => {
    const m = foldMetrics(snapshot([
      event('assistant/message', { turn: 1, usage: { cacheReadTokens: 10, cacheWriteTokens: 5 } }, 10),
    ]))
    // input minus explicit input: the `?? 0` seed applies to both cache sides.
    expect(m.inputTokens).toBe(15)
  })

  it('counts a cache-write-only usage record toward input', () => {
    const m = foldMetrics(snapshot([
      event('assistant/message', { turn: 1, usage: { cacheWriteTokens: 7 } }, 10),
    ]))
    expect(m.inputTokens).toBe(7)
  })

  it('ignores a non-object event payload instead of throwing', () => {
    const m = foldMetrics(snapshot([
      event('user/message', 'garbled-payload', 10),
    ]))
    expect(m.turns).toBe(0)
    expect(m.failures).toBe(0)
  })

  it('treats non-object/array usage and negative or non-finite numbers as absent', () => {
    const m = foldMetrics(snapshot([
      event('assistant/message', { turn: 1, usage: 'nope' as never }, 10),
      event('assistant/message', { turn: 1, usage: [1] as never }, 20),
      event('assistant/message', { turn: 1, usage: { inputTokens: -5, outputTokens: Infinity } }, 30),
    ]))
    expect(m.inputTokens).toBeNull()
    expect(m.outputTokens).toBeNull()
  })

  it('returns null tokens and null wall-clock when no usage and fewer than two events', () => {
    const m = foldMetrics(snapshot([event('user/message', { turn: 1 }, 100)]))
    expect(m.inputTokens).toBeNull()
    expect(m.outputTokens).toBeNull()
    expect(m.wallClockMs).toBeNull()
  })

  it('computes wall-clock as last minus first event timestamp', () => {
    const m = foldMetrics(snapshot([
      event('user/message', { turn: 1 }, 1000),
      event('assistant/message', { turn: 1, usage: { inputTokens: 1 } }, 3000),
      event('user/message', { turn: 2 }, 5000),
    ]))
    expect(m.wallClockMs).toBe(4000)
  })

  it('yields null wall-clock when events do not strictly advance', () => {
    const m = foldMetrics(snapshot([
      event('user/message', { turn: 1 }, 100),
      event('user/message', { turn: 2 }, 100),
    ]))
    expect(m.wallClockMs).toBeNull()
  })

  it('ignores event time <= -1 for wall-clock bounds', () => {
    const m = foldMetrics(snapshot([
      event('user/message', { turn: 1 }, -1),
      event('user/message', { turn: 2 }, 0),
      event('user/message', { turn: 3 }, 100),
    ]))
    expect(m.wallClockMs).toBe(100)
  })

  it('returns zeroed counts on an empty log', () => {
    const m = foldMetrics(snapshot([]))
    expect(m).toEqual({
      turns: 0, toolCalls: 0, inputTokens: null, outputTokens: null, wallClockMs: null, failures: 0,
    })
  })
})