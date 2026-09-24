/**
 * Error classifier for command and tool failures.
 * Matches compiler diagnostics, bundler crashes, test runners, and runtime errors.
 * @module @deepseek-ai/dsh-guard-self-heal/classifier
 */

import type { ErrorCategory, ErrorClassification, ErrorSeverity } from './types.ts'

interface ErrorRule {
  readonly id: string
  readonly category: ErrorCategory
  readonly severity: ErrorSeverity
  readonly pattern: RegExp
  readonly extractSummary: (match: RegExpExecArray, text: string) => string
  readonly advice: (match: RegExpExecArray, text: string) => string
}

const RULES: readonly ErrorRule[] = [
  // TypeScript missing symbol / export
  {
    id: 'TS_MISSING_MEMBER',
    category: 'TYPESCRIPT',
    severity: 'INLINE_HINT',
    pattern: /error TS(2305|2339):\s+(?:Module\s+['"][^]+?['"]\s+has\s+no\s+exported\s+member|Property)\s+['"]([^'"]+)['"]/i,
    extractSummary: (match) => `TypeScript: Member or property '${match[2] ?? 'unknown'}' does not exist (TS${match[1] ?? 'unknown'})`,
    advice: (match) =>
      `Check the source module exporting '${match[2] ?? ''}'. Ensure the symbol name is spelled correctly and properly exported with 'export'.`,
  },
  // TypeScript missing module or file
  {
    id: 'TS_CANNOT_FIND_MODULE',
    category: 'TYPESCRIPT',
    severity: 'INLINE_HINT',
    pattern: /error TS(2307):\s+Cannot find module\s+['"]([^'"]+)['"]/i,
    extractSummary: (match) => `TypeScript: Cannot find module '${match[2] ?? 'unknown'}' (TS2307)`,
    advice: (match) =>
      `The imported path '${match[2] ?? ''}' does not exist or is missing file extension (.ts/.js). Check relative path and verify file exists.`,
  },
  // TypeScript name not found
  {
    id: 'TS_NAME_NOT_FOUND',
    category: 'TYPESCRIPT',
    severity: 'INLINE_HINT',
    pattern: /error TS(2304):\s+Cannot find name\s+['"]([^'"]+)['"]/i,
    extractSummary: (match) => `TypeScript: Identifier '${match[2] ?? 'unknown'}' is not defined (TS2304)`,
    advice: (match) =>
      `Add an import for '${match[2] ?? ''}' or define the missing variable or type in scope.`,
  },
  // General TypeScript diagnostic (fallback after specific TS rules)
  {
    id: 'TS_GENERIC_ERROR',
    category: 'TYPESCRIPT',
    severity: 'INLINE_HINT',
    pattern: /error TS(\d+):\s+([^\r\n]+)/,
    extractSummary: (match) => `TypeScript Diagnostic: TS${match[1] ?? ''}: ${match[2] ?? ''}`,
    advice: (match) => `Address the type diagnostic TS${match[1] ?? ''} in the reported file line.`,
  },
  // Node / bundler missing package or module
  {
    id: 'MODULE_NOT_FOUND',
    category: 'RUNTIME',
    severity: 'INLINE_HINT',
    pattern: /Error:\s+Cannot find (?:module|package)\s+['"]([^'"]+)['"]/i,
    extractSummary: (match) => `Module resolution failure: Cannot find '${match[1] ?? 'unknown'}'`,
    advice: (match) =>
      `Package '${match[1] ?? ''}' is not installed or not listed in package.json dependencies. Run 'pnpm add ${match[1] ?? ''}' or check workspace dependencies.`,
  },
  // Bundler crash / vite / esbuild error
  {
    id: 'BUNDLER_CRASH',
    category: 'BUNDLER',
    severity: 'DELEGATE_SUBAGENT',
    pattern: /(?:\[vite\]\s+Internal\s+server\s+error|esbuild:\s+error|\[tsdown\]\s+error|Build\s+failed\s+with\s+\d+\s+error)/i,
    extractSummary: (_match, text) => {
      const firstLine = text.split('\n').find(l => /error/i.test(l))?.trim()
      return `Bundler build failure: ${firstLine || 'Bundler crashed during compilation'}`
    },
    advice: () =>
      'Bundler build pipeline encountered a fatal compilation error. Inspect the bundler stack trace and verify module exports and syntax.',
  },
  // Windows file permission / EPERM lock
  {
    id: 'FILESYSTEM_LOCK',
    category: 'ENVIRONMENT',
    severity: 'INLINE_HINT',
    pattern: /EPERM:\s+operation not permitted,\s+(?:unlink|open|rmdir)\s+['"]([^'"]+)['"]/i,
    extractSummary: (match) => `Filesystem Lock: Access denied (EPERM) on ${match[1] ?? 'path'}`,
    advice: () =>
      'The file is currently locked by a running process (Node server, bundler watcher, or editor). Close conflicting processes or retry.',
  },
  // Test suite failure
  {
    id: 'TEST_SUITE_FAIL',
    category: 'TEST_FAILURE',
    severity: 'DELEGATE_SUBAGENT',
    pattern: /(?:FAIL\s+packages\/|Tests:\s+\d+\s+failed|AssertionError:\s+[^\r\n]+)/i,
    extractSummary: (_match, text) => {
      const failLine = text.split('\n').find(l => /AssertionError|FAIL|failed/i.test(l))?.trim()
      return `Test failure: ${failLine || 'One or more tests failed'}`
    },
    advice: () =>
      'Unit tests or behavioral assertions failed. Inspect the test failure diff and adjust the implementation or test expectations.',
  },
  // SyntaxError
  {
    id: 'SYNTAX_ERROR',
    category: 'RUNTIME',
    severity: 'INLINE_HINT',
    pattern: /SyntaxError:\s+([^\r\n]+)/,
    extractSummary: (match) => `Syntax Error: ${match[1] ?? ''}`,
    advice: () => 'Inspect the file containing the syntax error for unclosed brackets, quotes, or invalid tokens.',
  },
]

/**
 * Classifies command and tool execution outputs, extracting structured diagnostic advice.
 * @param command - the executed command string.
 * @param exitCode - exit code returned by the command.
 * @param output - stdout and stderr output.
 * @returns classified error diagnosis.
 */
export function classifyErrorOutput(
  command: string,
  exitCode: number,
  output: string,
): ErrorClassification {
  const matchedRules: string[] = []

  for (const rule of RULES) {
    const match = rule.pattern.exec(output)
    if (match) {
      matchedRules.push(rule.id)
      const summary = rule.extractSummary(match, output)
      const advice = rule.advice(match, output)

      const diagnosticHint =
        `[Self-Healing Diagnostic Notice]\n`
        + `Command '${command}' exited with code ${String(exitCode)}.\n`
        + `Diagnosis: ${summary}\n`
        + `Recommended Action: ${advice}\n`
        + `Please resolve this error before proceeding to ensure system stability.`

      return {
        category: rule.category,
        severity: rule.severity,
        summary,
        matchedRules,
        recommendedAction: advice,
        diagnosticHint,
      }
    }
  }

  // Fallback for uncategorized errors
  const firstErrorLine = output
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0 && /error|failed|exception/i.test(l))
    || `Command exited with non-zero status ${String(exitCode)}`

  const fallbackHint =
    `[Self-Healing Diagnostic Notice]\n`
    + `Command '${command}' failed with exit code ${String(exitCode)}.\n`
    + `Details: ${firstErrorLine}\n`
    + `Please inspect the command output above and correct any reported issues.`

  return {
    category: 'GENERIC',
    severity: 'INLINE_HINT',
    summary: firstErrorLine,
    matchedRules: ['GENERIC_FAILURE'],
    recommendedAction: 'Inspect command stderr/stdout output and rectify the failure.',
    diagnosticHint: fallbackHint,
  }
}
