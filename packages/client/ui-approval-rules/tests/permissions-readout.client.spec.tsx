// @vitest-environment jsdom
/**
 * Item 12's effective-permission readout: sessionless chrome, the named
 * Session ready/error/pending projection states, the permission catalog join,
 * and the Retry control. Every assertion reads user-visible copy through the
 * `approval.rules` zh dictionary or the `data-permission-*` markers, not
 * internals.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { PermissionCatalog } from '@deepseek-ai/dsh-permission-presets'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  PermissionsReadout, displayPermission, selectSession, titleCase,
} from '../src/client/PermissionsReadout.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

document.documentElement.lang = 'zh-CN'
const t = makeTranslate(zh, {})

/** A fixture SessionListState-shaped read for the two `useSessions` reads. */
interface ListFixture {
  byId: Record<string, { retainedBy: { mainView?: number }; displayTitle: string }>
  projectionsBySession: Record<string, unknown>
}

interface ReadoutBench {
  props: () => {
    usePanelInfo: (sel: (info: { activePanelId: unknown }) => unknown) => unknown
    useSessions: (sel: (state: ListFixture) => unknown) => unknown
    readCatalog: () => Promise<PermissionCatalog>
    refreshProjects: (sessionId: SessionId) => void
    t: typeof t
  }
  setList: (partial: Partial<ListFixture>) => void
  refresh: ReturnType<typeof vi.fn>
}

function harness(list: ListFixture, readCatalog?: () => Promise<PermissionCatalog>): ReadoutBench {
  let fixture: ListFixture = list
  const refresh = vi.fn()
  return {
    setList: (partial) => { fixture = { ...fixture, ...partial } },
    refresh,
    props: () => ({
      usePanelInfo: sel => sel({ activePanelId: null }),
      useSessions: sel => sel(fixture),
      readCatalog: readCatalog ?? (() => Promise.resolve({
        options: [
          { value: 'research', name: 'research', description: 'R' },
          { value: 'custom', name: 'Custom', description: 'C' },
          { value: 'build-release', name: 'Build Release' },
        ],
        defaultOptions: [],
        defaultPreset: 'workspace-write',
      })),
      refreshProjects: refresh,
      t,
    }),
  }
}

const READY_LIST: ListFixture = {
  byId: { a: { retainedBy: { mainView: 2 }, displayTitle: 'Build' } },
  projectionsBySession: {
    a: {
      values: {
        sandboxMode: { mode: 'workspace-write', workspaceRoot: '/repo/work' },
        permissions: { currentValue: 'research' },
      },
      state: 'ready',
      error: null,
    },
  },
}

describe('displayPermission and titleCase', () => {
  it('renders a built-in value through its localized key', () => {
    expect(displayPermission('read-only', undefined, t)).toBe('仅可查看')
    expect(displayPermission('workspace-write', { options: [{ value: 'workspace-write', name: 'Workspace Write' }], defaultOptions: [], defaultPreset: 'x' }, t)).toBe('工作区内修改')
  })

  it('renders a matched catalog entry through its Host name', () => {
    expect(displayPermission('research', { options: [{ value: 'research', name: 'research' }], defaultOptions: [], defaultPreset: 'x' }, t)).toBe('Research')
    expect(displayPermission('build-release', { options: [{ value: 'build-release', name: 'Build Release' }], defaultOptions: [], defaultPreset: 'x' }, t)).toBe('Build Release')
  })

  it('title-cases an unmatched value and leaves non-kebab labels alone', () => {
    expect(displayPermission('custom', undefined, t)).toBe('Custom')
    expect(titleCase('build-release')).toBe('Build Release')
    expect(titleCase('Plain Label')).toBe('Plain Label')
  })
})

describe('selectSession', () => {
  it('returns the retained Session only when no panel holds the main area', () => {
    const rows = { a: { retainedBy: { mainView: 0 } }, b: { retainedBy: { mainView: 1 } } }
    expect(selectSession(false, rows)).toBe('b')
    expect(selectSession(true, rows)).toBeUndefined()
    expect(selectSession(false, {})).toBeUndefined()
  })

  it('treats a Session whose retainedBy.mainView is absent as not retained', () => {
    const rows = { a: { retainedBy: {} }, b: { retainedBy: { mainView: 2 } } }
    expect(selectSession(false, rows)).toBe('b')
  })
})

describe('PermissionsReadout', () => {
  it('renders session-less chrome when no Session is retained', async () => {
    const b = harness({ byId: {}, projectionsBySession: {} })
    render(<PermissionsReadout {...b.props()} />)
    await waitFor(() => { expect(screen.queryByText('未选择会话')).toBeTruthy() })
    // All three fields read the labelled deployment default.
    expect(screen.getAllByText('部署默认值').length).toBe(3)
    expect(screen.getByText('沙箱模式')).toBeTruthy()
    expect(screen.getByText('工作区根目录')).toBeTruthy()
    expect(screen.getByText('权限')).toBeTruthy()
  })

  it('renders the named Session ready projection with all three fields', async () => {
    const b = harness(READY_LIST)
    render(<PermissionsReadout {...b.props()} />)
    await waitFor(() => { expect(screen.getByText('会话：Build')).toBeTruthy() })
    expect(screen.getByText('工作区内修改')).toBeTruthy()
    expect(screen.getByText('/repo/work')).toBeTruthy()
    expect(screen.getByText('Research')).toBeTruthy()
  })

  it('shows pending.read while the projection read is in flight', async () => {
    const b = harness({
      ...READY_LIST,
      projectionsBySession: { a: { values: {}, state: 'loading', error: null } },
    })
    render(<PermissionsReadout {...b.props()} />)
    await waitFor(() => { expect(screen.getByText('加载中…')).toBeTruthy() })
  })

  it('renders error.read + a Retry on a failed read and re-issues the projection read', async () => {
    const b = harness({
      ...READY_LIST,
      projectionsBySession: { a: { values: {}, state: 'error', error: { code: 'gateway/internal', message: 'x' } } },
    })
    render(<PermissionsReadout {...b.props()} />)
    await waitFor(() => { expect(screen.getByText('无法读取有效值')).toBeTruthy() })
    const retry = screen.getByRole('button', { name: '重试' })
    fireEvent.click(retry)
    await waitFor(() => { expect(b.refresh).toHaveBeenCalledWith('a') })
  })

  it('renders deployment default for a named Session with null/absent sandbox fields', async () => {
    const b = harness({
      byId: { a: { retainedBy: { mainView: 1 }, displayTitle: 'Build' } },
      projectionsBySession: {
        a: { values: { sandboxMode: { mode: null, workspaceRoot: '' }, permissions: {} }, state: 'ready', error: null },
      },
    })
    render(<PermissionsReadout {...b.props()} />)
    await waitFor(() => { expect(screen.getByText('会话：Build')).toBeTruthy() })
    // Absent mode + empty root + absent currentValue all read deployment default.
    expect(screen.getAllByText('部署默认值').length).toBe(3)
  })

  it('propagates a catalog read failure by falling through to key/title-cased rendering', async () => {
    // The production inject rejects on a failed Remote read; the component
    // must keep rendering valid (never a raw token) labels.
    const b = harness(READY_LIST, () => Promise.reject(new Error('catalog down')))
    render(<PermissionsReadout {...b.props()} />)
    await waitFor(() => { expect(screen.getByText('会话：Build')).toBeTruthy() })
    // 'research' is not built-in and the catalog never loaded -> title-cased.
    expect(screen.getByText('Research')).toBeTruthy()
  })

  it('does not set catalog state after the readout unmounts (partial and failed reads)', async () => {
    // The `alive` guard in the catalog effect: once the section unmounts,
    // a late resolve or reject must not touch React state.
    let settle!: (value: PermissionCatalog) => void
    const gate = new Promise<PermissionCatalog>((resolve) => { settle = resolve })
    const late = harness(READY_LIST, () => gate)
    const { unmount } = render(<PermissionsReadout {...late.props()} />)
    unmount()
    settle({ options: [], defaultOptions: [], defaultPreset: 'x' })
    await gate
    // Failure side: mount again with a rejecting gate and unmount before it lands.
    let fail!: (reason: Error) => void
    const failingGate = new Promise<PermissionCatalog>((_resolve, reject) => { fail = reject })
    const failing = harness(READY_LIST, () => failingGate)
    const { unmount: unmountFailing } = render(<PermissionsReadout {...failing.props()} />)
    unmountFailing()
    fail(new Error('late reject'))
    await failingGate.catch(() => undefined)
  })
})
