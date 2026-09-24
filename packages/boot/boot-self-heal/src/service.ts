/**
 * Service implementation for boot self-healing.
 * @module @deepseek-ai/dsh-boot-self-heal/service
 */

import { inspectBootHealth } from './manifest-checker.ts'
import { executeRemediations } from './remediator.ts'
import type {
  BootHealthIssue,
  BootSelfHealReport,
  BootSelfHealService,
} from './types.ts'

/**
 * Creates an instance of {@link BootSelfHealService}.
 * @returns the service implementation.
 */
export function createBootSelfHealService(): BootSelfHealService {
  return {
    async inspectBootEnvironment(rootDir: string): Promise<BootSelfHealReport> {
      const issues = inspectBootHealth(rootDir)
      return {
        healthy: issues.length === 0,
        issues,
        attemptedRemediations: [],
      }
    },

    async remediate(
      rootDir: string,
      issues: readonly BootHealthIssue[],
    ): Promise<BootSelfHealReport> {
      if (issues.length === 0) {
        return {
          healthy: true,
          issues: [],
          attemptedRemediations: [],
        }
      }

      const attempts = await executeRemediations(rootDir, issues)
      const postRemediationIssues = inspectBootHealth(rootDir)

      return {
        healthy: postRemediationIssues.length === 0,
        issues: postRemediationIssues,
        attemptedRemediations: attempts,
      }
    },
  }
}
