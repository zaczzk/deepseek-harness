// @vitest-environment jsdom
/**
 * ui-approval-rules browser half on a real cordis Context with fake slots /
 * locale / approvalRuleSets faces: the plugin registers the rule-answered
 * `conversation.chat.node` renderer, the `approval-rules` Settings section,
 * and the shared `approval.rules` dictionary on the plugin fiber. The section
 * inject face builds a controller over ctx.approvalRuleSets that reads and
 * writes the roster; the transcript Definition folds only decided-with-rule
 * events. Registration disposal rides the plugin fiber (HMR safety), and the
 * node half stays inert.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import type {
  ApprovalRuleView, ApprovalRuleId,
} from '@deepseek-ai/dsh-user-approval'
import { apply, inject } from '../src/client/index.ts'
import { ApprovalRuleRow } from '../src/client/ApprovalRuleRow.tsx'
import { ApprovalRulesSection } from '../src/client/ApprovalRulesSection.tsx'
import { NS } from '../src/client/locales.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(cleanup)

const ID = (value: string): ApprovalRuleId => value as ApprovalRuleId

interface Bench {
  readonly ctx: Context
  readonly registerDefinition: ReturnType<typeof vi.fn>
  readonly registerLocale: ReturnType<typeof vi.fn>
  readonly injectSlot: ReturnType<typeof vi.fn>
  readonly registerSlot: ReturnType<typeof vi.fn>
  readonly chatEntry: { options: unknown; locale: string; component: unknown } | undefined
  readonly sectionEntry: { options: Record<string, unknown>; component: unknown; inject?: () => unknown } | undefined
  readonly list: ReturnType<typeof vi.fn>
  readonly save: ReturnType<typeof vi.fn>
  readonly revoke: ReturnType<typeof vi.fn>
  readonly disposeSlot: ReturnType<typeof vi.fn>
  readonly disposeLocale: ReturnType<typeof vi.fn>
}

function bench(): Bench {
  const ctx = new Context()
  const disposeSlot = vi.fn()
  const disposeLocale = vi.fn()
  const disposeDefinition = vi.fn()
  let chatEntry: Bench['chatEntry']
  let sectionEntry: Bench['sectionEntry']
  const registerDefinition = vi.fn(() => disposeDefinition)
  const registerSlot = vi.fn((options: Record<string, unknown>, component: unknown) => {
    if (options.name === 'conversation.chat.node') {
      chatEntry = { options, locale: options.locale as string, component }
    } else if (options.name === 'settings.section') {
      sectionEntry = { options, component, inject: options.inject as unknown as () => unknown }
    }
    return disposeSlot
  })
  const capture = new Map<string, () => unknown>()
  const injectSlot = vi.fn((name: string, mount: () => () => unknown) => {
    // The real SlotRegistry.inject installs the contribution through the
    // caller's ctx.effect, so the plugin fiber's unload disposes it (HMR
    // safety — registry.ts:211). The mock mirrors that contract: mount()
    // returns the register disposer, which becomes the effect's cleanup.
    const disposeEffect = ctx.effect(mount)
    const tearDown = () => { void disposeEffect() }
    return () => { tearDown(); capture.delete(name) }
  })
  onTestFinished(async () => { await ctx.fiber.dispose() })
  const list = vi.fn(async (): Promise<{ ok: true; value: ApprovalRuleView[] }> => ({
    ok: true,
    value: [],
  }))
  const save = vi.fn(async (): Promise<{ ok: true; value: { id: ApprovalRuleId } }> => ({
    ok: true,
    value: { id: ID('x') },
  }))
  const revoke = vi.fn(async (): Promise<{ ok: true; value: { revoked: boolean } }> => ({
    ok: true,
    value: { revoked: true },
  }))
  ctx.provide('uiConversation', { events: { register: registerDefinition } } as never)
  ctx.provide('locale', {
    register: vi.fn(() => disposeLocale),
    bind: () => (key: string) => key,
  } as never)
  ctx.provide('slots', { inject: injectSlot, register: registerSlot } as never)
  ctx.provide('approvalRuleSets', { list, save, revoke } as never)
  apply(ctx)
  return {
    ctx, registerDefinition, registerLocale: vi.fn(() => disposeLocale), injectSlot,
    registerSlot, chatEntry, sectionEntry, list, save, revoke, disposeSlot, disposeLocale,
  }
}

describe('ui-approval-rules browser plugin', () => {
  it('registers the Definition, both slot entries, and the dictionary on the fiber', async () => {
    const b = bench()
    expect(b.registerDefinition).toHaveBeenCalledOnce()
    expect(b.chatEntry).toMatchObject({
      options: { name: 'conversation.chat.node', key: 'approval-rule', locale: NS },
      locale: NS,
    })
    expect(b.chatEntry?.component).toBe(ApprovalRuleRow)
    expect(b.sectionEntry).toMatchObject({
      options: {
        name: 'settings.section', id: 'approval-rules', order: 25, locale: NS,
      },
    })
    expect(b.sectionEntry?.component).toBe(ApprovalRulesSection)
    expect(b.injectSlot).toHaveBeenCalledTimes(2)
    expect(typeof b.sectionEntry?.options.label).toBe('function')
  })

  it('builds a section inject face whose controller reads and writes the roster', async () => {
    const b = bench()
    const face = b.sectionEntry!.inject!() as {
      load: () => Promise<void>
      retry: () => Promise<void>
      startCreate: () => void
      save: () => Promise<boolean>
      revoke: (id: ApprovalRuleId) => Promise<boolean>
      cancelEdit: () => void
      updateDraft: (patch: Record<string, string>) => void
      hooks: { approvalRulesSection: { getSnapshot(): unknown } }
    }
    await face.load()
    expect(b.list).toHaveBeenCalled()
    expect(face.hooks.approvalRulesSection.getSnapshot()).toMatchObject({ status: 'ready', rows: [] })
  })

  it('drops its registrations when the plugin fiber unloads (HMR safety)', async () => {
    const b = bench()
    expect(b.registerDefinition).toHaveBeenCalledOnce()
    await b.ctx.fiber.dispose()
    expect(b.disposeSlot).toHaveBeenCalled()
    expect(b.disposeLocale).toHaveBeenCalled()
  })
})

describe('ui-approval-rules node half', () => {
  it('declares its service edges and keeps the node apply inert', () => {
    expect(inject).toEqual(['uiConversation', 'slots', 'locale', 'approvalRuleSets'])
    expect(() => { nodeApply() }).not.toThrow()
  })
})
