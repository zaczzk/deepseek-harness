/**
 * @deepseek-ai/dsh-guard-self-heal
 * Agent inner-loop diagnostic error classifier, actionable inline self-healing advisor,
 * and autonomous repair delegator for DeepSeek Harness.
 * @module @deepseek-ai/dsh-guard-self-heal
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { classifyErrorOutput } from './classifier.ts'
import { createDiagnosticAdviceMessage, prependAdvice } from './inline-advisor.ts'
import { createGuardSelfHealService } from './service.ts'
import type { ErrorCategory, ErrorClassification, ErrorSeverity, GuardSelfHealService } from './types.ts'

export const name = 'guard-self-heal'

/** Configuration options for the self-healing guard. */
export interface Config {
  /** Whether inner-loop error detection and advice injection is enabled (default true). */
  enabled?: boolean
  /** Whether actionable inline diagnostic recovery hints are injected into tool results (default true). */
  enableInlineHints?: boolean
  /** Maximum diagnostic hints injected per session turn to prevent loops (default 3). */
  maxHintsPerTurn?: number
  /** Tool names to monitor (default empty array, meaning all execution/shell tools). */
  monitoredTools?: string[]
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  enableInlineHints: z.boolean().default(true),
  maxHintsPerTurn: z.number().default(3),
  monitoredTools: z.array(z.string()).default([]),
})

/** Extract concatenated text from tool content blocks. */
function extractTextFromBlocks(blocks: readonly ContentBlock[] | undefined): string {
  if (!blocks || blocks.length === 0) return ''
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text') {
      text += block.text
    }
  }
  return text
}

/** Check whether a tool name is monitored for errors. */
function isToolMonitored(toolName: string, monitoredTools: readonly string[]): boolean {
  if (monitoredTools.length === 0) {
    return true
  }
  return monitoredTools.includes(toolName)
}

/** Extract command line string from tool arguments if present. */
function extractCommand(toolArguments: unknown): string {
  if (typeof toolArguments === 'object' && toolArguments !== null) {
    const args = toolArguments as Record<string, unknown>
    if (typeof args.command === 'string') return args.command
    if (typeof args.code === 'string') return args.code
    if (typeof args.CommandLine === 'string') return args.CommandLine
  }
  return 'unknown command'
}

/**
 * Install the self-healing guard and post-execution waterfall hook.
 * @param ctx - Cordis root context.
 * @param config - Validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const service = createGuardSelfHealService()
  ctx.provide('guardSelfHeal', service)

  if (config.enabled === false) return

  const monitoredTools = config.monitoredTools ?? []
  const maxHintsPerTurn = config.maxHintsPerTurn ?? 3
  const hintCountMap = new WeakMap<object, number>()

  ctx.on('tools/post-execute', async (exec: ToolExecution, result, next): Promise<PostToolDecision> => {
    const downstream = await next()

    if (!exec.agent) return downstream
    if (!isToolMonitored(exec.name, monitoredTools)) return downstream

    const content = downstream.kind === 'accept' && downstream.content
      ? downstream.content
      : result.content

    const text = extractTextFromBlocks(content)
    const isError = Boolean(result.isError)
      || /error TS\d+|Cannot find module|AssertionError|SyntaxError|failed with exit code [1-9]|FAIL packages\//i.test(text)

    if (!isError) return downstream

    const hintsGiven = hintCountMap.get(exec.agent) ?? 0
    if (hintsGiven >= maxHintsPerTurn) return downstream

    hintCountMap.set(exec.agent, hintsGiven + 1)

    const command = extractCommand(exec.arguments)
    const exitCodeMatch = /exit code (\d+)/i.exec(text)
    const exitCode = exitCodeMatch ? Number(exitCodeMatch[1]) : 1

    const diagnosis = service.classifyFailure(command, exitCode, text)
    const adviceMessage = createDiagnosticAdviceMessage(diagnosis)

    if (downstream.kind === 'block') {
      return {
        kind: 'block',
        feedback: downstream.feedback,
        additionalContexts: prependAdvice(adviceMessage, downstream.additionalContexts),
      }
    }

    return {
      ...downstream,
      additionalContexts: prependAdvice(adviceMessage, downstream.additionalContexts),
    }
  }, { prepend: true })
}

export {
  createGuardSelfHealService,
  classifyErrorOutput,
  createDiagnosticAdviceMessage,
  type ErrorCategory,
  type ErrorClassification,
  type ErrorSeverity,
  type GuardSelfHealService,
}
