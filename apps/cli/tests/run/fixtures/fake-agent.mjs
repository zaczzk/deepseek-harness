/**
 * Fake headless agent child for `dsh run` tests: speaks the `--json` stream
 * vocabulary, makes one real file change in its working directory, and varies
 * its behaviour through FAKE_AGENT_MODE. FAKE_STAMP_DIR names a directory
 * outside the worktree where synchronisation stamps are written.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const task = await new Promise((resolve) => {
  let text = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { text += chunk })
  process.stdin.on('end', () => { resolve(text) })
})

const mode = process.env.FAKE_AGENT_MODE ?? 'completed'
const sessionId = process.env.FAKE_SESSION_ID ?? 'session-fake'
const emit = (event) => { process.stdout.write(`${JSON.stringify(event)}\n`) }

emit({ type: 'session', sessionId, cwd: process.cwd() })
emit({ type: 'status', phase: 'turn_start', turn: 1 })

if (mode === 'stream-error') {
  emit({ type: 'error', message: 'fake agent could not start' })
  process.exit(1)
}

if (mode === 'slow') {
  emit({ type: 'text', text: 'working' })
  if (process.env.FAKE_STAMP_DIR !== undefined) {
    writeFileSync(join(process.env.FAKE_STAMP_DIR, 'slow-started.txt'), 'started')
  }
  await new Promise((resolve) => setTimeout(resolve, 30_000))
}

writeFileSync(join(process.cwd(), 'task-output.txt'), `task: ${task}`)
emit({ type: 'text', text: 'done' })

if (mode === 'no-usage') {
  emit({ type: 'status', phase: 'step_end', turn: 1, step: 1 })
} else if (mode === 'partial-usage') {
  emit({ type: 'status', phase: 'step_end', turn: 1, step: 1, usage: { inputTokens: 3, outputTokens: 1 } })
  emit({ type: 'status', phase: 'step_end', turn: 1, step: 2, usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 } })
} else if (mode === 'two-steps') {
  emit({ type: 'status', phase: 'step_end', turn: 1, step: 1, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, reasoningTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } })
  emit({ type: 'status', phase: 'turn_start', turn: 2 })
  emit({ type: 'status', phase: 'step_end', turn: 2, step: 1, usage: { inputTokens: 6, outputTokens: 3, totalTokens: 9, reasoningTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } })
} else {
  emit({ type: 'status', phase: 'step_end', turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, reasoningTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0 } })
}

if (mode === 'turn-error' || mode === 'rate-limited') {
  const failure = mode === 'rate-limited'
    ? { code: 'RATE_LIMITED', message: 'provider rate limit' }
    : { code: 'FAKE_TOOL_FAILURE', message: 'the fake tool failed' }
  emit({ type: 'status', phase: 'turn_end', turn: 1, reason: { kind: 'error', error: failure } })
  emit({ type: 'final', text: '' })
  process.exit(1)
}

emit({ type: 'status', phase: 'turn_end', turn: 1, reason: { kind: 'completed' } })
emit({ type: 'final', text: `answer: ${task.trim()}` })
process.exit(0)
