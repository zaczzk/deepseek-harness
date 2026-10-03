import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import ApprovalService, { ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { ApprovalRuleId } from '@deepseek-ai/dsh-user-approval/src/rules.ts'
import { ApprovalRuleStore } from '@deepseek-ai/dsh-user-approval/src/rules-store.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * Boot the approval service over a real storage/domain composition so the
 * remembered-rule store opens and can answer evaluation. Mirrors the
 * workspace package's own harness structure (storage → domain → service).
 */
async function mounted(): Promise<{ ctx: Context; dispose: () => Promise<void> }> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const fiber = await ctx.plugin(ApprovalService)
  return { ctx, dispose: () => fiber.dispose() }
}

/** A minimal Agent stand-in interior to an open turn, recording audit appends. */
function fakeAgent(): { agent: Agent; appended: Array<{ type: string; data: Record<string, unknown> }> } {
  const appended: Array<{ type: string; data: Record<string, unknown> }> = []
  const events: Array<{ type: string; data?: Record<string, unknown> }> = [
    { type: 'turn/start' },
    { type: 'user/message' },
  ]
  const agent = {
    session: {
      get seq() { return events.length },
      eventAt: (seq: number) => events[seq],
      append: (type: string, data: Record<string, unknown>) => {
        const event = { type, data }
        events.push(event)
        appended.push(event)
        return event as unknown as SessionEvent
      },
    },
  } as unknown as Agent
  return { agent, appended }
}

function requestOf(agent: Agent, toolName = 'web_search'): ApprovalRequest {
  return { agent, toolName }
}

const pastIso = () => new Date(Date.now() - 86_400_000).toISOString()
const futureIso = () => new Date(Date.now() + 86_400_000).toISOString()

describe('ApprovalRuleStore', () => {
  it('reads empty before the domain is open', () => {
    const ctx = new Context()
    const store = new ApprovalRuleStore(ctx)
    expect(store.available).toBe(false)
    expect(store.list()).toEqual([])
    expect(store.lookup('web_search')).toBeUndefined()
  })

  it('throws on save before the domain is open', async () => {
    const ctx = new Context()
    const store = new ApprovalRuleStore(ctx)
    await expect(store.save({ name: 'Never', tool: 'web_search', effect: 'allow' }))
      .rejects.toThrow('approvalRules store is not open')
  })

  it('throws on revoke before the domain is open', async () => {
    const ctx = new Context()
    const store = new ApprovalRuleStore(ctx)
    await expect(store.revoke(ApprovalRuleId('missing'))).rejects.toThrow('approvalRules store is not open')
  })

  it('pruneExpired returns when the domain is not open', async () => {
    const ctx = new Context()
    const store = new ApprovalRuleStore(ctx)
    const prune = ApprovalRuleStore.prototype as unknown as { pruneExpired(): Promise<void> }
    await expect(prune.pruneExpired.call(store)).resolves.toBeUndefined()
  })

  it('opens the approval_rules domain and exposes it as ctx.approvalRules', async () => {
    const { ctx, dispose } = await mounted()
    expect(ctx.approvalRules.available).toBe(true)
    expect(ctx.approvalRules.list()).toEqual([])
    await dispose()
  })

  it('saves and lists remembered rules, newest first by name', async () => {
    const { ctx, dispose } = await mounted()
    const b = await ctx.approvalRules.save({ name: 'Beta', tool: 'web_search', effect: 'allow' })
    const a = await ctx.approvalRules.save({ name: 'Alpha', tool: 'read_file', effect: 'deny' })
    const rows = ctx.approvalRules.list()
    expect(rows.map(r => r.record.name)).toEqual(['Alpha', 'Beta'])
    expect(rows.map(r => r.id)).toContain(a)
    expect(rows.map(r => r.id)).toContain(b)
    await dispose()
  })

  it('revokes a rule and reports whether it existed', async () => {
    const { ctx, dispose } = await mounted()
    const id = await ctx.approvalRules.save({ name: 'Temp', tool: 'web_search', effect: 'allow' })
    expect(await ctx.approvalRules.revoke(id)).toBe(true)
    expect(await ctx.approvalRules.revoke(id)).toBe(false)
    expect(ctx.approvalRules.list()).toEqual([])
    await dispose()
  })

  it('filters expired rules out of list() and lookup()', async () => {
    const { ctx, dispose } = await mounted()
    const expired = await ctx.approvalRules.save({
      name: 'Stale', tool: 'web_search', effect: 'allow', expiresAt: pastIso(),
    })
    await ctx.approvalRules.save({ name: 'Fresh', tool: 'web_search', effect: 'deny' })
    expect(ctx.approvalRules.list().map(r => r.id)).not.toContain(expired)
    expect(ctx.approvalRules.lookup('web_search')?.record.name).toBe('Fresh')
    await dispose()
  })

  it('skips an expired row that already sits in the table', async () => {
    // save() prunes expired rows on the write path, so to exercise the read-side
    // expiry filter while iterating we insert expired and live rows directly
    // through the already-open domain table (after the writes that would prune).
    const { ctx, dispose } = await mounted()
    await ctx.approvalRules.save({ name: 'Fresh', tool: 'read_file', effect: 'deny' })
    const raw = ctx.storageDomain.get('approval_rules')!.table('rules')
    await raw.put(ApprovalRuleId('stale-1'), {
      name: 'Stale direct', tool: 'web_search', effect: 'allow', expiresAt: pastIso(),
    })
    await raw.put(ApprovalRuleId('live-1'), {
      name: 'Live direct', tool: 'web_search', effect: 'allow', expiresAt: futureIso(),
    })
    expect(ctx.approvalRules.list().map(r => r.record.name)).toEqual(['Fresh', 'Live direct'])
    expect(ctx.approvalRules.lookup('web_search')?.record.name).toBe('Live direct')
    await dispose()
  })

  it('lookup matches by tool name and returns the first stored rule', async () => {
    const { ctx, dispose } = await mounted()
    await ctx.approvalRules.save({ name: 'One', tool: 'web_search', effect: 'allow' })
    await ctx.approvalRules.save({ name: 'Two', tool: 'web_search', effect: 'deny' })
    await ctx.approvalRules.save({ name: 'Other', tool: 'read_file', effect: 'deny' })
    const match = ctx.approvalRules.lookup('web_search')
    expect(match?.record.name).toBe('One')
    expect(match?.id).toBeTruthy()
    expect(ctx.approvalRules.lookup('unknown')).toBeUndefined()
    await dispose()
  })

  it('prunes expired rules on the write path', async () => {
    const { ctx, dispose } = await mounted()
    await ctx.approvalRules.save({ name: 'Old', tool: 'web_search', effect: 'allow', expiresAt: pastIso() })
    await ctx.approvalRules.save({ name: 'New', tool: 'web_search', effect: 'allow', expiresAt: futureIso() })
    const rows = ctx.approvalRules.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.record.name).toBe('New')
    await dispose()
  })
})

describe('remembered-rule evaluation', () => {
  it('answers allow without asking and records the rule on both audit events', async () => {
    const { ctx, dispose } = await mounted()
    await ctx.approvalRules.save({ name: 'Search always', tool: 'web_search', effect: 'allow' })
    const { agent, appended } = fakeAgent()

    const outcome = await ctx.approval.request(requestOf(agent))

    expect(outcome).toBe('allowed-once')
    expect(appended.map(e => e.type)).toEqual(['approval/asked', 'approval/decided'])
    expect(appended[0]?.data['rule']).toMatchObject({ name: 'Search always' })
    expect(appended[1]?.data).toMatchObject({ outcome: 'allowed-once' })
    expect(appended[1]?.data['rule']).toMatchObject({ name: 'Search always' })
    await dispose()
  })

  it('answers deny and settles the outcome to rejected', async () => {
    const { ctx, dispose } = await mounted()
    await ctx.approvalRules.save({ name: 'Never echo', tool: 'echo', effect: 'deny' })
    const { agent, appended } = fakeAgent()

    const outcome = await ctx.approval.request(requestOf(agent, 'echo'))

    expect(outcome).toBe('rejected')
    expect(appended[1]?.data).toMatchObject({ outcome: 'rejected', rule: { name: 'Never echo' } })
    await dispose()
  })

  it('delegates to the answerer chain when no rule matches the tool', async () => {
    const { ctx, dispose } = await mounted()
    await ctx.approvalRules.save({ name: 'Search always', tool: 'web_search', effect: 'allow' })
    const { agent, appended } = fakeAgent()
    ctx.on('approval/request', () => Promise.resolve('allowed-once' as const))

    const outcome = await ctx.approval.request(requestOf(agent, 'uncovered'))

    expect(outcome).toBe('allowed-once')
    expect(appended[0]?.data['rule']).toBeUndefined()
    expect(appended[1]?.data['rule']).toBeUndefined()
    await dispose()
  })

  it('carries the rule expiry on the audit reference when the record has one', async () => {
    const { ctx, dispose } = await mounted()
    await ctx.approvalRules.save({
      name: 'Temporary', tool: 'web_search', effect: 'allow', expiresAt: futureIso(),
    })
    const { agent, appended } = fakeAgent()

    await ctx.approval.request(requestOf(agent))

    expect(appended[0]?.data['rule']).toMatchObject({ name: 'Temporary', expiresAt: expect.any(String) })
    expect(appended[1]?.data['rule']).toMatchObject({ name: 'Temporary', expiresAt: expect.any(String) })
    await dispose()
  })
})

describe('ApprovalRuleId brand', () => {
  it('brands an identical string so ids compare as branded', () => {
    const id = ApprovalRuleId('abc')
    expect(id).toBe('abc')
  })
})
