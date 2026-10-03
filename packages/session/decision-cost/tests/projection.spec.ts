/**
 * The `milestoneCost` projection unit: mounting the plugin beside the
 * projection registry serves per-milestone derived costs for a Session's own
 * register rows, folding item-8 `project/milestone` events and the same usage
 * records token-meter folds; compositions without the registry are unaffected;
 * unmounting the plugin removes the key (HMR safety). The join-rule and
 * data-missing regressions are pinned here — a milestone's figure is the
 * committed tokens of the turns from its event sequence to the next
 * milestone's (or the session end), and an interval that records no usage
 * writes null, never zero.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { brandMilestoneRow } from '@deepseek-ai/dsh-project-register/src/types.ts'
import * as DecisionCostPlugin from '@deepseek-ai/dsh-decision-cost'
import { milestoneCostProjectionDefinition, tokensOf, usageOf } from '@deepseek-ai/dsh-decision-cost/src/projection.ts'

async function harness(withPlugin: boolean): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  if (withPlugin) await ctx.plugin(DecisionCostPlugin)
  return { ctx, session: ctx.sessions.create(SessionId('costed')) }
}

/** Append one milestone event; returns its seq. */
function appendMilestone(session: Session, id: string): number {
  return session.append('project/milestone', {
    id: brandMilestoneRow(id),
    title: `milestone ${id}`,
    diagram: null,
  }, { ignorable: true }).seq
}

/** Append an assistant/message carrying a usage record; returns its seq. */
function appendUsage(session: Session, usage: TokenUsage): number {
  return session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'answer' }],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    }),
    usage,
  }, { surfaceOp: 'append' }).seq
}

/** Read the milestoneCost projection value for one Session. */
function valueOf(ctx: Context, session: Session): Record<string, number | null> {
  return ctx.sessionProjections.snapshot(session).values.milestoneCost as Record<string, number | null>
}

describe('milestoneCost projection unit (registry drive)', () => {
  it('serves an empty map on a log with no milestones', async () => {
    const { ctx, session } = await harness(true)
    appendUsage(session, { inputTokens: 10, outputTokens: 2 })
    expect(valueOf(ctx, session)).toEqual({})
  })

  it('figures one milestone to the session end from committed usage after it', async () => {
    const { ctx, session } = await harness(true)
    appendMilestone(session, 'M1')
    appendUsage(session, { inputTokens: 100, outputTokens: 20 })
    appendUsage(session, { inputTokens: 5, outputTokens: 1 })
    // 100+20 + 5+1 = 126 committed tokens.
    expect(valueOf(ctx, session)['M1']).toBe(126)
  })

  it('attributes usage only to the interval between its milestone and the next', async () => {
    const { ctx, session } = await harness(true)
    appendMilestone(session, 'M1')
    appendUsage(session, { inputTokens: 30, outputTokens: 0 })
    appendMilestone(session, 'M2')
    appendUsage(session, { inputTokens: 4, outputTokens: 10 })
    const value = valueOf(ctx, session)
    expect(value['M1']).toBe(30) // [M1, M2) usage only.
    expect(value['M2']).toBe(14) // [M2, session end) usage only.
  })

  it('writes null for an interval that records no usage, never a zero', async () => {
    const { ctx, session } = await harness(true)
    appendMilestone(session, 'M1')
    // A decision-only turn lands (no usage record) inside M1's interval.
    session.append('user/message', { content: [] }, { surfaceOp: 'append' })
    appendMilestone(session, 'M2')
    expect(valueOf(ctx, session)['M1']).toBeNull()
    // M2 is still open with no usage committed yet: null, not 0.
    expect(valueOf(ctx, session)['M2']).toBeNull()
  })

  it('a decision-only turn does not advance the token total or mark usage seen', async () => {
    const { ctx, session } = await harness(true)
    appendMilestone(session, 'M1')
    session.append('user/message', { content: [] }, { surfaceOp: 'append' })
    appendMilestone(session, 'M2')
    // The decision-only turn carried no usage, so M1's interval stays data-missing.
    expect(valueOf(ctx, session)).toEqual({ M1: null, M2: null })
  })

  it('sums full billed buckets including cache and reasoning tokens', async () => {
    const { ctx, session } = await harness(true)
    appendMilestone(session, 'M1')
    appendUsage(session, {
      inputTokens: 10,
      outputTokens: 3,
      cacheReadTokens: 40,
      cacheWriteTokens: 5,
      reasoningTokens: 2,
    })
    expect(valueOf(ctx, session)['M1']).toBe(60)
  })

  it('is unchanged by an assistant/message without a usage record', async () => {
    const { ctx, session } = await harness(true)
    appendMilestone(session, 'M1')
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'plain' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
    }, { surfaceOp: 'append' })
    expect(valueOf(ctx, session)['M1']).toBeNull()
  })

  it('has no milestoneCost key without the plugin, and drops it when the plugin unloads (HMR safety)', async () => {
    const { ctx, session } = await harness(false)
    appendMilestone(session, 'M1')
    expect('milestoneCost' in ctx.sessionProjections.snapshot(session).values).toBe(false)
    const fiber = await ctx.plugin(DecisionCostPlugin)
    appendUsage(session, { inputTokens: 8, outputTokens: 0 })
    expect(valueOf(ctx, session)['M1']).toBe(8)
    await fiber.dispose()
    expect('milestoneCost' in ctx.sessionProjections.snapshot(session).values).toBe(false)
  })

  it('folds milestones already in the log when the plugin mounts late (lazy cell build)', async () => {
    const { ctx, session } = await harness(false)
    appendMilestone(session, 'M1')
    appendUsage(session, { inputTokens: 50, outputTokens: 0 })
    await ctx.plugin(DecisionCostPlugin)
    expect(valueOf(ctx, session)['M1']).toBe(50)
  })
})

/** Build one synthetic committed event with a controlled timestamp. */
function at(time: number, type: string, data: unknown): SessionEvent {
  return { type, seq: time, time, data } as unknown as SessionEvent
}

function milestoneAt(time: number, id: string): SessionEvent {
  return at(time, 'project/milestone', { id: brandMilestoneRow(id), title: id, diagram: null })
}

function usageAt(time: number, usage: TokenUsage): SessionEvent {
  return at(time, 'assistant/message', {
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'answer' }],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    }),
    usage,
  })
}

/** Fold a synthetic event list through the definition and view the result. */
function fold(events: readonly SessionEvent[]): Record<string, number | null> {
  const state = events.reduce<
    Parameters<typeof milestoneCostProjectionDefinition.apply>[0]
  >(
    (folded, event) => milestoneCostProjectionDefinition.apply(folded, event),
    milestoneCostProjectionDefinition.init(),
  )
  return milestoneCostProjectionDefinition.wire.view(state) as unknown as Record<string, number | null>
}

describe('milestoneCost fold (controlled ordering)', () => {
  it('services the join rule exactly at milestone boundaries', () => {
    expect(fold([
      milestoneAt(1_000, 'M1'),
      usageAt(2_000, { inputTokens: 50, outputTokens: 10 }),
      milestoneAt(3_000, 'M2'),
      usageAt(4_000, { inputTokens: 2, outputTokens: 2 }),
      milestoneAt(5_000, 'M3'),
    ])).toEqual({
      M1: 60,   // [M1, M2)
      M2: 4,    // [M2, M3)
      M3: null, // [M3, end] still open, no usage yet
    })
  })

  it('returns the identical state reference for an unrelated event (the change gate)', () => {
    const state = milestoneCostProjectionDefinition.init()
    expect(milestoneCostProjectionDefinition.apply(state, at(1, 'user/message', { content: [] })))
      .toBe(state)
  })

  it('a usage-bearing event with no prior milestone attributes to no row', () => {
    expect(fold([usageAt(1_000, { inputTokens: 9, outputTokens: 0 })])).toEqual({})
  })

  it('the tokensOf helper sums every billed bucket, treating absent ones as zero', () => {
    expect(tokensOf({ inputTokens: 10, outputTokens: 3 })).toBe(13)
    expect(tokensOf({
      inputTokens: 10, outputTokens: 3, cacheReadTokens: 40, cacheWriteTokens: 5, reasoningTokens: 2,
    })).toBe(60)
  })

  it('the usageOf helper returns undefined for a non-assistant event', () => {
    expect(usageOf(at(1, 'user/message', { content: [] }))).toBeUndefined()
    expect(usageOf(usageAt(2, { inputTokens: 1, outputTokens: 0 }) )).toEqual({ inputTokens: 1, outputTokens: 0 })
  })

  it('state round-trips through the declared schema, branding milestone ids on read', () => {
    const parsed = milestoneCostProjectionDefinition.stateSchema.parse({
      milestones: [{ id: 'M1', tokenStart: 0, usageSeen: false }],
      totalTokens: 40,
      openUsageSeen: true,
    })
    expect(parsed.totalTokens).toBe(40)
    expect(parsed.milestones[0]!.id).toBe(brandMilestoneRow('M1'))
    // The initial reducer state parses to a clean empty shape.
    const fresh = milestoneCostProjectionDefinition.stateSchema.parse(
      milestoneCostProjectionDefinition.init(),
    )
    expect(fresh.milestones).toEqual([])
  })
})
