/** Plugin wiring: the Run comparison conversation view registration. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RunComparisonView } from '../src/client/RunComparisonView.tsx'
import { apply, inject } from '../src/client/index.ts'

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
  // The face reads the session-query roster only on demand; the apply body
  // merely holds the sessionQueries service reference.
  ctx.provide('sessionQueries', { listSessions: async () => ({ ok: true, value: { records: [] } }) } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, locale, fiber }
}

describe('ui-run-comparison apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessionQueries'])
  })

  it('registers the run-comparison conversation view entry at order 40', async () => {
    const b = await bench()
    const entries = b.slots.entries('conversation.view')
    expect(entries.map(entry => entry.options.id)).toEqual(['run-comparison'])
    const entry = entries[0]!
    expect(entry.component).toBe(RunComparisonView)
    expect(entry.options.order).toBe(40)
    expect(entry.locale).toBe('runComparison')
    expect(typeof entry.options.label).toBe('function')
    const label = entry.options.label as () => string
    expect(label()).toBe('Run comparison')
    // The registration rides the slot effect: teardown removes the tab (HMR safety).
    await b.fiber.dispose()
    expect(b.slots.entries('conversation.view')).toHaveLength(0)
  })

  it('follows the active locale for its tab label', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view')[0]!
    const label = entry.options.label as () => string
    expect(label()).toBe('Run comparison')
    b.locale.setLocale('zh')
    expect(label()).toBe('运行对比')
  })

  it('builds the run-comparison face through the entry inject factory', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view')[0]!
    // The slot inject factory binds the sessionQueries service to the actions and
    // returns the business face (index.ts line 55).
    const inject = (entry as unknown as { inject: (sessionId: string, actions: { pick: unknown }) => {
      loadRoster: () => void
      pick: (side: 'a' | 'b', sessionId: string | null) => void
      retryRoster: () => void
      retryRead: (side: 'a' | 'b') => void
    } }).inject
    const actions = { pick: () => void 0 } as unknown as Parameters<typeof inject>[1]
    const face = inject('run-comp', actions)
    expect(typeof face.loadRoster).toBe('function')
    expect(typeof face.pick).toBe('function')
    expect(typeof face.retryRoster).toBe('function')
    expect(typeof face.retryRead).toBe('function')
  })
})