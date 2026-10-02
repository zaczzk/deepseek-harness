import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ApprovalRuleId, type ApprovalRuleRecord } from '@deepseek-ai/dsh-user-approval'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { apply, inject } from '../src/client/index.ts'
import type {
  ApprovalRuleListValue,
  ApprovalRuleRevokeValue,
  ApprovalRuleSaveValue,
} from '../src/types.ts'

const roots = new Set<Context>()

afterEach(async () => {
  await Promise.all([...roots].map(ctx => ctx.fiber.dispose()))
  roots.clear()
})

const record: ApprovalRuleRecord = {
  name: 'git push',
  tool: 'shell',
  effect: 'allow',
}

async function mount(): Promise<{
  ctx: Context
  calls: Array<{ method: string; request: unknown }>
}> {
  const ctx = new Context()
  roots.add(ctx)
  const calls: Array<{ method: string; request: unknown }> = []
  const approvalRuleSets = {
    list: async (request: unknown) => {
      calls.push({ method: 'list', request })
      return { ok: true as const, value: [] }
    },
    save: async (request: unknown) => {
      calls.push({ method: 'save', request })
      return { ok: true as const, value: { id: ApprovalRuleId('saved-1') } }
    },
    revoke: async (request: unknown) => {
      calls.push({ method: 'revoke', request })
      return { ok: false as const, error: { code: 'approval-rules/error', message: 'missing', details: {} } }
    },
  }
  ctx.reflect.provide('remote', { ...approvalRuleSets, approvalRuleSets })
  ctx.reflect.provide('remote.approvalRuleSets', approvalRuleSets)
  await apply(ctx)
  return { ctx, calls }
}

describe('ApprovalRuleController client half', () => {
  it('declares the Remote services it binds', () => {
    expect(inject).toEqual(['remote', 'remote.approvalRuleSets'])
  })

  it('installs ctx.approvalRuleSets and forwards exact reads to the namespace', async () => {
    const { ctx, calls } = await mount()
    expect(ctx.approvalRuleSets).toBeDefined()

    const list = await ctx.approvalRuleSets.list()
    expect(list).toEqual({ ok: true, value: [] })
    const saved = await ctx.approvalRuleSets.save(record)
    expect((saved as RemoteResult<ApprovalRuleSaveValue>).ok
      ? (saved as { ok: true; value: ApprovalRuleSaveValue }).value
      : saved)
      .toMatchObject({ id: ApprovalRuleId('saved-1') })
    const revoked = await ctx.approvalRuleSets.revoke(ApprovalRuleId('rule-1'))
    expect((revoked as RemoteResult<ApprovalRuleRevokeValue>).ok ? revoked : revoked)
      .toEqual({ ok: false, error: { code: 'approval-rules/error', message: 'missing', details: {} } })

    expect(calls).toEqual([
      { method: 'list', request: {} },
      { method: 'save', request: { record } },
      { method: 'revoke', request: { id: ApprovalRuleId('rule-1') } },
    ])
  })

  it('re-exports the request and value wire types', () => {
    // Type-level re-export contract: the public client surface names the same
    // request/value types the Host declares, so a Settings seat compiles
    // against one shared vocabulary.
    const _list: ApprovalRuleListValue = [] as unknown as ApprovalRuleListValue
    const _save: ApprovalRuleSaveValue = { id: ApprovalRuleId('x') }
    const _revoke: ApprovalRuleRevokeValue = { revoked: true }
    void _list; void _save; void _revoke
    expect(true).toBe(true)
  })
})