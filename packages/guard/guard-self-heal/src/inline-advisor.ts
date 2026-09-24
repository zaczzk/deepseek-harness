/**
 * Formats diagnostic self-healing advice into structured model context.
 * @module @deepseek-ai/dsh-guard-self-heal/inline-advisor
 */

import { createUserMessage, type MessageSource } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { ErrorClassification } from './types.ts'

const GUARD_SOURCE: MessageSource = { kind: 'guard-self-heal' }

/**
 * Creates an advisory UserMessage containing the diagnostic recovery hint.
 * @param diagnosis - classified error information.
 * @returns UserMessage ready for injection into additionalContexts.
 */
export function createDiagnosticAdviceMessage(diagnosis: ErrorClassification): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: diagnosis.diagnosticHint }],
    source: {
      ...GUARD_SOURCE,
      form: 'notice',
      summary: `Self-Heal: ${diagnosis.summary}`,
    },
  })
}

/**
 * Prepend an advisory message onto existing contexts while preserving order.
 * @param advice - the diagnostic message.
 * @param existing - existing downstream contexts.
 * @returns combined array of user messages.
 */
export function prependAdvice(advice: UserMessage, existing?: UserMessage[]): UserMessage[] {
  return [advice, ...(existing ?? [])]
}
