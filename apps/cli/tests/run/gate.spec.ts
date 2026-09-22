import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveTestSpec, runGate } from '../../src/run/gate.ts'

const directories: string[] = []

function fixture(manifest?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-run-gate-'))
  directories.push(dir)
  if (manifest !== undefined) writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  return dir
}

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop() as string, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 })
  }
})

describe('resolveTestSpec', () => {
  it('prefers the explicit command verbatim', () => {
    expect(resolveTestSpec(fixture({ scripts: { test: 'ignored' } }), 'pytest -q'))
      .toEqual({ kind: 'command', command: 'pytest -q' })
  })

  it('discovers the test script through the pinned package manager', () => {
    expect(resolveTestSpec(fixture({ scripts: { test: 'node test.js' }, packageManager: 'pnpm@10.4.0' }), undefined))
      .toEqual({ kind: 'command', command: 'pnpm run test' })
    expect(resolveTestSpec(fixture({ scripts: { test: 'node test.js' }, packageManager: 'yarn@4.1.0' }), undefined))
      .toEqual({ kind: 'command', command: 'yarn run test' })
  })

  it('falls back to npm for an unpinned or unknown pin', () => {
    expect(resolveTestSpec(fixture({ scripts: { test: 'node test.js' } }), undefined))
      .toEqual({ kind: 'command', command: 'npm run test' })
    expect(resolveTestSpec(fixture({ scripts: { test: 'node test.js' }, packageManager: 'weird@1' }), undefined))
      .toEqual({ kind: 'command', command: 'npm run test' })
  })

  it('reports absence instead of guessing a command', () => {
    expect(resolveTestSpec(fixture({ scripts: { build: 'tsc' } }), undefined)).toEqual({ kind: 'absent' })
    expect(resolveTestSpec(fixture({}), undefined)).toEqual({ kind: 'absent' })
    expect(resolveTestSpec(fixture(), undefined)).toEqual({ kind: 'absent' })
  })
})

describe('runGate', () => {
  it('passes only on exit code 0', () => {
    const outcome = runGate(fixture(), { kind: 'command', command: 'node -e "process.exit(0)"' })
    expect(outcome).toEqual({ status: 'passed', command: 'node -e "process.exit(0)"', exit_code: 0, timedOut: false, detail: null })
  })

  it('reports a non-zero exit as failure with its output', () => {
    const outcome = runGate(fixture(), { kind: 'command', command: 'node -e "console.error(\'boom\');process.exit(3)"' })
    expect(outcome.status).toBe('failed')
    expect(outcome.exit_code).toBe(3)
    expect(outcome.detail).toContain('boom')
  })

  it('reports a missing executable as unavailable, never as passed', () => {
    const outcome = runGate(fixture(), { kind: 'command', command: 'dsh-no-such-command-xyz' })
    expect(outcome.status).toBe('unavailable')
    expect(outcome.exit_code).not.toBe(0)
  })

  it('keeps a failing suite that prints command-not-found as failed', () => {
    const outcome = runGate(fixture(), {
      kind: 'command',
      command: 'node -e "console.error(\'command not found inside a test\');process.exit(2)"',
    })
    expect(outcome.status).toBe('failed')
    expect(outcome.exit_code).toBe(2)
  })

  it('reports an unreadable manifest loudly instead of absent', () => {
    const dir = fixture({ scripts: { test: 'node test.js' } })
    rmSync(join(dir, 'package.json'))
    // A directory in the manifest's place makes the read fail without ENOENT.
    mkdirSync(join(dir, 'package.json'))
    expect(resolveTestSpec(dir, undefined)).toMatchObject({ kind: 'unreadable' })
    expect(runGate(dir, { kind: 'unreadable', error: 'package.json is not valid JSON' }))
      .toMatchObject({ status: 'unavailable', detail: 'package.json is not valid JSON' })
    rmSync(join(dir, 'package.json'), { recursive: true, force: true })
  })

  it('reports an absent spec without running anything', () => {
    expect(runGate(fixture(), { kind: 'absent' }))
      .toEqual({ status: 'absent', command: null, exit_code: null, timedOut: false, detail: null })
  })

  it('kills a command that exceeds its bound and reports the timeout', () => {
    // The killed shell leaves its grandchild alive with the command's working
    // directory held, and Windows refuses to delete a held directory; run this
    // case from the OS temp root, which no test sweeps.
    const outcome = runGate(tmpdir(), { kind: 'command', command: 'node -e "setTimeout(()=>{},800)"' }, 150)
    expect(outcome.status).toBe('unavailable')
    expect(outcome.timedOut).toBe(true)
  })
})
