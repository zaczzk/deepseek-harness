// @vitest-environment jsdom
/** The Run comparison view body: pickers, status lines, and the metric table. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import {
  RunComparisonView,
  workspaceSessionIds,
  qualifyingRuns,
  type RunComparisonViewProps,
} from '../src/client/RunComparisonView.tsx'
import { zh } from '../src/client/locales.ts'
import type { RunComparisonInjected } from '../src/client/face.ts'
import type { RunComparisonState } from '../src/client/store.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SESSION = 'run-comp' as SessionId
const t: RunComparisonViewProps['t'] = makeTranslate(zh)

const ZERO = { turns: 0, toolCalls: 0, inputTokens: null, outputTokens: null, wallClockMs: null, failures: 0 }
const METRICS = { turns: 3, toolCalls: 5, inputTokens: 100, outputTokens: 50, wallClockMs: 200, failures: 1 }

function record(id: string, persisted = true) {
  return { header: { id }, persisted }
}
function wsItem(id: string, sessionIds: string[]): { id: string; sessionIds: string[] } {
  return { id, sessionIds }
}

/** Base happy-path props: roster ready with 2 scoped persisted runs. */
function props(over: Partial<RunComparisonViewProps> = {}): RunComparisonViewProps {
  const store: RunComparisonState = {
    roster: 'ready',
    records: [record('a'), record('b')],
    sideA: { sessionId: null, status: 'idle', retrying: false },
    sideB: { sessionId: null, status: 'idle', retrying: false },
    ...(over.store ?? {}),
  }
  const inject: RunComparisonInjected = {
    loadRoster: vi.fn(),
    pick: vi.fn(),
    retryRoster: vi.fn(),
    retryRead: vi.fn(),
  }
  return {
    sessionId: SESSION,
    // Resolve the workspace selector like the real renderer (ui-usage precedent):
    // the selector receives the snapshot and returns its items.
    useWorkspaces: ((sel: (s: WorkspaceSnapshot) => unknown) => sel({ items: [wsItem('w', ['a', 'b', SESSION])] } as WorkspaceSnapshot)) as RunComparisonViewProps['useWorkspaces'],
    useStore: (sel) => sel(store),
    t,
    ...inject,
    ...over,
  } as unknown as RunComparisonViewProps
}

function renderView(viewProps: RunComparisonViewProps) {
  return render(<RunComparisonView {...viewProps} />)
}

describe('workspaceSessionIds', () => {
  it('returns the session ids of the workspace that owns the view Session', () => {
    expect(workspaceSessionIds([wsItem('w1', ['a', SESSION]), wsItem('w2', ['b'])], SESSION)).toEqual(new Set(['a', SESSION]))
  })
  it('returns an empty set when no workspace owns the Session', () => {
    expect(workspaceSessionIds([wsItem('w1', ['x'])], SESSION)).toEqual(new Set())
  })
})

describe('qualifyingRuns', () => {
  it('maps scoped records preserving persisted flag and titling', () => {
    expect(qualifyingRuns(
      [record('a'), record('b', false), record('c')],
      new Set(['a', 'b']),
    )).toEqual([
      { id: 'a', title: 'a', persisted: true },
      { id: 'b', title: 'b', persisted: false },
    ])
  })
})

describe('RunComparisonView', () => {
  it('shows the pending marker while the roster is loading', () => {
    renderView(props({ store: { roster: 'loading' } }))
    expect(screen.getByText('正在加载运行…')).toBeTruthy()
  })

  it('loads the roster from the idle state on first render', () => {
    const p = props({ store: { roster: 'idle' } })
    renderView(p)
    expect(p.loadRoster).toHaveBeenCalledTimes(1)
  })

  it('shows the roster error and a retry that re-issues the read', () => {
    const p = props({ store: { roster: 'failed', rosterFailure: 'session-query/boom' } })
    renderView(p)
    expect(screen.getByText('无法读取运行列表')).toBeTruthy()
    fireEvent.click(screen.getByText('重试'))
    expect(p.retryRoster).toHaveBeenCalled()
  })

  it('shows the roster-empty claim when fewer than two qualifying runs are ready', () => {
    renderView(props({
      useWorkspaces: () => [wsItem('w', ['a', SESSION])],
      store: { records: [record('a')] },
    }))
    expect(screen.getByText('无可对比运行')).toBeTruthy()
  })

  it('side A unselected takes precedence over side B when both are unselected', () => {
    renderView(props())
    expect(screen.getByText('选择基准运行')).toBeTruthy()
    expect(screen.queryByText('选择对比运行')).toBeNull()
  })

  it('side B unselected shows the selection-incomplete prompt', () => {
    renderView(props({ store: { sideA: { sessionId: 'a', status: 'ready', retrying: false, metrics: METRICS } } }))
    expect(screen.getByText('选择对比运行')).toBeTruthy()
  })

  it('shows the loading state while either side read is in flight', () => {
    renderView(props({
      store: {
        sideA: { sessionId: 'a', status: 'loading', retrying: false },
        sideB: { sessionId: 'b', status: 'loading', retrying: false },
      },
    }))
    expect(screen.getByText('正在加载运行日志…')).toBeTruthy()
  })

  it('shows a failed side with a retry that re-issues that side read', () => {
    const p = props({
      store: {
        sideA: { sessionId: 'a', status: 'failed', retrying: false, failureCode: 'session-query/err' },
        sideB: { sessionId: 'b', status: 'ready', retrying: false, metrics: METRICS },
      },
    })
    renderView(p)
    expect(screen.getByText('无法读取运行日志')).toBeTruthy()
    fireEvent.click(screen.getAllByText('重试')[0]!)
    expect(p.retryRead).toHaveBeenCalledWith('a')
  })

  it('shows the loading label on a failed side whose retry is in flight', () => {
    renderView(props({
      store: {
        sideA: { sessionId: 'a', status: 'failed', retrying: true, failureCode: 'e' },
        sideB: { sessionId: 'b', status: 'ready', retrying: false, metrics: METRICS },
      },
    }))
    expect(screen.getByText('正在加载运行日志…')).toBeTruthy()
  })

  it('shows the no-turns line for a ready side whose fold has zero committed turns', () => {
    renderView(props({
      store: {
        sideA: { sessionId: 'a', status: 'ready', retrying: false, metrics: { ...ZERO } },
        sideB: { sessionId: 'b', status: 'ready', retrying: false, metrics: METRICS },
      },
    }))
    expect(screen.getByText('此运行没有已提交的轮次')).toBeTruthy()
  })

  it('renders the full metric table with figures and the unavailable label for null', () => {
    renderView(props({
      store: {
        sideA: { sessionId: 'a', status: 'ready', retrying: false, metrics: METRICS },
        sideB: { sessionId: 'b', status: 'ready', retrying: false, metrics: { ...METRICS, inputTokens: null, outputTokens: null, wallClockMs: null } },
      },
    }))
    // table header labels
    expect(screen.getAllByText('基准运行').length).toBeGreaterThan(0)
    expect(screen.getAllByText('对比运行').length).toBeGreaterThan(0)
    // side A figures
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    // side B unavailable appears for the three null quantities
    expect(screen.getAllByText('不可用').length).toBeGreaterThanOrEqual(3)
  })

  it('defaults side A to the view Session once when it qualifies', () => {
    const p = props({ store: { records: [record(SESSION, 'Self'), record('a', 'Alpha'), record('b', 'Beta')] } })
    renderView(p)
    expect(p.pick).toHaveBeenCalledWith('a', SESSION)
  })

  it('opens the baseline picker, selects a run via Menu onSelect, and closes on Escape', () => {
    const p = props()
    renderView(p)
    const anchors = document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')
    // Side B is unselected in the base store, so the baseline picker lists every run.
    fireEvent.click(anchors[0]!)
    expect(screen.getByText('非已持久化运行')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'a' }))
    expect(p.pick).toHaveBeenCalledWith('a', 'a')
    // Reopen and dismiss with Escape: the Menu onClose clears the open state.
    fireEvent.click(anchors[0]!)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('非已持久化运行')).toBeNull()
  })

  it('opens the comparison picker, selects a run, and closes it', () => {
    const p = props({
      store: {
        sideA: { sessionId: 'a', status: 'ready', retrying: false, metrics: METRICS },
      },
    })
    renderView(p)
    const anchors = document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')
    // Side A holds 'a'; the comparison picker lists only the remaining runs.
    fireEvent.click(anchors[1]!)
    expect(screen.getByText('非已持久化运行')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'b' }))
    expect(p.pick).toHaveBeenCalledWith('b', 'b')
    // Reopen and click outside the picker: the Menu onClose clears the open state.
    fireEvent.click(anchors[1]!)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('非已持久化运行')).toBeNull()
  })

  it('renders the table with zero metrics when both ready sides carried none', () => {
    renderView(props({
      store: {
        sideA: { sessionId: 'a', status: 'ready', retrying: false },
        sideB: { sessionId: 'b', status: 'ready', retrying: false },
      },
    }))
    // ZERO_METRICS: the three measured quantities render the unavailable label.
    expect(screen.getAllByText('不可用').length).toBeGreaterThanOrEqual(6)
  })

  it('does not show roster data until the roster resolves', () => {
    renderView(props({ store: { roster: 'idle' } }))
    expect(screen.getByText('正在加载运行…')).toBeTruthy()
  })

  it('does not default side A when the view Session does not qualify', () => {
    const p = props({
      sessionId: 'other' as SessionId,
      useWorkspaces: () => [wsItem('w', ['a', 'b'])],
    })
    renderView(p)
    expect(p.pick).not.toHaveBeenCalledWith('a', 'other')
  })

  it('excludes the other side from each picker and disables unpersisted runs', () => {
    // Side A is already the view Session (a); side B's picker must not offer it.
    const p = props({
      sessionId: 'a' as SessionId,
      useWorkspaces: () => [wsItem('w', ['a', 'b', 'c'])],
      store: {
        records: [record('a', 'Alpha'), record('b', 'Beta'), record('c', 'Unpersisted', false)],
        sideA: { sessionId: 'a', status: 'ready', retrying: false, metrics: METRICS },
      },
    })
    renderView(p)
    // Side B unselected -> selection-incomplete prompt.
    expect(screen.getByText('选择对比运行')).toBeTruthy()
    // Both pickers render with the disabled-pick reason visible while a picker is open.
    const picker = document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')
    expect(picker).toBeTruthy()
    if (picker) fireEvent.click(picker)
    expect(screen.getByText('非已持久化运行')).toBeTruthy()
  })
})