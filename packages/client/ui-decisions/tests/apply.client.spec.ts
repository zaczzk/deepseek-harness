/** Plugin wiring: the Decisions conversation view registration. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DecisionsView } from '../src/client/DecisionsView.tsx'
import { createRegisterStore } from '../src/client/store.ts'
import { apply, inject } from '../src/client/index.ts'

const SESSION_ID = 'session-decisions' as SessionId

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
  const readBytes = vi.fn(async () => ({
    ok: true,
    value: { version: 'v1', data: new TextEncoder().encode('# Decisions\n') },
  }))
  new TestRemote(ctx, { workspaceFiles: { readBytes } })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, locale, readBytes, fiber }
}

describe('ui-decisions apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.workspaceFiles'])
  })

  it('registers the decisions view tab with its label, store, and face', async () => {
    const b = await bench()

    const entries = b.slots.entries('conversation.view')
    expect(entries.map(entry => entry.options.id)).toEqual(['decisions'])
    const entry = entries[0]!
    expect(entry.component).toBe(DecisionsView)
    expect(entry.options.order).toBe(30)
    expect(entry.locale).toBe('decisions')
    const label = entry.options.label
    expect(typeof label).toBe('function')
    if (typeof label === 'function') expect(label()).toBe('Decisions')
    const store = entry.store as { create: (key: string) => { getSnapshot: () => unknown } }
    expect(store.create('session-x').getSnapshot()).toEqual({ doc: { status: 'idle' } })
    const injectFace = entry.inject as (sessionId: string, actions: unknown) => Record<string, unknown>
    const face = injectFace(SESSION_ID, {})
    expect(face).toEqual({ loadRegister: expect.any(Function) })

    await b.fiber.dispose()

    expect(b.slots.entries('conversation.view')).toHaveLength(0)
  })

  it('reads the register through the injected face', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view')[0]!
    const instance = createRegisterStore().create('session-1')
    const injectFace = entry.inject as (sessionId: string, actions: unknown) => Record<string, unknown>
    const face = injectFace(SESSION_ID, instance.actions)
    const loadRegister = face.loadRegister as (observedVersion: string) => void

    loadRegister('v1')

    await vi.waitFor(() => {
      expect(b.readBytes).toHaveBeenCalledWith(SESSION_ID, 'DECISIONS.md', {}, undefined)
    })
    await vi.waitFor(() => { expect(instance.getSnapshot().doc.status).toBe('ready') })

    await b.fiber.dispose()
  })

  it('follows the active locale for its tab label', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view')[0]!
    const label = entry.options.label as () => string

    b.locale.setLocale('zh')
    expect(label()).toBe('决策记录')

    await b.fiber.dispose()
  })
})
