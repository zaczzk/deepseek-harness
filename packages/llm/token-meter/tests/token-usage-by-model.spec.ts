import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import { RetryId } from '@deepseek-ai/dsh-llm-retry'
import SessionStore, { SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import type { TokenUsageByModelProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'

async function harness(): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(TokenMeter)
  return { ctx, session: ctx.sessions.create() }
}

function requestHeader(session: Session, provider: string, model: string): void {
  session.append('request/header', {
    header: { config: { provider, model } },
    reason: 'change',
    startsSeries: true,
  })
}

function usageChunk(session: Session, usage: TokenUsage, turn: number, step: number): void {
  session.append('assistant/attempt', {
    turn,
    step,
    stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage } }],
  })
}

function finalUsage(
  session: Session,
  usage: TokenUsage,
  turn: number,
  step: number,
  provider = 'mock',
  model = 'mock',
): void {
  session.append('assistant/message', {
    stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage } }],
    turn,
    step,
    message: createMessage({
      role: 'assistant',
      content: [],
      source: { kind: 'model', provider, model },
    }),
    usage,
  }, { surfaceOp: 'append' })
}

function summaryUsage(session: Session, usage: TokenUsage | undefined, provider: string, model: string): void {
  session.append('compaction/summary', {
    compactionId: CompactionId('by-model-summary'),
    summary: [{ type: 'text', text: 'summary' }],
    shadowedRange: { start: SessionSeq(1), end: SessionSeq(1) },
    shadowedSeqs: [SessionSeq(1)],
    shadowedTokenCount: 1,
    provider,
    model,
    ...usage === undefined ? {} : { usage },
  })
}

const projected = (ctx: Context, session: Session): TokenUsageByModelProjection => {
  const value = ctx.sessionProjections.snapshot(session).values.tokenUsageByModel
  if (value === undefined) throw new Error('tokenUsageByModel projection is not registered')
  return value
}

const totalsOf = (models: TokenUsageByModelProjection['models']): TokenUsageProjection =>
  models.reduce((total, row) => ({
    uncachedInputTokens: total.uncachedInputTokens + row.uncachedInputTokens,
    outputTokens: total.outputTokens + row.outputTokens,
    cacheReadTokens: total.cacheReadTokens + row.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + row.cacheWriteTokens,
  }), { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })

describe('tokenUsageByModel session projection', () => {
  it('serves no rows without usage samples', async () => {
    const { ctx, session } = await harness()
    session.append('turn/start', { turn: 1 })
    expect(projected(ctx, session)).toEqual({ models: [] })
  })

  it('credits a settled message to its message source in first-billed order', async () => {
    const { ctx, session } = await harness()
    requestHeader(session, 'mock', 'a')
    requestHeader(session, 'mock', 'b')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    finalUsage(session, { inputTokens: 10, outputTokens: 4, cacheReadTokens: 7, cacheWriteTokens: 2 }, 1, 1, 'mock', 'a')
    finalUsage(session, { inputTokens: 1, outputTokens: 1 }, 2, 1, 'mock', 'b')
    finalUsage(session, { inputTokens: 2, outputTokens: 1 }, 3, 1, 'mock', 'a')

    expect(projected(ctx, session)).toEqual({
      models: [
        {
          provider: 'mock',
          model: 'a',
          uncachedInputTokens: 12,
          outputTokens: 5,
          cacheReadTokens: 7,
          cacheWriteTokens: 2,
        },
        {
          provider: 'mock',
          model: 'b',
          uncachedInputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      ],
    })
  })

  it('credits an attempt sample to the latest request route', async () => {
    const { ctx, session } = await harness()
    requestHeader(session, 'mock', 'a')
    requestHeader(session, 'mock', 'a')
    session.append('step/start', { turn: 1, step: 1 })
    usageChunk(session, { inputTokens: 10, outputTokens: 4 }, 1, 1)

    expect(projected(ctx, session)).toEqual({
      models: [{
        provider: 'mock',
        model: 'a',
        uncachedInputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }],
    })
  })

  it('credits one unattributed bucket when no route claim exists', async () => {
    const { ctx, session } = await harness()
    session.append('step/start', { turn: 1, step: 1 })
    usageChunk(session, { inputTokens: 3, outputTokens: 1 }, 1, 1)
    finalUsage(session, { inputTokens: 5, outputTokens: 2 }, 2, 1, '', 'a')

    expect(projected(ctx, session)).toEqual({
      models: [
        { provider: '', model: '', uncachedInputTokens: 8, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
      ],
    })
  })

  it('ignores a settlement without a usage sample', async () => {
    const { ctx, session } = await harness()
    session.append('assistant/message', {
      stream: [],
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [],
        source: { kind: 'model', provider: 'mock', model: 'a' },
      }),
    }, { surfaceOp: 'append' })

    expect(projected(ctx, session)).toEqual({ models: [] })
  })

  it('replaces the same attempt sample and moves it to the settling route', async () => {
    const { ctx, session } = await harness()
    requestHeader(session, 'mock', 'a')
    session.append('step/start', { turn: 1, step: 1 })
    usageChunk(session, { inputTokens: 10, outputTokens: 2, cacheReadTokens: 3 }, 1, 1)
    finalUsage(session, { inputTokens: 14, outputTokens: 5, cacheReadTokens: 8, cacheWriteTokens: 1 }, 1, 1, 'mock', 'b')

    expect(projected(ctx, session)).toEqual({
      models: [
        {
          provider: 'mock',
          model: 'a',
          uncachedInputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        {
          provider: 'mock',
          model: 'b',
          uncachedInputTokens: 14,
          outputTokens: 5,
          cacheReadTokens: 8,
          cacheWriteTokens: 1,
        },
      ],
    })
  })

  it('keeps an identical same-attempt sample unpublished', async () => {
    const { ctx, session } = await harness()
    requestHeader(session, 'mock', 'mock')
    const changes: unknown[] = []
    ctx.sessionProjections.onChanged((_session, key, value) => {
      if (key === 'tokenUsageByModel') changes.push(value)
    })
    const usage: TokenUsage = { inputTokens: 10, outputTokens: 4, cacheReadTokens: 7, cacheWriteTokens: 2 }
    session.append('step/start', { turn: 1, step: 1 })
    usageChunk(session, usage, 1, 1)
    finalUsage(session, usage, 1, 1)

    expect(changes).toHaveLength(1)
  })

  it('adds a retried attempt while replacing samples within each attempt', async () => {
    const { ctx, session } = await harness()
    requestHeader(session, 'mock', 'a')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    usageChunk(session, { inputTokens: 10, outputTokens: 2 }, 1, 1)
    session.append('llm/retry-started', { retryId: RetryId('by-model-retry'), turn: 1, step: 1, retry: 1 })
    usageChunk(session, { inputTokens: 4, outputTokens: 3 }, 1, 1)

    expect(projected(ctx, session)).toEqual({
      models: [{
        provider: 'mock',
        model: 'a',
        uncachedInputTokens: 14,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }],
    })
  })

  it('keeps the replacement scope of a retry marker outside the last sample', async () => {
    const { ctx, session } = await harness()
    requestHeader(session, 'mock', 'a')
    session.append('llm/retry-started', { retryId: RetryId('by-model-idle-retry'), turn: 1, step: 1, retry: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    usageChunk(session, { inputTokens: 10, outputTokens: 2 }, 1, 1)
    session.append('llm/retry-started', { retryId: RetryId('by-model-stale-retry'), turn: 2, step: 1, retry: 1 })
    usageChunk(session, { inputTokens: 6, outputTokens: 1 }, 1, 1)

    expect(projected(ctx, session)).toEqual({
      models: [{
        provider: 'mock',
        model: 'a',
        uncachedInputTokens: 6,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }],
    })
  })

  it('counts a compaction summary call under its own route', async () => {
    const { ctx, session } = await harness()
    summaryUsage(session, { inputTokens: 20, outputTokens: 4 }, 'summarizer', 'flash')
    summaryUsage(session, undefined, 'summarizer', 'flash')

    expect(projected(ctx, session)).toEqual({
      models: [{
        provider: 'summarizer',
        model: 'flash',
        uncachedInputTokens: 20,
        outputTokens: 4,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }],
    })
  })

  it('reconciles every row with tokenUsage plus the summarizer calls', async () => {
    const { ctx, session } = await harness()
    requestHeader(session, 'mock', 'a')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    finalUsage(session, { inputTokens: 10, outputTokens: 4, cacheReadTokens: 7, cacheWriteTokens: 2 }, 1, 1, 'mock', 'a')
    summaryUsage(session, { inputTokens: 20, outputTokens: 4 }, 'summarizer', 'flash')
    finalUsage(session, { inputTokens: 1, outputTokens: 1 }, 2, 1, 'mock', 'b')

    const usage = ctx.sessionProjections.snapshot(session).values.tokenUsage
    if (usage === undefined) throw new Error('tokenUsage projection is not registered')
    expect(totalsOf(projected(ctx, session).models)).toEqual({
      uncachedInputTokens: usage.uncachedInputTokens + 20,
      outputTokens: usage.outputTokens + 4,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    })
  })
})
