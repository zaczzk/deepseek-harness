/**
 * Implementation of GuardSelfHealService.
 * @module @deepseek-ai/dsh-guard-self-heal/service
 */

import { classifyErrorOutput } from './classifier.ts'
import type { ErrorClassification, GuardSelfHealService } from './types.ts'

/**
 * Creates an instance of {@link GuardSelfHealService}.
 * @returns GuardSelfHealService implementation.
 */
export function createGuardSelfHealService(): GuardSelfHealService {
  return {
    classifyFailure(command: string, exitCode: number, output: string): ErrorClassification {
      return classifyErrorOutput(command, exitCode, output)
    },
  }
}
