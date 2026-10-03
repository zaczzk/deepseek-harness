// @vitest-environment jsdom
/**
 * ui-milestone browser half on a real cordis Context with fake slots /
 * ui-conversation / sessions faces: the plugin registers the
 * `project/milestone` Conversation Definition and its keyed
 * `conversation.chat.node` renderer plus the `milestone` dictionary, the
 * registration rides the plugin fiber (HMR safety), and the node half stays
 * inert. The transcript projection and the row renderer themselves are
 * covered by milestone.client.spec.tsx; this spec exercises the registration
 * calls in src/client/index.ts and the inert node-half apply.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestSessions } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as nodeApply } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { NS } from '../src/client/locales.ts'

afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  const sessions = new TestSessions(async (action) => { await action() }, ctx)
  onTestFinished(async () => {
    await sessions.disposeScopes()
    await ctx.fiber.dispose()
  })
  await sessions.add({ id: 's1' })
  ctx.provide('sessions', sessions)
  const conversation = new UiConversation(ctx, sessions)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root', children: {
      'conversation.chat.node': { kind: 'keyed', scope: 'session' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return { ctx, fiber, conversation, sessions }
}

describe('ui-milestone browser plugin', () => {
  it('registers the milestone Definition, the keyed Chat renderer, and the dictionary', async () => {
    const b = await bench()
    await b.fiber.await()

    const kinds = b.conversation.events.entries().map(d => d.kind)
    expect(kinds).toContain('milestone')

    const entry = b.ctx.slots.entries('conversation.chat.node').find(e => e.options?.key === 'milestone')
    expect(entry).toBeDefined()
    expect(entry!.options).toMatchObject({ key: 'milestone' })
    expect(entry!.locale).toBe(NS)
  })

  it('drops the Definition and renderer when the plugin fiber unloads (HMR safety)', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.conversation.events.entries().map(d => d.kind)).toContain('milestone')
    const before = b.ctx.slots.entries('conversation.chat.node').filter(e => e.options?.key === 'milestone')
    expect(before).toHaveLength(1)

    await b.fiber.dispose()
    expect(b.conversation.events.entries().map(d => d.kind)).not.toContain('milestone')
    const after = b.ctx.slots.entries('conversation.chat.node').filter(e => e.options?.key === 'milestone')
    expect(after).toHaveLength(0)
  })
})

describe('ui-milestone node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
