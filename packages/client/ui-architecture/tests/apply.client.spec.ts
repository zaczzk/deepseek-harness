/** Plugin wiring: the Architecture conversation view registration. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ArchitectureView } from '../src/client/ArchitectureView.tsx'
import { apply, inject } from '../src/client/index.ts'
import { createArchitectureStore } from '../src/client/store.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    { name: 'root', children: { 'conversation.view': { kind: 'list', scope: 'session' } } } as never,
    () => null,
  )
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const readBytes = vi.fn(async () => ({ ok: false, error: { code: 'x' } }))
  ctx.provide('remote', { workspaceFiles: { readBytes } })
  ctx.provide('remote.workspaceFiles', {})
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, locale, fiber, readBytes }
}

describe('ui-architecture apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.workspaceFiles'])
  })

  it('registers the architecture view tab with its label, store, and face', async () => {
    const b = await bench()

    const entries = b.slots.entries('conversation.view')
    expect(entries.map(entry => entry.options.id)).toEqual(['architecture'])
    const entry = entries[0]!
    expect(entry.component).toBe(ArchitectureView)
    expect(entry.options.order).toBe(20)
    expect(entry.locale).toBe('architecture')
    expect((entry.options.label as () => string)()).toBe('Architecture')
    const store = entry.store as ReturnType<typeof createArchitectureStore>
    expect(store.create('session-x').getSnapshot()).toMatchObject({
      architecture: { status: 'idle' }, register: { status: 'idle' }, render: { status: 'idle' },
    })
    const injectFace = entry.inject as (sessionId: string, actions: unknown) => Record<string, unknown>
    expect(Object.keys(injectFace('session-x', {}))).toEqual(['loadArchitecture', 'loadRegister', 'renderDiagram'])
    const face = injectFace('session-x', {
      loading: () => {}, loaded: () => {}, failed: () => {},
      rendering: () => {}, rendered: () => {}, renderFailed: () => {},
    }) as { loadArchitecture: (version: string) => void }
    face.loadArchitecture('v1')
    await vi.waitFor(() => {
      expect(b.readBytes).toHaveBeenCalledWith('session-x', 'ARCHITECTURE.md', {}, undefined)
    })

    await b.fiber.dispose()

    expect(b.slots.entries('conversation.view')).toHaveLength(0)
  })

  it('follows the active locale for its tab label', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view')[0]!
    const label = entry.options.label as () => string

    b.locale.setLocale('zh')
    expect(label()).toBe('架构')

    await b.fiber.dispose()
  })
})
