import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { ApprovalRuleId, type ApprovalRuleRecord } from '@deepseek-ai/dsh-user-approval'
import ApprovalRuleController from '../src/index.ts'
import type { ApprovalRuleListValue } from '../src/types.ts'

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

const record: ApprovalRuleRecord = {
  name: 'git push',
  tool: 'shell',
  effect: 'allow',
  expiresAt: '2099-01-01T00:00:00.000Z',
}

/** A live `ctx.approvalRules` store whose reads the spec drives synchronously. */
function store(overrides: {
  list?: () => unknown
  save?: (r: ApprovalRuleRecord) => Promise<unknown>
  revoke?: (id: unknown) => Promise<unknown>
} = {}) {
  return {
    list: overrides.list ?? (() => []),
    save: overrides.save ?? (async () => ApprovalRuleId('rule-1')),
    revoke: overrides.revoke ?? (async () => true),
    available: true,
    lookup: () => undefined,
  }
}

async function mount(st: ReturnType<typeof store> = store()): Promise<ApprovalRuleController> {
  const ctx = new Context()
  roots.push(ctx)
  ctx.provide('approvalRules', st as never)
  const controller = new ApprovalRuleController(ctx, {})
  return controller
}

function remoteCode(run: () => Promise<unknown>): Promise<string> {
  return run().then(
    () => Promise.reject(new Error('expected the Remote method to reject')),
    (error: unknown) => {
      const failure = remoteErrorOf(error)
      if (failure === undefined) throw error
      return failure.code
    },
  )
}

describe('ApprovalRuleController host face', () => {
  it('lists the unexpired remembered rule set, reusing the store rows', async () => {
    const controller = await mount(store({
      list: () => [{ id: ApprovalRuleId('rule-1'), record }],
    }))
    const rows = await controller.list({}) as ApprovalRuleListValue
    expect(rows).toEqual([{ id: ApprovalRuleId('rule-1'), record }])
  })

  it('saves a rule and returns its branded id', async () => {
    const controller = await mount(store({
      save: async () => ApprovalRuleId('saved-1'),
    }))
    expect(await controller.save({ record })).toEqual({ id: ApprovalRuleId('saved-1') })
  })

  it('revokes a rule and reports whether it existed', async () => {
    const controller = await mount(store({
      revoke: async () => true,
    }))
    expect(await controller.revoke({ id: ApprovalRuleId('rule-1') })).toEqual({ revoked: true })
  })

  it('maps a store throw onto the approval-rules/error Remote code', async () => {
    const controller = await mount(store({
      list: () => { throw new Error('approvalRules store is not open') },
    }))
    expect(await remoteCode(() => controller.list({}))).toBe('approval-rules/error')
  })

  it('maps a save and a revoke throw onto the error code with their method', async () => {
    const controller = await mount(store({
      save: async () => { throw new Error('write failed') },
      revoke: async () => { throw 'not-an-error' },
    }))
    expect(await remoteCode(() => controller.save({ record }))).toBe('approval-rules/error')
    expect(await remoteCode(() => controller.revoke({ id: ApprovalRuleId('rule-1') })))
      .toBe('approval-rules/error')
  })
})
