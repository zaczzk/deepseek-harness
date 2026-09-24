import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as GuardSelfHeal from '../src/index.ts'
import type { ToolExecution, PostToolDecision, ToolExecutionResult } from '@deepseek-ai/dsh-tools'

function createMockExecution(name: string, command: string, agent: unknown): ToolExecution {
  const callId = ToolCallId('test_call_1')
  return {
    name,
    callId,
    rootCallId: callId,
    token: 'test_token' as never,
    signal: new AbortController().signal,
    arguments: { command },
    agent: agent as never,
  }
}

describe('guard-self-heal plugin integration', () => {
  it('registers guardSelfHeal service on context', async () => {
    const ctx = new Context()
    await ctx.plugin(GuardSelfHeal, { enabled: true })
    expect(ctx.guardSelfHeal).toBeDefined()
    expect(typeof ctx.guardSelfHeal?.classifyFailure).toBe('function')
  })

  it('enriches failed tool execution with diagnostic advice in additionalContexts', async () => {
    const ctx = new Context()
    await ctx.plugin(GuardSelfHeal, {
      enabled: true,
      enableInlineHints: true,
      monitoredTools: ['pwsh', 'bash'],
    })

    const mockAgent = {}
    const exec = createMockExecution('pwsh', 'pnpm run build', mockAgent)

    const failedResult: ToolExecutionResult = {
      isError: true,
      error: { message: 'Compilation failed' },
      content: [
        {
          type: 'text',
          text: "src/main.ts:1:10 - error TS2305: Module './config' has no exported member 'Options'.",
        },
      ],
    }

    const decision = (await ctx.waterfall(
      'tools/post-execute',
      exec,
      failedResult,
      async () => ({ kind: 'accept', content: failedResult.content }),
    )) as PostToolDecision

    expect(decision).toBeDefined()
    expect(decision.additionalContexts).toBeDefined()
    expect(decision.additionalContexts?.length).toBe(1)

    const injectedContext = decision.additionalContexts?.[0]
    expect(injectedContext?.source.kind).toBe('guard-self-heal')
    const contextText = injectedContext?.content[0]?.type === 'text' ? injectedContext.content[0].text : ''
    expect(contextText).toContain('[Self-Healing Diagnostic Notice]')
    expect(contextText).toContain('Options')
  })

  it('passes through successful tool executions without adding contexts', async () => {
    const ctx = new Context()
    await ctx.plugin(GuardSelfHeal, {
      enabled: true,
      enableInlineHints: true,
      monitoredTools: ['pwsh'],
    })

    const mockAgent = {}
    const exec = createMockExecution('pwsh', 'echo hello', mockAgent)

    const successResult: ToolExecutionResult = {
      isError: false,
      value: 'hello',
      content: [{ type: 'text', text: 'hello\nProcess exited with code 0' }],
    }

    const decision = (await ctx.waterfall(
      'tools/post-execute',
      exec,
      successResult,
      async () => ({ kind: 'accept', content: successResult.content }),
    )) as PostToolDecision

    expect(decision).toBeDefined()
    expect(decision.additionalContexts).toBeUndefined()
  })

  it('respects maxHintsPerTurn to prevent repetitive hint floods', async () => {
    const ctx = new Context()
    await ctx.plugin(GuardSelfHeal, {
      enabled: true,
      enableInlineHints: true,
      maxHintsPerTurn: 1,
      monitoredTools: ['pwsh'],
    })

    const mockAgent = {}
    const exec = createMockExecution('pwsh', 'tsc', mockAgent)

    const failedResult: ToolExecutionResult = {
      isError: true,
      error: { message: 'Compilation failed' },
      content: [{ type: 'text', text: 'error TS2304: Cannot find name x' }],
    }

    // Call 1: should receive hint
    const call1 = (await ctx.waterfall(
      'tools/post-execute',
      exec,
      failedResult,
      async () => ({ kind: 'accept', content: failedResult.content }),
    )) as PostToolDecision
    expect(call1.additionalContexts?.length).toBe(1)

    // Call 2: should be capped
    const call2 = (await ctx.waterfall(
      'tools/post-execute',
      exec,
      failedResult,
      async () => ({ kind: 'accept', content: failedResult.content }),
    )) as PostToolDecision
    expect(call2.additionalContexts).toBeUndefined()
  })
})
