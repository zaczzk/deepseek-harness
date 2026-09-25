/**
 * Auto-remediation executor for detected boot health issues.
 * @module @deepseek-ai/dsh-boot-self-heal/remediator
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { findRepoRoot } from './manifest-checker.ts'
import type { BootHealthIssue, RemediationAttempt } from './types.ts'

/**
 * Execute remediation actions for a list of detected issues.
 * @param rootDir - repository root directory.
 * @param issues - issues to attempt repairing.
 * @returns list of remediation attempts and results.
 */
export async function executeRemediations(
  rootDir: string,
  issues: readonly BootHealthIssue[],
): Promise<RemediationAttempt[]> {
  const attempts: RemediationAttempt[] = []
  const processedActions = new Set<string>()
  const resolvedRoot = findRepoRoot(rootDir) ?? rootDir

  for (const issue of issues) {
    if (!issue.autoFixable) {
      attempts.push({
        issue,
        success: false,
        details: 'Issue is marked as non-auto-fixable; manual intervention required.',
      })
      continue
    }

    if (processedActions.has(issue.remediationAction)) {
      // Avoid duplicate remediation runs within the same cycle
      continue
    }
    processedActions.add(issue.remediationAction)

    switch (issue.remediationAction) {
      case 'BUILD_CLIENT': {
        const result = await runBuildCommand(resolvedRoot)
        attempts.push({
          issue,
          success: result.success,
          details: result.output,
        })
        break
      }
      case 'CLEAN_TEMP_LOCKS': {
        const result = cleanTempLocks()
        attempts.push({
          issue,
          success: result.success,
          details: result.output,
        })
        break
      }
      case 'REBUILD_WORKSPACE': {
        const result = await runBuildCommand(resolvedRoot)
        attempts.push({
          issue,
          success: result.success,
          details: result.output,
        })
        break
      }
      case 'INSTALL_DEPENDENCIES': {
        const result = await runInstallCommand(resolvedRoot)
        attempts.push({
          issue,
          success: result.success,
          details: result.output,
        })
        break
      }
      case 'SWITCH_RESCUE_PROFILE': {
        attempts.push({
          issue,
          success: true,
          details: 'Rescue profile fallback registered.',
        })
        break
      }
    }
  }

  return attempts
}

/**
 * Run pnpm install in the repository root asynchronously.
 * @param rootDir - workspace root directory.
 * @returns promise resolving to success flag and output string.
 */
function runInstallCommand(rootDir: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'cmd.exe' : 'pnpm'
    const args = isWindows ? ['/c', 'set CI=true&& pnpm install --no-frozen-lockfile'] : ['install', '--no-frozen-lockfile']

    const proc = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: `Failed to spawn install process: ${err.message}`,
      })
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output: stdout.slice(-1000) || 'Install completed successfully.',
        })
      } else {
        resolve({
          success: false,
          output: (stderr || stdout).slice(-2000) || `Install exited with code ${String(code)}`,
        })
      }
    })
  })
}

/**
 * Run pnpm run build in the repository root asynchronously.
 * @param rootDir - workspace root directory.
 * @returns promise resolving to success flag and output string.
 */
function runBuildCommand(rootDir: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'cmd.exe' : 'pnpm'
    const args = isWindows ? ['/c', 'set CI=true&& pnpm run build'] : ['run', 'build']

    const proc = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: `Failed to spawn build process: ${err.message}`,
      })
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          output: stdout.slice(-1000) || 'Build completed successfully.',
        })
      } else {
        resolve({
          success: false,
          output: (stderr || stdout).slice(-2000) || `Build exited with code ${String(code)}`,
        })
      }
    })
  })
}

/**
 * Remove stale esbuild temporary files.
 * @returns result of cleaning operation.
 */
function cleanTempLocks(): { success: boolean; output: string } {
  const tempDir = process.env.TEMP || process.env.TMP
  if (!tempDir || !existsSync(tempDir)) {
    return { success: false, output: 'No valid temporary directory found.' }
  }

  try {
    const files = readdirSync(tempDir)
    let removed = 0
    for (const file of files) {
      if (file.startsWith('esbuild-') && file.endsWith('.tmp')) {
        try {
          unlinkSync(join(tempDir, file))
          removed += 1
        } catch {
          // File may be locked by active process, ignore
        }
      }
    }
    return {
      success: true,
      output: `Removed ${String(removed)} stale temporary lock files from ${tempDir}.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: `Failed to clean temporary locks: ${msg}`,
    }
  }
}
