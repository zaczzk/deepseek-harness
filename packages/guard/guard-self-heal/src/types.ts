/**
 * Types and schemas for the agent self-healing guard.
 * @module @deepseek-ai/dsh-guard-self-heal/types
 */

import '@deepseek-ai/cordis'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'guard-self-heal': { kind: 'guard-self-heal' } & ContextFormed
  }
}

/** Error categories categorized by the diagnostic classifier. */
export type ErrorCategory =
  | 'TYPESCRIPT'
  | 'BUNDLER'
  | 'RUNTIME'
  | 'TEST_FAILURE'
  | 'ENVIRONMENT'
  | 'GENERIC'

/** Escalation severity level determined by the error analyzer. */
export type ErrorSeverity =
  | 'INLINE_HINT'
  | 'DELEGATE_SUBAGENT'
  | 'FATAL'

/** Detailed classification result for a failed command or tool call. */
export interface ErrorClassification {
  /** High-level failure category. */
  readonly category: ErrorCategory
  /** Actionable severity tier. */
  readonly severity: ErrorSeverity
  /** One-line diagnostic summary. */
  readonly summary: string
  /** Matched rule identifiers or regex patterns. */
  readonly matchedRules: readonly string[]
  /** Recommended architectural or code action to resolve the failure. */
  readonly recommendedAction: string
  /** Formatted guidance string to inject into the model's next prompt turn. */
  readonly diagnosticHint: string
}

/** Service definition for failure classification and repair delegation. */
export interface GuardSelfHealService {
  /**
   * Analyze command error output and produce actionable diagnostic classification.
   * @param command - the executed shell or tool command.
   * @param exitCode - exit code returned by the process.
   * @param output - combined stdout and stderr text.
   * @returns structured error diagnosis.
   */
  classifyFailure(command: string, exitCode: number, output: string): ErrorClassification
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Agent inner-loop self-healing and error diagnostic service. */
    guardSelfHeal?: GuardSelfHealService
  }
}
