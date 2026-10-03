import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import * as BudgetCeiling from '@deepseek-ai/dsh-budget-ceiling'
import { BUDGET_CEILING_DENY } from '@deepseek-ai/dsh-budget-ceiling'

const probe = defineContentToolFixture({
  name: 'probe',
  description: 'p',
  parameters: {},
  async execute() { return [{ type: 'text', text: 'ok' }] },
})

/** A provider usage record summing every counted bucket: 6+5+2+1+4 = 18. */
const USAGE: TokenUsage = { inputTokens: 6, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1, reasoningTokens: 4 }

/**
 * Mount the standard AgentLoop prerequisite services (which brings the `tools`
 * runtime up on the root context), then the ceiling guard, then a probe tool.
 * `agent` for an execute is supplied per call so each test can exercise the
 * guarded (agent present) and unguarded (no agent) paths.
 */
async function harness(config: BudgetCeiling.Config = {}): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(BudgetCeiling, config)
  ctx.tools.register(probe)
  return ctx
}

/** Append an `assistant/message` carrying provider usage, the durable fold's input. */
function appendUsage(session: Session, usage: TokenUsage = USAGE): void {
  session.append('assistant/message', {
    stream: [],
    turn: 1,
    step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text: 'a' }], source: { provider: 'mock', model: 'mock' } }),
    usage,
  }, { surfaceOp: 'append' })
}

function call(ctx: Context, session?: Session) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('c'),
    name: 'probe',
    arguments: {},
    ...session !== undefined ? { agent: { session } as unknown as Agent } : {},
  })
}

describe('budget ceiling guard', () => {
  it('denies a tool call once the session\'s consumed usage reaches the ceiling, with a stable code and both figures', async () => {
    const ctx = await harness({ budgetCeiling: 10 })
    const session = Session.create(SessionId('hot')) // 18 consumed
    appendUsage(session)

    const result = await call(ctx, session)
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{
      type: 'text',
      text: `Error: ${BUDGET_CEILING_DENY}: session has consumed 18 usage tokens, at or above the configured ceiling of 10.`,
    }])
  })

  it('allows a call while the session\'s consumption stays below the ceiling', async () => {
    const ctx = await harness({ budgetCeiling: 100 })
    const session = Session.create(SessionId('cool')) // 18 consumed
    appendUsage(session)

    const result = await call(ctx, session)
    expect(result.isError).toBe(false)
  })

  it('denies at exactly the ceiling and allows one token below it', async () => {
    const ctx = await harness({ budgetCeiling: 18 })
    const atBoundary = Session.create(SessionId('at')) // 18 == 18
    appendUsage(atBoundary)
    expect((await call(ctx, atBoundary)).isError).toBe(true)

    const justBelow = Session.create(SessionId('below')) // 17 < 18
    appendUsage(justBelow, { inputTokens: 6, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1, reasoningTokens: 3 })
    expect((await call(ctx, justBelow)).isError).toBe(false)
  })

  it('ignores a direct execute with no agent (no session-scoped ceiling applies)', async () => {
    const ctx = await harness({ budgetCeiling: 1 })
    const result = await call(ctx)
    expect(result.isError).toBe(false)
  })

  it('registers no guard when budgetCeiling is absent (optional-without-default keeps the base inert)', async () => {
    const ctx = await harness() // no ceiling
    const session = Session.create(SessionId('inert'))
    appendUsage(session)
    const result = await call(ctx, session)
    expect(result.isError).toBe(false)
  })

  it('folds only usage-bearing assistant/message events from seq 0, ignoring other events and usage-less messages', async () => {
    const ctx = await harness({ budgetCeiling: 10 })
    const session = Session.create(SessionId('mixed'))
    // A user message (no usage) and an assistant message with no usage report
    // contribute nothing; the single usage-carrying message decides the total.
    session.append('user/message', {
      content: [{ type: 'text', text: 'hello' }],
      source: { kind: 'user' },
    }, { surfaceOp: 'append' })
    session.append('assistant/message', {
      stream: [],
      turn: 1,
      step: 1,
      message: createAssistantMessage({ content: [{ type: 'text', text: 'no usage' }], source: { provider: 'mock', model: 'mock' } }),
    }, { surfaceOp: 'append' })
    appendUsage(session) // 18

    const result = await call(ctx, session)
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{
      type: 'text',
      text: `Error: ${BUDGET_CEILING_DENY}: session has consumed 18 usage tokens, at or above the configured ceiling of 10.`,
    }])
  })

  it('treats absent cache and reasoning buckets as zero when folding usage', async () => {
    const ctx = await harness({ budgetCeiling: 5 })
    const session = Session.create(SessionId('no-cache'))
    session.append('assistant/message', {
      stream: [],
      turn: 1,
      step: 1,
      message: createAssistantMessage({ content: [{ type: 'text', text: 'a' }], source: { provider: 'mock', model: 'mock' } }),
      usage: { inputTokens: 3, outputTokens: 2 }, // cache/ reasoning absent -> 0
    }, { surfaceOp: 'append' })
    const result = await call(ctx, session)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('consumed 5 usage tokens')
  })

  it('leaves an untouched Session untracked by session/event until the guard folds it on the first call', async () => {
    const ctx = await harness({ budgetCeiling: 10 })
    const untouched = ctx.sessions.create(SessionId('untouched'))
    // The append dispatches session/event before the guard has ever folded this
    // Session; the eager listener skips it (no state to refresh). The first
    // call then folds it from seq 0 and denies.
    appendUsage(untouched)
    const result = await call(ctx, untouched)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('18 usage tokens')
  })

  it('eagerly refreshes an already-tracked Session on session/event so new usage counts without a cold replay', async () => {
    const ctx = await harness({ budgetCeiling: 10 })
    // An attached Session dispatches session/event on append; the eager
    // listener folds it, but only for Sessions the guard has already seen.
    const session = ctx.sessions.create(SessionId('eager'))
    // First call folds the empty log and leaves the Session tracked.
    expect((await call(ctx, session)).isError).toBe(false)
    // Register AFTER the harness so the guard's own listener runs before we
    // observe the dispatch.
    let fired = 0
    const firstFire = new Promise<void>((resolve) => {
      ctx.on('session/event', () => { fired += 1; resolve() })
    })
    appendUsage(session) // 18 consumed, now over the ceiling
    await firstFire
    expect(fired).toBeGreaterThan(0)
    // The counter is current (folded on the event); the next call is denied.
    const result = await call(ctx, session)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('18 usage tokens')
  })
})
