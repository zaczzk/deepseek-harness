import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRunDir, newRunId, persistRunState, readRunState, removeRunState, writeRunState, type RunState } from '../../src/run/state.ts'

const directories: string[] = []

function commonDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-run-state-'))
  directories.push(dir)
  return dir
}

function state(runId: string, sessionId: string | null): RunState {
  return {
    schema: 'dsh-run-state/1',
    run_id: runId,
    session_id: sessionId,
    worktree: '/w',
    branch: `dsh-run/${runId}`,
    base: 'abc123',
    phase: 'agent-running',
  }
}

afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop() as string, { recursive: true, force: true })
})

describe('run state', () => {
  it('round-trips a record and advances it in place', () => {
    const common = commonDir()
    const runDir = writeRunState(common, state('run-a', null))
    expect(readRunState(runDir)).toEqual(state('run-a', null))
    persistRunState(runDir, { ...state('run-a', 'session-x'), phase: 'interrupted' })
    expect(readRunState(runDir)).toMatchObject({ session_id: 'session-x', phase: 'interrupted' })
    removeRunState(runDir)
    expect(readRunState(runDir)).toBeNull()
  })

  it('finds a run by exact session id or run id and ignores malformed records', () => {
    const common = commonDir()
    writeRunState(common, state('run-a', 'session-one'))
    const runB = writeRunState(common, state('run-b', 'session-two'))
    writeFileSync(join(runB, 'state.json'), 'not json')
    expect(findRunDir(common, 'session-one')?.endsWith('run-a')).toBe(true)
    expect(findRunDir(common, 'run-a')?.endsWith('run-a')).toBe(true)
    expect(findRunDir(common, 'session-two')).toBeNull()
    expect(findRunDir(common, 'session-none')).toBeNull()
  })

  it('finds nothing in a repository with no scratch runs', () => {
    expect(findRunDir(commonDir(), 'session-x')).toBeNull()
  })

  it('mints unique run identities', () => {
    expect(newRunId()).toMatch(/^run-/)
    expect(newRunId()).not.toBe(newRunId())
  })

  it('reads nothing from a record of another schema', () => {
    const common = commonDir()
    const runDir = writeRunState(common, state('run-a', 'session-one'))
    writeFileSync(join(runDir, 'state.json'), JSON.stringify({ schema: 'other/9', run_id: 'run-a' }))
    expect(readRunState(runDir)).toBeNull()
  })
})
