import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnhanceController } from '../src/client/enhance-controller.ts'
import { enhanceDoubles } from './enhance-doubles.client.ts'

/** The settled closed state every abort leaves behind. */
const CLOSED = { open: false, status: 'idle', original: '', text: '', emitGoal: false }

/** Manual animation-frame queue so each test owns its painted frames. */
let frames: Array<() => void> = []

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback)
    return frames.length
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Run one animation frame: every callback scheduled since the previous frame. */
function runFrame(): void {
  const pending = frames
  frames = []
  for (const callback of pending) callback()
}

/** Let pending stream delivery and settle work run. */
async function flush(): Promise<void> {
  await new Promise(resolve => { setTimeout(resolve, 0) })
}

describe('EnhanceController', () => {
  it('paints each frame of streamed chunks once and settles complete', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    const painted: string[] = []
    controller.state.subscribe(() => { painted.push(controller.state.getSnapshot().text) })
    controller.request()
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, status: 'pending', original: 'original draft' })
    b.streams[0]!.push('Objective:\n')
    await flush()
    runFrame()
    expect(painted).toEqual(['Objective:\n'])
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, status: 'streaming', text: 'Objective:\n' })
    b.streams[0]!.push('Ship it.')
    b.streams[0]!.push('\n\nAcceptance criteria:')
    await flush()
    // Both chunks sit in the state before the next frame but paint together.
    expect(controller.state.getSnapshot().text).toBe('Objective:\nShip it.\n\nAcceptance criteria:')
    expect(painted).toEqual(['Objective:\n'])
    runFrame()
    expect(painted).toEqual(['Objective:\n', 'Objective:\nShip it.\n\nAcceptance criteria:'])
    b.streams[0]!.end()
    await flush()
    runFrame()
    expect(controller.state.getSnapshot()).toMatchObject({
      open: true,
      status: 'ready',
      text: 'Objective:\nShip it.\n\nAcceptance criteria:',
    })
  })

  it('a draft keystroke aborts the stream and discards the overlay byte-identical', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    b.streams[0]!.push('partial ghost')
    await flush()
    b.keystroke()
    expect(b.streams[0]!.disposals()).toBe(1)
    expect(b.unwatches()).toBe(1)
    expect(b.writes).toEqual([])
    expect(b.draft()).toBe('original draft')
    expect(controller.state.getSnapshot()).toEqual(CLOSED)
    b.streams[0]!.push('late chunk')
    await flush()
    runFrame()
    expect(controller.state.getSnapshot()).toEqual(CLOSED)
  })

  it('an input-state change without a revision move leaves the stream running', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    b.nudge()
    await flush()
    expect(b.streams[0]!.disposals()).toBe(0)
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, status: 'pending' })
  })

  it('accept after settle performs exactly one atomic replace of the complete text', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    b.streams[0]!.push('Hello\n')
    b.streams[0]!.push('world')
    b.streams[0]!.end()
    await flush()
    expect(controller.state.getSnapshot()).toMatchObject({ status: 'ready', text: 'Hello\nworld' })
    controller.accept()
    await flush()
    expect(b.writes).toEqual(['Hello\nworld'])
    expect(b.draft()).toBe('Hello\nworld')
    expect(b.focusCount()).toBe(1)
    expect(controller.state.getSnapshot()).toEqual(CLOSED)
  })

  it('accept never touches the draft before the stream settles', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.accept()
    await flush()
    expect(b.writes).toEqual([])
    controller.request()
    b.streams[0]!.push('partial')
    await flush()
    controller.accept()
    await flush()
    expect(b.writes).toEqual([])
    expect(b.draft()).toBe('original draft')
    expect(b.focusCount()).toBe(0)
    expect(b.streams[0]!.disposals()).toBe(0)
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, status: 'streaming' })
  })

  it('dismiss aborts the stream and discards the overlay byte-identical', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    b.streams[0]!.push('ghost')
    await flush()
    controller.dismiss()
    expect(b.streams[0]!.disposals()).toBe(1)
    expect(b.writes).toEqual([])
    expect(b.draft()).toBe('original draft')
    expect(b.focusCount()).toBe(1)
    expect(controller.state.getSnapshot()).toEqual(CLOSED)
  })

  it('a superseding request disposes the first stream and its chunks never land', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    controller.request()
    expect(b.streams).toHaveLength(2)
    expect(b.streams[0]!.disposals()).toBe(1)
    expect(b.unwatches()).toBe(1)
    b.streams[1]!.push('fresh ghost')
    await flush()
    expect(controller.state.getSnapshot()).toMatchObject({ status: 'streaming', text: 'fresh ghost' })
    b.streams[1]!.end()
    await flush()
    expect(controller.state.getSnapshot()).toMatchObject({ status: 'ready', text: 'fresh ghost' })
  })

  it('a chunk handed over before an abort never lands', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    b.streams[0]!.push('late ghost')
    controller.dismiss()
    await flush()
    runFrame()
    expect(controller.state.getSnapshot()).toEqual(CLOSED)
    expect(b.writes).toEqual([])
  })

  it('a failed stream lands nothing and settles the single error tier', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    b.streams[0]!.push('partial')
    b.streams[0]!.fail(new Error('socket down'))
    await flush()
    expect(controller.state.getSnapshot()).toEqual({ open: true, status: 'error', original: 'original draft', text: '', emitGoal: false })
    controller.accept()
    await flush()
    expect(b.writes).toEqual([])
  })

  it('a failure landing on a discarded attempt never opens the error tier', async () => {
    const b = enhanceDoubles('original draft')
    const controller = new EnhanceController(b.deps)
    controller.request()
    b.streams[0]!.fail(new Error('late failure'))
    controller.dismiss()
    await flush()
    runFrame()
    expect(controller.state.getSnapshot()).toEqual(CLOSED)
  })
})
