import { describe, expect, it, vi } from 'vitest'
import { ApprovalRulesSectionController } from '../src/client/approval-rules-store.ts'
import type { ApprovalRuleView, ApprovalRuleId } from '@deepseek-ai/dsh-user-approval'

function rule(id: string, name: string, tool: string, effect: 'allow' | 'deny' = 'allow', expiresAt?: string): ApprovalRuleView {
  return {
    id: id as ApprovalRuleId,
    record: { name, tool, effect, ...(expiresAt === undefined ? {} : { expiresAt }) },
  }
}

function fixture(rows: ApprovalRuleView[] = [rule('a', 'Save files', 'write_file')]) {
  const service = {
    list: vi.fn(async () => ({ ok: true as const, value: rows })),
    save: vi.fn(async () => ({ ok: true as const, value: { id: ID('new') } })),
    revoke: vi.fn(async () => ({ ok: true as const, value: { revoked: true } })),
  }
  const controller = new ApprovalRulesSectionController(service as never)
  return { service, controller, state: () => controller.store.getSnapshot() }
}

const ID = (value: string): ApprovalRuleId => value as ApprovalRuleId

describe('the approval-rule Settings controller', () => {
  it('loads the roster once for concurrent loads, settles ready, and keeps rows on a stale-backed read', async () => {
    const { controller, service, state } = fixture()
    await Promise.all([controller.load(), controller.load()])
    expect(service.list).toHaveBeenCalledOnce()
    expect(state()).toMatchObject({ status: 'ready', rows: [{ id: 'a', record: { name: 'Save files' } }], pending: false })
  })

  it('surfaces a failed read with the read-error state and empty roster', async () => {
    const { controller, service, state } = fixture()
    service.list.mockRejectedValueOnce(new Error('offline'))
    await controller.load()
    expect(state()).toMatchObject({ status: 'read-error', rows: [] })
    service.list.mockResolvedValueOnce({ ok: false, error: { message: 'refused' } } as never)
    await controller.retry()
    expect(state()).toMatchObject({ status: 'read-error', rows: [], pending: false })
  })

  it('holds the loading pending marker during a retry over no prior rows', async () => {
    const { controller, service, state } = fixture([])
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    service.list.mockImplementationOnce(() => gate.then(() => ({ ok: true as const, value: [] })))
    const pending = controller.retry()
    expect(state()).toMatchObject({ status: 'loading', pending: true })
    release()
    await pending
    expect(state().status).toBe('ready')
  })

  it('opens the create form with an empty draft and closes it via cancel', () => {
    const { controller, state } = fixture([])
    controller.startCreate()
    expect(state().draft).toEqual({ name: '', tool: '', effect: 'allow' })
    controller.updateDraft({ name: 'X', tool: 'y', effect: 'deny', expiresAt: '2027-01-01' })
    expect(state().draft).toMatchObject({ name: 'X', tool: 'y', effect: 'deny', expiresAt: '2027-01-01' })
    controller.cancelEdit()
    expect(state().draft).toBeNull()
  })

  it('opens the edit form prefilled and ignores an unknown id', async () => {
    const { controller, state } = fixture([rule('a', 'Save files', 'write_file', 'allow', '2027-01-01T00:00:00.000Z')])
    await controller.load()
    controller.startEdit(ID('a'))
    expect(state().draft).toMatchObject({ name: 'Save files', tool: 'write_file', effect: 'allow', expiresAt: '2027-01-01T00:00:00.000Z' })
    controller.startEdit(ID('nope'))
    expect(state().draft).toMatchObject({ name: 'Save files' })
  })

  it('saves a valid draft, re-reads the roster, and closes the form', async () => {
    const { controller, state } = fixture()
    controller.startCreate()
    controller.updateDraft({ name: 'New', tool: 'cmd' })
    expect(await controller.save()).toBe(true)
    expect(state()).toMatchObject({ draft: null, saving: false, failedAction: null, status: 'ready', rows: [{ id: 'a' }] })
  })

  it('refuses to save an invalid or absent draft without a write', async () => {
    const { controller, service, state } = fixture()
    expect(await controller.save()).toBe(false)
    service.save.mockClear()
    controller.startCreate()
    controller.updateDraft({ name: '', tool: '', effect: 'allow' })
    expect(await controller.save()).toBe(false)
    expect(service.save).not.toHaveBeenCalled()
    expect(state().saving).toBe(false)
  })

  it('surfaces a write failure with the keyed action and keeps the form open', async () => {
    const { controller, service, state } = fixture()
    controller.startCreate()
    controller.updateDraft({ name: 'New', tool: 'cmd' })
    service.save.mockRejectedValueOnce(new Error('denied'))
    expect(await controller.save()).toBe(false)
    expect(state()).toMatchObject({ status: 'write-error', saving: false, failedAction: 'save' })
    controller.dismissError()
    expect(state().failedAction).toBeNull()
  })

  it('keeps rows with the refresh-error state when a landed write re-read fails', async () => {
    const { controller, service, state } = fixture([rule('a', 'Save files', 'write_file')])
    await controller.load()
    controller.startCreate()
    controller.updateDraft({ name: 'New', tool: 'cmd' })
    service.list.mockRejectedValueOnce(new Error('stale'))
    expect(await controller.save()).toBe(true)
    expect(state()).toMatchObject({ status: 'refresh-error', rows: [{ id: 'a' }] })
  })

  it('revokes a rule, re-reads, and reports failures with the revoke action', async () => {
    const { controller, service, state } = fixture()
    expect(await controller.revoke(ID('a'))).toBe(true)
    expect(state()).toMatchObject({ status: 'ready', failedAction: null })
    service.revoke.mockRejectedValueOnce(new Error('nope'))
    expect(await controller.revoke(ID('a'))).toBe(false)
    expect(state()).toMatchObject({ status: 'write-error', failedAction: 'revoke' })
  })

  it('ignores a second write while one is in flight', async () => {
    const { controller, service } = fixture()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    service.save.mockClear()
    service.save.mockImplementationOnce(() => Promise.resolve({ ok: true as const, value: { id: ID('x') } }).then((v) => gate.then(() => v)) as never)
    controller.startCreate()
    controller.updateDraft({ name: 'New', tool: 'cmd' })
    const pending = controller.save()
    expect(await controller.save()).toBe(false)
    release()
    await pending
  })

  it('opens the create form while read-error, keeping the error status for the section', async () => {
    const { controller, service, state } = fixture([])
    service.list.mockRejectedValueOnce(new Error('offline'))
    await controller.load()
    controller.startCreate()
    expect(state()).toMatchObject({ status: 'read-error', draft: { name: '', tool: '', effect: 'allow' } })
  })

  it('opens the edit form for a row with no expiry (undefined path)', async () => {
    const { controller, state } = fixture([rule('b', 'List', 'ls', 'allow')])
    await controller.load()
    controller.startEdit(ID('b'))
    expect(state().draft).toMatchObject({ name: 'List', tool: 'ls' })
    expect(state().draft!.expiresAt).toBeUndefined()
  })

  it('ignores updateDraft while no form is open', () => {
    const { controller, state } = fixture()
    controller.updateDraft({ name: 'Ghost' })
    expect(state().draft).toBeNull()
  })

  it('applies a partial draft patch, leaving unmentioned fields unchanged', () => {
    const { controller, state } = fixture([])
    controller.startCreate()
    controller.updateDraft({ name: 'X', tool: 'y', effect: 'deny', expiresAt: '2027-06-01' })
    controller.updateDraft({ effect: 'allow' })
    expect(state().draft).toMatchObject({ name: 'X', tool: 'y', effect: 'allow', expiresAt: '2027-06-01' })
    controller.updateDraft({ expiresAt: undefined })
    expect(state().draft!.expiresAt).toBeUndefined()
  })

  it('saves a draft with an expiry date', async () => {
    const { controller, state } = fixture()
    controller.startCreate()
    controller.updateDraft({ name: 'Timed', tool: 'write_file', expiresAt: '2027-01-01' })
    expect(await controller.save()).toBe(true)
    expect(state().draft).toBeNull()
  })

  it('surfaces a !ok save result as a write error', async () => {
    const { controller, service, state } = fixture()
    controller.startCreate()
    controller.updateDraft({ name: 'New', tool: 'cmd' })
    service.save.mockResolvedValueOnce({ ok: false, error: { message: 'conflict' } } as never)
    expect(await controller.save()).toBe(false)
    expect(state()).toMatchObject({ status: 'write-error', failedAction: 'save' })
  })

  it('rejects a revoke while a write is in flight', async () => {
    const { controller, service } = fixture()
    let release!: () => void
    service.save.mockClear()
    const gate = new Promise<void>((resolve) => { release = resolve })
    service.save.mockImplementationOnce(() => gate.then(() => ({ ok: true as const, value: { id: ID('x') } })) as never)
    controller.startCreate()
    controller.updateDraft({ name: 'New', tool: 'cmd' })
    void controller.save()
    expect(await controller.revoke(ID('a'))).toBe(false)
    release()
  })

  it('surfaces a !ok revoke result as a write error', async () => {
    const { controller, service, state } = fixture()
    service.revoke.mockResolvedValueOnce({ ok: false, error: { message: 'gone' } } as never)
    expect(await controller.revoke(ID('a'))).toBe(false)
    expect(state()).toMatchObject({ status: 'write-error', failedAction: 'revoke' })
  })

  it('surfaces refresh-error when a revoke re-read fails', async () => {
    const { controller, service, state } = fixture([rule('a', 'Save files', 'write_file')])
    await controller.load()
    service.list.mockRejectedValueOnce(new Error('stale'))
    expect(await controller.revoke(ID('a'))).toBe(true)
    expect(state()).toMatchObject({ status: 'refresh-error', failedAction: null })
  })

  it('surfaces a non-Error thrown value as a read-error', async () => {
    const { controller, service, state } = fixture([])
    service.list.mockRejectedValueOnce('offline')
    await controller.load()
    expect(state()).toMatchObject({ status: 'read-error', rows: [] })
  })

  it('refuses to save a draft whose effect is neither allow nor deny', async () => {
    const { controller, state } = fixture()
    controller.startCreate()
    // Force an invalid effect through the store (the UI prevents this, but the
    // guard is a store-level defence). Must merge into the current snapshot.
    const snap = controller.store.getSnapshot()
    controller.store.set({ ...snap, draft: { name: 'Bad', tool: 'x', effect: 'invalid' as unknown as 'allow' } })
    expect(await controller.save()).toBe(false)
    expect(state().saving).toBe(false)
  })
})