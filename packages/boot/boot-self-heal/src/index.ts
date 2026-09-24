/**
 * @deepseek-ai/dsh-boot-self-heal
 * Preflight boot health checks, client bundle integrity verification,
 * and automatic build recovery for DeepSeek Harness.
 * @module @deepseek-ai/dsh-boot-self-heal
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createBootSelfHealService } from './service.ts'
import type { BootHealthIssue, BootIssueCode, BootSelfHealReport, BootSelfHealService, RemediationAction, RemediationAttempt } from './types.ts'

export const name = 'boot-self-heal'

/** Configuration schema for boot self-heal plugin. */
export interface Config {
  /** Whether preflight integrity checks and auto-remediation are enabled (default true). */
  enabled?: boolean
  /** Whether auto-rebuild and cache clean remediations are triggered automatically (default true). */
  autoRemediate?: boolean
  /** Path to the repository root to inspect (default process.cwd()). */
  rootDir?: string
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  autoRemediate: z.boolean().default(true),
  rootDir: z.string().default(''),
})

/**
 * Install the boot self-healing service and optional preflight inspection.
 * @param ctx - Cordis root context.
 * @param config - Validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const service = createBootSelfHealService()
  ctx.provide('bootSelfHeal', service)

  if (config.enabled === false) return

  const root = config.rootDir && config.rootDir.length > 0 ? config.rootDir : process.cwd()

  // Run preflight check on startup asynchronously
  queueMicrotask(async () => {
    try {
      const initialReport = await service.inspectBootEnvironment(root)
      if (!initialReport.healthy) {
        process.stderr.write(
          `[boot-self-heal] Warning: Detected ${String(initialReport.issues.length)} boot health issue(s):\n`
          + initialReport.issues.map(i => `  - [${i.code}] ${i.message}`).join('\n')
          + '\n',
        )

        if (config.autoRemediate !== false) {
          process.stderr.write('[boot-self-heal] Attempting auto-remediation...\n')
          const finalReport = await service.remediate(root, initialReport.issues)
          if (finalReport.healthy) {
            process.stderr.write('[boot-self-heal] Successfully recovered boot environment.\n')
          } else {
            process.stderr.write(
              `[boot-self-heal] Remediation finished with ${String(finalReport.issues.length)} remaining issue(s).\n`,
            )
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[boot-self-heal] Error during preflight inspection: ${msg}\n`)
    }
  })
}

export {
  createBootSelfHealService,
  type BootHealthIssue,
  type BootIssueCode,
  type BootSelfHealReport,
  type BootSelfHealService,
  type RemediationAction,
  type RemediationAttempt,
}
