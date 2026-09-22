import { describe, expect, it } from 'vitest'
import { EnhanceController } from '../src/client/enhance-controller.ts'
import type { EnhanceDeps } from '../src/client/enhance-controller.ts'
import type { EnhancePreviewResult } from '@deepseek-ai/dsh-enhance-runtime'

/** One deterministic preview result for controller tests. */
function previewOf(text: string): EnhancePreviewResult {
  return {
    route: 'enhance',
    matchedRule: 'default',
    depth: 'spec',
    direction: 'enhance',
    outputLanguage: 'en',
    sections: { objective: text, acceptance: [text] },
    text,
  }
}

/** Record collaborator calls with one settler per issued request. */
function depsOf(): {
  deps: EnhanceDeps
  calls: { setDraft: string[]; focus: number; reads: number }
  settle: (index: number, outcome: { preview?: EnhancePreviewResult; reason?: Error }) => void
} {
  const calls = { setDraft: [] as string[], focus: 0, reads: 0 }
  const settlers: Array<{ resolve: (preview: EnhancePreviewResult) => void; reject: (reason: Error) => void }> = []
  const deps: EnhanceDeps = {
    preview: () => new Promise((resolve, reject) => { settlers.push({ resolve, reject }) }),
    readDraft: () => { calls.reads += 1; return 'original draft' },
    setDraft: (text) => { calls.setDraft.push(text) },
    focus: () => { calls.focus += 1 },
  }
  return {
    deps,
    calls,
    settle: (index, outcome) => {
      const settler = settlers[index]
      if (settler === undefined) throw new Error(`no request settled at index ${String(index)}`)
      if (outcome.reason !== undefined) settler.reject(outcome.reason)
      else settler.resolve(outcome.preview as EnhancePreviewResult)
    },
  }
}

/** Let pending promise callbacks run. */
async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('EnhanceController', () => {
  it('requests a preview of the captured draft and lands it', async () => {
    const harness = depsOf()
    const controller = new EnhanceController(harness.deps)
    expect(controller.state.getSnapshot()).toEqual({ open: false, status: 'idle', original: '', preview: null })
    controller.request()
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, status: 'pending', original: 'original draft' })
    harness.settle(0, { preview: previewOf('structured') })
    await flush()
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, status: 'ready', original: 'original draft' })
    expect(controller.state.getSnapshot().preview?.text).toBe('structured')
  })

  it('ignores a stale response landing after a newer attempt', async () => {
    const harness = depsOf()
    const controller = new EnhanceController(harness.deps)
    controller.request()
    controller.request()
    harness.settle(0, { preview: previewOf('stale') })
    harness.settle(1, { preview: previewOf('fresh') })
    await flush()
    expect(controller.state.getSnapshot().preview?.text).toBe('fresh')
  })

  it('settles the error tier on a rejected preview', async () => {
    const harness = depsOf()
    const controller = new EnhanceController(harness.deps)
    controller.request()
    harness.settle(0, { reason: new Error('nope') })
    await flush()
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, status: 'error', preview: null })
  })

  it('accept performs exactly one atomic draft replace and restores focus', async () => {
    const harness = depsOf()
    const controller = new EnhanceController(harness.deps)
    controller.request()
    harness.settle(0, { preview: previewOf('replacement text') })
    await flush()
    controller.accept()
    expect(harness.calls.setDraft).toEqual(['replacement text'])
    expect(harness.calls.focus).toBe(1)
    expect(controller.state.getSnapshot()).toEqual({ open: false, status: 'idle', original: '', preview: null })
  })

  it('accept without a landed preview never touches the draft', () => {
    const harness = depsOf()
    const controller = new EnhanceController(harness.deps)
    controller.accept()
    expect(harness.calls.setDraft).toEqual([])
  })

  it('dismiss discards the preview leaving the draft byte-identical', async () => {
    const harness = depsOf()
    const controller = new EnhanceController(harness.deps)
    controller.request()
    harness.settle(0, { preview: previewOf('never applied') })
    await flush()
    controller.dismiss()
    expect(harness.calls.setDraft).toEqual([])
    expect(harness.calls.focus).toBe(1)
    expect(controller.state.getSnapshot()).toEqual({ open: false, status: 'idle', original: '', preview: null })
  })

  it('a dismissal makes any later landing response stale', async () => {
    const harness = depsOf()
    const controller = new EnhanceController(harness.deps)
    controller.request()
    controller.dismiss()
    harness.settle(0, { preview: previewOf('stale') })
    await flush()
    expect(controller.state.getSnapshot()).toEqual({ open: false, status: 'idle', original: '', preview: null })
  })
})
