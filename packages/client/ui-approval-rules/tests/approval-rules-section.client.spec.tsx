// @vitest-environment jsdom
/**
 * The approval-rules Settings section on a real controller with a fake
 * approvalRuleSets service: loading, empty, failed-read, failed-write,
 * refresh-error, and add/edit/revoke flows each render their keyed lines and
 * drive the write verbs. Every assertion reads user-visible copy through the
 * `approval.rules` zh dictionary, not internals.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ApprovalRuleId, ApprovalRuleView } from '@deepseek-ai/dsh-user-approval'
import { ApprovalRulesSectionController } from '../src/client/approval-rules-store.ts'
import {
  ApprovalRulesSection, type ApprovalRulesSectionInjected,
} from '../src/client/ApprovalRulesSection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

// jsdom leaves <html lang=""> empty; the locale plugin sets it in production
// (locale/src/client/index.ts:152), and every expiry render reads it.
document.documentElement.lang = 'zh-CN'

const ID = (value: string): ApprovalRuleId => value as ApprovalRuleId
const t = makeTranslate(zh, commonZh)

function rule(name: string, tool: string, effect: 'allow' | 'deny' = 'allow', expiresAt?: string): ApprovalRuleView {
  return {
    id: ID(name),
    record: { name, tool, effect, ...(expiresAt === undefined ? {} : { expiresAt }) },
  }
}

interface SectionBench {
  readonly controller: ApprovalRulesSectionController
  readonly props: () => ApprovalRulesSectionPropsLike
  rerender: () => void
}

type ApprovalRulesSectionPropsLike = Parameters<typeof ApprovalRulesSection>[0]

function harness(service: {
  list: ReturnType<typeof vi.fn>
  save?: ReturnType<typeof vi.fn>
  revoke?: ReturnType<typeof vi.fn>
}): SectionBench {
  const controller = new ApprovalRulesSectionController({
    list: service.list,
    save: service.save ?? vi.fn(async (): Promise<{ ok: true; value: { id: ApprovalRuleId } }> => ({ ok: true, value: { id: ID('id') } })),
    revoke: service.revoke ?? vi.fn(async (): Promise<{ ok: true; value: { revoked: boolean } }> => ({ ok: true, value: { revoked: true } })),
  } as never)
  let rerender: () => void = () => {}
  const bench: SectionBench = {
    controller,
    props: (): ApprovalRulesSectionPropsLike => {
      const store = controller.store
      const injected: ApprovalRulesSectionInjected = {
        hooks: { approvalRulesSection: store },
        load: () => controller.load(),
        retry: () => controller.retry(),
        startCreate: () => controller.startCreate(),
        startEdit: (id) => controller.startEdit(id),
        cancelEdit: () => controller.cancelEdit(),
        updateDraft: (patch) => { controller.updateDraft(patch) },
        save: () => controller.save(),
        revoke: (id) => controller.revoke(id),
        dismissError: () => controller.dismissError(),
      }
      return {
        // The store is a bare observable (no selector hook — hook synthesis
        // is ui-renderer's); bindSnapshotSelector assembles the production
        // renderer's selector hook over it (agent-preset precedent).
        useApprovalRulesSection: bindSnapshotSelector(store),
        ...injected,
        t,
      } as unknown as ApprovalRulesSectionPropsLike
    },
    rerender,
  }
  return bench
}

describe('approval-rules Settings section copy', () => {
  it('shows the loading marker before the first roster read settles, then ready', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const service = { list: vi.fn(() => gate.then(() => ({ ok: true as const, value: [] }))) }
    const b = harness(service)
    const load = b.controller.load()
    const { rerender } = render(<ApprovalRulesSection {...b.props()} />)
    expect(screen.getByText('正在加载规则…')).toBeTruthy()
    release()
    await load
    rerender(<ApprovalRulesSection {...b.props()} />)
    expect(screen.getByText('暂无记住的规则')).toBeTruthy()
  })

  it('renders the roster, a deny rule, expiry copy, and revoke, and opens the edit form', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [
        rule('a', 'write_file', 'allow', '2027-01-01T00:00:00.000Z'),
        rule('b', 'read_file', 'deny'),
      ] })) as ReturnType<typeof vi.fn>,
    }
    const b = harness(service)
    await b.controller.load()
    render(<ApprovalRulesSection {...b.props()} />)
    expect(screen.getByText('write_file', { selector: '[data-approval-rule-row] *' })).toBeTruthy()
    expect(screen.getAllByText('允许').length).toBeGreaterThan(0)
    expect(screen.getByText('拒绝')).toBeTruthy()
    expect(screen.getByText('永不过期')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: '撤销' })[1]!)
    expect(b.controller.store.getSnapshot().failedAction).toBe('revoke')
  })

  it('surfaces the failed-read line and retries', async () => {
    const service = { list: vi.fn(async () => { throw new Error('offline') }) }
    const b = harness(service)
    render(<ApprovalRulesSection {...b.props()} />)
    await waitFor(() => { expect(screen.getByText('无法读取规则')).toBeTruthy() })
    // The section auto-loads on mount; swap the service so the retry reads a row.
    service.list.mockImplementation(async () => ({ ok: true as const, value: [rule('a', 'write_file')] }) as never)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(screen.queryByText('无法读取规则')).toBeNull() })
    expect(screen.getByText('write_file', { selector: '[data-approval-rule-row] *' })).toBeTruthy()
  })

  it('surfaces the keyed write-failure line and dismisses it', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [] })),
      save: vi.fn(async (): Promise<never> => { throw new Error('denied') }),
    }
    const b = harness(service)
    await b.controller.load()
    render(<ApprovalRulesSection {...b.props()} />)
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    act(() => { b.controller.updateDraft({ name: 'New', tool: 'cmd' }) })
    void b.controller.save()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('无法保存规则')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByText('无法保存规则')).toBeNull()
  })

  it('keeps rows under the refresh-error notice after a landed save whose re-read fails', async () => {
    let calls = 0
    const service = {
      list: vi.fn(async () => {
        calls += 1
        if (calls >= 2) throw new Error('stale')
        return { ok: true as const, value: [rule('a', 'write_file')] }
      }),
    }
    const b = harness(service)
    render(<ApprovalRulesSection {...b.props()} />)
    await act(async () => { await b.controller.load() })
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    act(() => { b.controller.updateDraft({ name: 'New', tool: 'cmd' }) })
    void b.controller.save()
    await waitFor(() => { expect(b.controller.store.getSnapshot().status).toBe('refresh-error') })
    expect(screen.getByText('已保存，但无法刷新规则列表。')).toBeTruthy()
    expect(screen.getByText('write_file', { selector: '[data-approval-rule-row] *' })).toBeTruthy()
  })

  it('renders write-error with a revoke action key and dismisses it', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [rule('a', 'write_file')] })),
      revoke: vi.fn(async (): Promise<never> => { throw new Error('nope') }),
    }
    const b = harness(service)
    // Let the component's own useEffect load the roster, then fail a revoke.
    render(<ApprovalRulesSection {...b.props()} />)
    await waitFor(() => { expect(b.controller.store.getSnapshot().status).toBe('ready') })
    await act(async () => {
      await b.controller.revoke(ID('a')).catch(() => {})
    })
    // The component re-renders from the store change; wait for the write-error copy.
    await waitFor(() => { expect(screen.getByText('无法撤销规则')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByText('无法撤销规则')).toBeNull()
  })

  it('renders the refresh-error banner after save re-read failure', async () => {
    let calls = 0
    const service = {
      list: vi.fn(async () => {
        calls += 1
        if (calls >= 2) throw new Error('stale')
        return { ok: true as const, value: [rule('a', 'write_file')] }
      }),
    }
    const b = harness(service)
    render(<ApprovalRulesSection {...b.props()} />)
    await act(async () => { await b.controller.load() })
    expect(screen.getByText('write_file', { selector: '[data-approval-rule-row] *' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    act(() => { b.controller.updateDraft({ name: 'New', tool: 'cmd' }) })
    void b.controller.save()
    await waitFor(() => { expect(screen.getByText('已保存，但无法刷新规则列表。')).toBeTruthy() })
  })

  it('switches the effect selector to deny in the form', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [rule('a', 'write_file')] })),
    }
    const b = harness(service)
    await b.controller.load()
    render(<ApprovalRulesSection {...b.props()} />)
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    act(() => { b.controller.updateDraft({ name: 'New', tool: 'cmd' }) })
    const effect = screen.getByRole('combobox', { name: '效果' })
    fireEvent.change(effect, { target: { value: 'deny' } })
    expect(b.controller.store.getSnapshot().draft?.effect).toBe('deny')
  })

  it('clicks the edit button to open the form for a row', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [rule('a', 'write_file')] })),
    }
    const b = harness(service)
    await b.controller.load()
    render(<ApprovalRulesSection {...b.props()} />)
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(b.controller.store.getSnapshot().draft).toMatchObject({ name: 'a', tool: 'write_file' })
  })

  it('submits the form and closes it on success', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [rule('a', 'write_file')] })),
    }
    const b = harness(service)
    await b.controller.load()
    render(<ApprovalRulesSection {...b.props()} />)
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    act(() => { b.controller.updateDraft({ name: 'New', tool: 'cmd' }) })
    fireEvent.submit(screen.getByRole('form', { name: '规则表单' }))
    await waitFor(() => { expect(b.controller.store.getSnapshot().draft).toBeNull() })
  })

  it('lets the user type into every form field', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [] })),
    }
    const b = harness(service)
    render(<ApprovalRulesSection {...b.props()} />)
    await act(async () => { await b.controller.load() })
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    const nameInput = screen.getByRole('textbox', { name: '名称' })
    fireEvent.change(nameInput, { target: { value: 'My Rule' } })
    expect(b.controller.store.getSnapshot().draft?.name).toBe('My Rule')
    const toolInput = screen.getByRole('textbox', { name: '工具' })
    fireEvent.change(toolInput, { target: { value: 'shell' } })
    expect(b.controller.store.getSnapshot().draft?.tool).toBe('shell')
    // Effect select to deny, then back to allow (covers both ternary paths)
    const effectSelect = screen.getByRole('combobox', { name: '效果' })
    fireEvent.change(effectSelect, { target: { value: 'deny' } })
    expect(b.controller.store.getSnapshot().draft?.effect).toBe('deny')
    fireEvent.change(effectSelect, { target: { value: 'allow' } })
    expect(b.controller.store.getSnapshot().draft?.effect).toBe('allow')
    // Expiry date
    const expiryInput = screen.getByLabelText('到期时间')
    fireEvent.change(expiryInput, { target: { value: '2027-06-15' } })
    expect(b.controller.store.getSnapshot().draft?.expiresAt).toBe('2027-06-15')
    // Clear expiry
    fireEvent.change(expiryInput, { target: { value: '' } })
    expect(b.controller.store.getSnapshot().draft?.expiresAt).toBeUndefined()
  })

  it('stays in the form when save returns false (failed validation)', async () => {
    const service = {
      list: vi.fn(async () => ({ ok: true as const, value: [] })),
    }
    const b = harness(service)
    render(<ApprovalRulesSection {...b.props()} />)
    await act(async () => { await b.controller.load() })
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    // Submit with empty name/tool — save refuses, form stays open
    fireEvent.submit(screen.getByRole('form', { name: '规则表单' }))
    await act(async () => { await Promise.resolve() })
    expect(b.controller.store.getSnapshot().draft).not.toBeNull()
  })

  it('clicks retry in the refresh-error banner', async () => {
    let calls = 0
    const service = {
      list: vi.fn(async () => {
        calls += 1
        if (calls === 1) return { ok: true as const, value: [rule('a', 'write_file')] }
        throw new Error('stale')
      }),
    }
    const b = harness(service)
    render(<ApprovalRulesSection {...b.props()} />)
    await act(async () => { await b.controller.load() })
    fireEvent.click(screen.getByRole('button', { name: '添加规则' }))
    act(() => { b.controller.updateDraft({ name: 'New', tool: 'cmd' }) })
    void b.controller.save()
    await waitFor(() => { expect(screen.getByText('已保存，但无法刷新规则列表。')).toBeTruthy() })
    // Click the retry button within the refresh-error banner
    const retryButtons = screen.getAllByRole('button', { name: '重试' })
    const refreshRetry = retryButtons.find(btn => btn.closest('[data-approval-rules-section]')?.querySelector('p')?.textContent?.includes('已保存'))
    expect(refreshRetry).toBeTruthy()
    service.list.mockResolvedValueOnce({ ok: true as const, value: [rule('a', 'write_file'), rule('new', 'cmd')] } as never)
    fireEvent.click(refreshRetry!)
    await waitFor(() => { expect(screen.queryByText('已保存，但无法刷新规则列表。')).toBeNull() })
  })
})
