import { describe, expect, it } from 'vitest'
import { computeCostUsd, writeResult } from '../../src/run/result.ts'
import type { DshRunResult, RunUsage } from '../../src/run/types.ts'

const usage: RunUsage = {
  input_tokens: 1_000_000,
  output_tokens: 500_000,
  reasoning_tokens: null,
  cache_read_tokens: null,
  cache_write_tokens: null,
  total_tokens: null,
}

describe('computeCostUsd', () => {
  it('prices reported usage at caller-declared rates', () => {
    expect(computeCostUsd(usage, 2, 8)).toBe(6)
    expect(computeCostUsd({ ...usage, input_tokens: 1_500_000, output_tokens: 250_000 }, 0.35, 2.5)).toBe(1.15)
  })

  it('is null whenever the cost cannot be known', () => {
    expect(computeCostUsd(usage, undefined, 8)).toBeNull()
    expect(computeCostUsd(usage, 2, undefined)).toBeNull()
    expect(computeCostUsd(null, 2, 8)).toBeNull()
  })
})

describe('writeResult', () => {
  it('writes exactly one parseable line', () => {
    const chunks: string[] = []
    const result: DshRunResult = {
      schema: 'dsh-run/1',
      outcome: 'success',
      error: null,
      session_id: 'session-x',
      run_id: 'run-x',
      resumed: false,
      turns: 1,
      usage,
      usage_complete: true,
      cost_usd: 6,
      answer: 'done',
      files_changed: ['a.txt'],
      uncommitted: [],
      tests: { status: 'passed', command: 'npm run test', exit_code: 0 },
      push: { requested: false, pushed: false, reason: 'not-requested' },
      worktree: { created: true, path: '/w', branch: 'dsh-run/r', cleaned: true },
      started_at: '2026-09-22T00:00:00.000Z',
      duration_ms: 42,
      exit_code: 0,
    }
    writeResult({ write: (chunk: string) => { chunks.push(chunk) } }, result)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.endsWith('\n')).toBe(true)
    expect(JSON.parse(chunks[0] as string)).toEqual(result)
  })
})
