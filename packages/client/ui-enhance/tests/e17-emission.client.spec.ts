import { describe, expect, it } from 'vitest'
import { EnhanceController } from '../src/client/enhance-controller.ts'
import type { EnhanceDeps, EnhanceGoalDraft, EnhanceStream } from '../src/client/enhance-controller.ts'

/** One deterministic goal draft carried by the unary preview. */
const GOAL: EnhanceGoalDraft = {
  objective: 'Ship the settings page.',
  completionCriteria: ['Ship the settings page.', 'Keep it responsive.'],
}

/** A stream that settles immediately with one complete rewrite. */
function settledStream(text: string): EnhanceStream {
  let sent = false
  return {
    dispose: () => {},
    [Symbol.asyncIterator]: () => ({
      next: (): Promise<IteratorResult<{ text: string }>> => {
        if (sent) return Promise.resolve({ done: true, value: undefined })
        sent = true
        return Promise.resolve({ done: false, value: { text } })
      },
      return: (): Promise<IteratorResult<{ text: string }>> => Promise.resolve({ done: true, value: undefined }),
    }),
  }
}

/** Drive one controller to ready and record its goal-seam calls. */
function bench(toggle: boolean): {
  controller: EnhanceController
  calls: { setDraft: string[]; created: EnhanceGoalDraft[] }
  completeCreate: () => void
  failCreate: () => void
  settle: () => Promise<void>
} {
  const calls = { setDraft: [] as string[], created: [] as EnhanceGoalDraft[] }
  let settleCreate: (() => void) | undefined
  let rejectCreate: ((reason: Error) => void) | undefined
  const deps: EnhanceDeps = {
    stream: () => settledStream('Ship the settings page.'),
    readDraft: () => ({ text: 'original', rev: 1 }),
    watchDraft: () => () => {},
    goalDraft: () => Promise.resolve(GOAL),
    createGoal: goal => new Promise<void>((resolve, reject) => {
      calls.created.push(goal)
      settleCreate = resolve
      rejectCreate = reject
    }),
    setDraft: text => { calls.setDraft.push(text) },
    focus: () => {},
  }
  const controller = new EnhanceController(deps)
  controller.request()
  return {
    controller,
    calls,
    completeCreate: () => { settleCreate?.() },
    failCreate: () => { rejectCreate?.(new Error('goal seam down')) },
    settle: async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      if (toggle) controller.toggleGoal()
    },
  }
}

/** Let the async accept flow run. */
async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('E17 atomic goal emission on accept', () => {
  it('creates the goal through the goal seam and replaces the draft once', async () => {
    const b = bench(true)
    await b.settle()
    b.controller.accept()
    await flush()
    b.completeCreate()
    await flush()
    expect(b.calls.created).toEqual([GOAL])
    expect(b.calls.setDraft).toEqual(['Ship the settings page.'])
    expect(b.controller.state.getSnapshot().open).toBe(false)
  })

  it('replaces the draft without goal creation when the toggle is off', async () => {
    const b = bench(false)
    await b.settle()
    b.controller.accept()
    await flush()
    expect(b.calls.created).toEqual([])
    expect(b.calls.setDraft).toEqual(['Ship the settings page.'])
  })

  it('goal-create failure leaves the draft untouched and the preview retained', async () => {
    const b = bench(true)
    await b.settle()
    b.controller.accept()
    await flush()
    b.failCreate()
    await flush()
    expect(b.calls.setDraft).toEqual([])
    expect(b.controller.state.getSnapshot()).toMatchObject({ open: true, status: 'error', text: 'Ship the settings page.' })
  })
})
