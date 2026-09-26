import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { AssistantStreamRecord } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as SessionStatsPlugin from '@deepseek-ai/dsh-session-stats'
import { LATENCY_SAMPLE_LIMIT } from '../src/latency-projection.ts'
import type { ModelLatencyProjection } from '../src/types.ts'

async function harness(): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SessionStatsPlugin)
  return { ctx, session: ctx.sessions.create() }
}

/** One step that starts at `startedAt` and assembles a message at `settledAt`. */
function call(session: Session, turn: number, step: number, startedAt: number, settledAt: number,
  provider = 'mock', model = 'a', stream: readonly AssistantStreamRecord[] = []): void {
  vi.setSystemTime(startedAt)
  session.append('step/start', { turn, step })
  vi.setSystemTime(settledAt)
  session.append('assistant/message', {
    turn,
    step,
    stream,
    message: createMessage({ role: 'assistant', content: [], source: { kind: 'model', provider, model } }),
    usage: { inputTokens: 1, outputTokens: 1 },
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step })
}

const projected = (ctx: Context, session: Session): ModelLatencyProjection => {
  const value = ctx.sessionProjections.snapshot(session).values.modelLatency
  if (value === undefined) throw new Error('modelLatency projection is not registered')
  return value
}

afterEach(() => { vi.useRealTimers() })

describe('modelLatency session projection', () => {
  it('records no samples before a message assembles', async () => {
    vi.useFakeTimers()
    const { ctx, session } = await harness()
    expect(projected(ctx, session)).toEqual({ routes: [] })
    vi.setSystemTime(1_000)
    session.append('step/start', { turn: 1, step: 1 })
    vi.setSystemTime(9_000)
    session.append('step/end', { turn: 1, step: 1 })
    expect(projected(ctx, session)).toEqual({ routes: [] })
  })

  it('samples each assembled call at its route with the step latency', async () => {
    vi.useFakeTimers()
    const { ctx, session } = await harness()
    call(session, 1, 1, 1_000, 4_000, 'mock', 'a')
    call(session, 1, 2, 5_000, 5_500, 'mock', 'b')
    call(session, 2, 1, 10_000, 11_000, 'mock', 'a')

    expect(projected(ctx, session)).toEqual({
      routes: [
        {
          provider: 'mock',
          model: 'a',
          samples: [{ at: 4_000, ms: 3_000 }, { at: 11_000, ms: 1_000 }],
        },
        { provider: 'mock', model: 'b', samples: [{ at: 5_500, ms: 500 }] },
      ],
    })
  })

  it('records the first-token latency as a duration clamped to its call', async () => {
    vi.useFakeTimers()
    const { ctx, session } = await harness()
    // A first token 300ms into a 400ms call keeps 300ms; a first token after
    // the settle clamps to the call's own latency.
    call(session, 1, 1, 1_000, 1_400, 'mock', 'a',
      [{ type: 'text-chunks', time0: 1_300, index: 0, dt: [], texts: ['a'] }])
    call(session, 1, 2, 2_000, 2_400, 'mock', 'a',
      [{ type: 'text-chunks', time0: 2_900, index: 0, dt: [], texts: ['b'] }])
    call(session, 1, 3, 3_000, 3_400, 'mock', 'a')
    const [route] = projected(ctx, session).routes
    expect(route?.samples).toEqual([
      { at: 1_400, ms: 400, ttftMs: 300 },
      { at: 2_400, ms: 400, ttftMs: 400 },
      { at: 3_400, ms: 400 },
    ])
  })

  it('keeps only the newest samples of a route', async () => {
    vi.useFakeTimers()
    const { ctx, session } = await harness()
    for (let step = 1; step <= LATENCY_SAMPLE_LIMIT + 5; step += 1) {
      call(session, 1, step, step * 1_000, step * 1_000 + 10)
    }
    const [route] = projected(ctx, session).routes
    expect(route?.samples).toHaveLength(LATENCY_SAMPLE_LIMIT)
    expect(route?.samples[0]).toEqual({ at: 6_010, ms: 10 })
    expect(route?.samples.at(-1)).toEqual({ at: 261_010, ms: 10 })
  })

  it('ignores a message outside its step and never accrues twice', async () => {
    vi.useFakeTimers()
    const { ctx, session } = await harness()
    call(session, 1, 1, 1_000, 2_000)
    vi.setSystemTime(3_000)
    session.append('assistant/message', {
      turn: 9,
      step: 9,
      stream: [],
      message: createMessage({ role: 'assistant', content: [], source: { kind: 'model', provider: 'mock', model: 'a' } }),
    }, { surfaceOp: 'append' })
    expect(projected(ctx, session).routes[0]?.samples).toHaveLength(1)
  })
})
