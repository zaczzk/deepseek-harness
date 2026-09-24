import { describe, expect, it } from 'vitest'
import { classifyErrorOutput } from '../src/classifier.ts'

describe('guard-self-heal error classifier', () => {
  it('correctly categorizes TypeScript TS2305 missing export', () => {
    const output = `
src/index.ts:12:10 - error TS2305: Module '"./types.ts"' has no exported member 'FooBar'.
12 import { FooBar } from './types.ts'
            ~~~~~~
`
    const diagnosis = classifyErrorOutput('tsc -b', 2, output)
    expect(diagnosis.category).toBe('TYPESCRIPT')
    expect(diagnosis.severity).toBe('INLINE_HINT')
    expect(diagnosis.summary).toContain('FooBar')
    expect(diagnosis.recommendedAction).toContain('Check the source module')
    expect(diagnosis.diagnosticHint).toContain('[Self-Healing Diagnostic Notice]')
  })

  it('correctly categorizes TypeScript TS2307 cannot find module', () => {
    const output = `
src/app.ts:4:23 - error TS2307: Cannot find module './missing-file.ts' or its corresponding type declarations.
4 import { helper } from './missing-file.ts'
`
    const diagnosis = classifyErrorOutput('pnpm run build', 2, output)
    expect(diagnosis.category).toBe('TYPESCRIPT')
    expect(diagnosis.severity).toBe('INLINE_HINT')
    expect(diagnosis.summary).toContain('missing-file.ts')
    expect(diagnosis.recommendedAction).toContain('does not exist or is missing file extension')
  })

  it('correctly categorizes TypeScript TS2304 name not found', () => {
    const output = `
src/service.ts:15:3 - error TS2304: Cannot find name 'unresolvedIdentifier'.
`
    const diagnosis = classifyErrorOutput('tsc', 2, output)
    expect(diagnosis.category).toBe('TYPESCRIPT')
    expect(diagnosis.summary).toContain('unresolvedIdentifier')
    expect(diagnosis.recommendedAction).toContain('Add an import')
  })

  it('correctly categorizes runtime Cannot find module', () => {
    const output = `
node:internal/modules/cjs/loader:1228
  throw err;
  ^
Error: Cannot find module 'some-uninstalled-pkg'
Require stack:
- /path/to/script.js
`
    const diagnosis = classifyErrorOutput('node script.js', 1, output)
    expect(diagnosis.category).toBe('RUNTIME')
    expect(diagnosis.summary).toContain('some-uninstalled-pkg')
    expect(diagnosis.recommendedAction).toContain('pnpm add')
  })

  it('correctly categorizes bundler crashes with DELEGATE_SUBAGENT severity', () => {
    const output = `
[vite] Internal server error: Failed to parse source for import analysis because the content contains invalid JS syntax.
  Plugin: vite:import-analysis
  File: /src/components/Header.vue:24:1
`
    const diagnosis = classifyErrorOutput('pnpm run build:web', 1, output)
    expect(diagnosis.category).toBe('BUNDLER')
    expect(diagnosis.severity).toBe('DELEGATE_SUBAGENT')
    expect(diagnosis.summary).toContain('Bundler build failure')
  })

  it('correctly categorizes EPERM filesystem locks', () => {
    const output = `
Error: EPERM: operation not permitted, unlink 'C:\\temp\\esbuild-xyz.tmp'
`
    const diagnosis = classifyErrorOutput('pnpm build', 1, output)
    expect(diagnosis.category).toBe('ENVIRONMENT')
    expect(diagnosis.summary).toContain('EPERM')
    expect(diagnosis.recommendedAction).toContain('locked by a running process')
  })

  it('correctly categorizes test suite failures with DELEGATE_SUBAGENT severity', () => {
    const output = `
FAIL packages/core/agent/tests/agent.spec.ts
AssertionError: expected 'active' to equal 'idle'
Tests: 1 failed, 15 passed, 16 total
`
    const diagnosis = classifyErrorOutput('vitest run', 1, output)
    expect(diagnosis.category).toBe('TEST_FAILURE')
    expect(diagnosis.severity).toBe('DELEGATE_SUBAGENT')
    expect(diagnosis.summary).toContain('FAIL packages/core/agent')
  })

  it('falls back to generic error classification for unknown failure patterns', () => {
    const output = `
custom-cli failed: unexpected exit code 42
`
    const diagnosis = classifyErrorOutput('custom-cli --run', 42, output)
    expect(diagnosis.category).toBe('GENERIC')
    expect(diagnosis.severity).toBe('INLINE_HINT')
    expect(diagnosis.diagnosticHint).toContain('failed with exit code 42')
  })
})
