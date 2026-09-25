import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { UsageIndicator } from '../src/client/UsageIndicator.tsx'
import type { UsageReport } from '../src/client/contract.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'

type InjectedFace = {
  loadLimits: () => Promise<UsageReport>
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declaration = declare(slots)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { slots, declaration, fiber }
}

describe('usage browser plugin', () => {
  it('contributes the header meter and removes it on fiber disposal', async () => {
    const b = await bench()
    expect(inject).toEqual(['slots', 'locale'])
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(1)
    const entry = b.slots.entries('conversation.session.header.utilities')[0]!
    expect(entry.component).toBe(UsageIndicator)
    expect(entry.options).toMatchObject({ id: 'usage', order: 10 })
    const face = entry.inject!() as InjectedFace
    expect(await face.loadLimits()).toEqual({ limits: [], state: 'ok' })

    await b.fiber.dispose()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
  })

  it('re-registers after the declaring slot collapses and returns', async () => {
    const b = await bench()
    b.declaration()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    const redeclare = declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('conversation.session.header.utilities')[0]?.component).toBe(UsageIndicator)
    redeclare()
    await b.fiber.dispose()
  })

  it('runs the node half as a no-op', () => {
    expect(() => { hostApply() }).not.toThrow()
  })
})
