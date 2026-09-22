// @vitest-environment jsdom
/**
 * ui-enhance browser half on a real cordis Context with fake Remote, slots,
 * locale, and input-facade faces: the plugin registers the button and preview
 * entries over one shared per-session controller, its streaming face drives
 * the conversation input facade (including the observed keystroke abort), and
 * every registration withdraws with the plugin fiber. The node half stays inert.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InputState, SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { streamDouble, type StreamDouble } from './enhance-doubles.ts'
import type { EnhanceButtonInjected } from '../src/client/EnhanceButtonView.tsx'
import type { EnhancePreviewInjected } from '../src/client/EnhancePreviewView.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply, name as nodeName } from '../src/index.ts'

afterEach(cleanup)

const sid = (key: string): SessionId => key as SessionId

/** One entry's type-erased inject factory in its business signature. */
type EntryInject = (sessionId: SessionId) => object

/**
 * Read one slot entry's type-erased inject factory in its business signature.
 * @param entry - stored slot entry carrying the erased factory.
 * @returns the factory narrowed to one business call.
 */
function injectOf(entry: { inject?: ((...args: never[]) => Record<string, unknown>) | undefined }): EntryInject {
  const factory = entry.inject
  if (factory === undefined) throw new Error('ui-enhance test: entry carries no inject factory')
  return factory as EntryInject
}

/** Boot the plugin over fake faces; every opened stream lands in `streams`. */
async function bench() {
  const ctx = new Context()
  const actx = new Context()
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const streams: StreamDouble[] = []
  const streamed: string[] = []
  ctx.provide('remote.enhance', {
    previewText: (request: { readonly draft: string }) => {
      streamed.push(request.draft)
      const double = streamDouble()
      streams.push(double)
      return double.stream
    },
  })
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.input.right': { kind: 'list', scope: 'session' },
      'conversation.input.overlay': { kind: 'list', scope: 'session' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const writes: string[] = []
  let focusCount = 0
  const state = createSnapshotStore<InputState>({
    draft: 'Ship the settings page',
    attachmentIds: [],
    draftRev: 1,
    phase: 'plain',
    occurrences: [],
    queue: [],
  })
  const facade: SessionInput = {
    beginCommand: () => false,
    insertReference: () => false,
    setDraft: (text) => {
      writes.push(text)
      state.set({ ...state.getSnapshot(), draft: text })
    },
    addAttachments: () => true,
    removeAttachment: () => true,
    pruneAttachments: () => {},
    submit: () => {},
    notify: () => {},
    focus: () => { focusCount += 1 },
    state,
  }
  ctx.provide('sessions', { scope: (sessionId: SessionId) => (sessionId === sid('missing') ? undefined : actx) })
  ctx.provide('conversation', { input: { for: () => facade } })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const buttonEntry = ctx.slots.entries('conversation.input.right')[0]
  const previewEntry = ctx.slots.entries('conversation.input.overlay')[0]
  if (buttonEntry === undefined || previewEntry === undefined) throw new Error('ui-enhance test: registrations missing')
  return {
    ctx,
    fiber,
    streams,
    streamed,
    writes,
    state,
    focusCount: () => focusCount,
    buttonEntry,
    previewEntry,
    button: (sessionId: SessionId) => injectOf(buttonEntry)(sessionId) as EnhanceButtonInjected,
    preview: (sessionId: SessionId) => injectOf(previewEntry)(sessionId) as EnhancePreviewInjected,
  }
}

/** Let controller stream delivery and settle work run. */
async function flush(): Promise<void> {
  await new Promise(resolve => { setTimeout(resolve, 0) })
}

describe('ui-enhance browser plugin', () => {
  it('registers the button and preview entries with the documented ids, order, and locale', async () => {
    const b = await bench()
    expect({ ...(b.buttonEntry.options ?? {}), locale: b.buttonEntry.locale })
      .toMatchObject({ id: 'enhance-button', order: 2, locale: 'enhance' })
    expect({ ...(b.previewEntry.options ?? {}), locale: b.previewEntry.locale })
      .toMatchObject({ id: 'enhance-preview', order: 2, locale: 'enhance' })
  })

  it('shares one controller per session and streams through the input facade', async () => {
    const b = await bench()
    const button = b.button(sid('s1'))
    const preview = b.preview(sid('s1'))
    expect(preview.controller).toBe(button.controller)
    expect(b.preview(sid('s2')).controller).not.toBe(button.controller)

    button.controller.request()
    expect(b.streamed).toEqual(['Ship the settings page'])
    b.streams[0]!.push('Structured ')
    b.streams[0]!.push('rewrite.')
    b.streams[0]!.end()
    await flush()
    expect(button.controller.state.getSnapshot()).toMatchObject({ status: 'ready', text: 'Structured rewrite.' })
    button.controller.accept()
    await flush()
    expect(b.writes).toEqual(['Structured rewrite.'])
    expect(b.focusCount()).toBe(1)
  })

  it('aborts the stream through the observed input-state revision', async () => {
    const b = await bench()
    const button = b.button(sid('s1'))
    button.controller.request()
    b.streams[0]!.push('partial')
    await flush()
    b.state.set({ ...b.state.getSnapshot(), draftRev: 2 })
    await flush()
    expect(b.streams[0]!.disposals()).toBe(1)
    expect(b.writes).toEqual([])
    expect(button.controller.state.getSnapshot()).toEqual({ open: false, status: 'idle', original: '', text: '', emitGoal: false })
  })

  it('fails loud when a session resolves no scope', async () => {
    const b = await bench()
    expect(() => b.button(sid('missing'))).toThrow(/resolved no scope/u)
  })

  it('withdraws the registrations with the plugin fiber', async () => {
    const b = await bench()
    await b.fiber.dispose()
    expect(b.ctx.slots.entries('conversation.input.right')).toHaveLength(0)
    expect(b.ctx.slots.entries('conversation.input.overlay')).toHaveLength(0)
  })

  it('the node half applies without host-side behavior', () => {
    expect(nodeName).toBe('client-ui-enhance')
    expect(() => { nodeApply() }).not.toThrow()
  })
})
