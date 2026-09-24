/**
 * Environment and manifest inspector for DeepSeek Harness boot prerequisites.
 * @module @deepseek-ai/dsh-boot-self-heal/manifest-checker
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { BootHealthIssue } from './types.ts'

const CLIENT_BUILD_RECORD_REL = '.dsh-build/client-build-environment.json'

/**
 * Inspect client build records, client bundle files, and common temp artifacts.
 * @param rootDir - repository root directory.
 * @returns detected boot health issues.
 */
export function inspectBootHealth(rootDir: string): BootHealthIssue[] {
  const issues: BootHealthIssue[] = []
  const recordPath = resolve(rootDir, CLIENT_BUILD_RECORD_REL)

  if (!existsSync(recordPath)) {
    issues.push({
      code: 'MISSING_CLIENT_RECORD',
      message: `Client build record is missing at ${CLIENT_BUILD_RECORD_REL}. Client plugins cannot be verified.`,
      target: CLIENT_BUILD_RECORD_REL,
      autoFixable: true,
      remediationAction: 'BUILD_CLIENT',
    })
  } else {
    try {
      const raw = readFileSync(recordPath, 'utf8')
      const parsed = JSON.parse(raw) as {
        formatVersion?: number
        artifacts?: { fileCount?: number; sha256?: string }
      }
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.formatVersion !== 'number') {
        issues.push({
          code: 'CORRUPT_CLIENT_RECORD',
          message: `Client build record at ${CLIENT_BUILD_RECORD_REL} has invalid schema.`,
          target: CLIENT_BUILD_RECORD_REL,
          autoFixable: true,
          remediationAction: 'BUILD_CLIENT',
        })
      } else if (
        !parsed.artifacts
        || typeof parsed.artifacts.fileCount !== 'number'
        || parsed.artifacts.fileCount < 1
      ) {
        issues.push({
          code: 'STALE_CLIENT_RECORD',
          message: `Client build record at ${CLIENT_BUILD_RECORD_REL} references empty or invalid artifacts.`,
          target: CLIENT_BUILD_RECORD_REL,
          autoFixable: true,
          remediationAction: 'BUILD_CLIENT',
        })
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err)
      issues.push({
        code: 'CORRUPT_CLIENT_RECORD',
        message: `Client build record at ${CLIENT_BUILD_RECORD_REL} cannot be parsed: ${errMessage}`,
        target: CLIENT_BUILD_RECORD_REL,
        autoFixable: true,
        remediationAction: 'BUILD_CLIENT',
      })
    }
  }

  // Probe web app dist bundle
  const webDistIndex = resolve(rootDir, 'apps/web/dist/index.html')
  if (!existsSync(webDistIndex)) {
    issues.push({
      code: 'MISSING_CLIENT_BUNDLE',
      message: 'apps/web/dist/index.html is missing. Web frontend client is unbuilt.',
      target: 'apps/web/dist',
      autoFixable: true,
      remediationAction: 'BUILD_CLIENT',
    })
  }

  // Probe core client packages to check if lib/client.js exists
  const clientPackagesDir = resolve(rootDir, 'packages/client')
  if (existsSync(clientPackagesDir)) {
    try {
      const subdirs = readdirSync(clientPackagesDir)
      for (const subdir of subdirs) {
        const pkgJsonPath = join(clientPackagesDir, subdir, 'package.json')
        if (!existsSync(pkgJsonPath)) continue
        try {
          const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
            exports?: Record<string, string | Record<string, string>>
          }
          const hasClientExport = Boolean(
            pkgJson.exports && (
              pkgJson.exports['./client']
              || Object.keys(pkgJson.exports).some(k => k.includes('client'))
            ),
          )
          if (hasClientExport) {
            const clientBundlePath = join(clientPackagesDir, subdir, 'lib/client.js')
            if (!existsSync(clientBundlePath)) {
              issues.push({
                code: 'MISSING_CLIENT_BUNDLE',
                message: `Client module bundle missing: packages/client/${subdir}/lib/client.js`,
                target: `packages/client/${subdir}`,
                autoFixable: true,
                remediationAction: 'BUILD_CLIENT',
              })
              break // One missing bundle is enough to trigger rebuild
            }
          }
        } catch {
          // Ignore unparseable package.json in client scan
        }
      }
    } catch {
      // Ignore directory read error
    }
  }

  // Check for node temp lock files if on Windows
  if (process.platform === 'win32') {
    const tempDir = process.env.TEMP || process.env.TMP
    if (tempDir && existsSync(tempDir)) {
      // Non-blocking check for orphan esbuild locks
      try {
        const tempFiles = readdirSync(tempDir)
        const esbuildTemps = tempFiles.filter(f => f.startsWith('esbuild-') && f.endsWith('.tmp'))
        if (esbuildTemps.length > 50) {
          issues.push({
            code: 'LOCK_FILE_CONFLICT',
            message: `Detected ${String(esbuildTemps.length)} stale esbuild temporary files in ${tempDir}.`,
            target: tempDir,
            autoFixable: true,
            remediationAction: 'CLEAN_TEMP_LOCKS',
          })
        }
      } catch {
        // Temp read error is non-fatal
      }
    }
  }

  return issues
}
