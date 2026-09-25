// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn, zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ModelTokenUsage,
  TokenUsageByModelProjection,
  TokenUsageProjection,
} from '@deepseek-ai/dsh-token-meter/client'
import { UsageIndicator, type UsageIndicatorProps } from '../src/client/UsageIndicator.tsx'
import type { UsageLimit } from '../src/client/contract.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SID = SessionId('current')

const t = makeTranslate(zh, commonZh) as UsageIndicatorProps['t']
const tEn = makeTranslate(en, commonEn) as UsageIndicatorProps['t']

const row = (
  provider: string,
  model: string,
  uncachedInputTokens: number,
  outputTokens: number,
): ModelTokenUsage =>
  ({ provider, model, uncachedInputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 })
const split = (models: ModelTokenUsage[]): TokenUsageByModelProjection => ({ models })
const buckets = (uncachedInputTokens: number, outputTokens: number): TokenUsageProjection =>
  ({ uncachedInputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 })

interface MeterInput {
  projections?: Record<string, unknown>
  sessionIds?: SessionId[]
  limits?: readonly UsageLimit[]
  translate?: UsageIndicatorProps['t']
}

const emptyList: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
const noWorkspaces: WorkspaceSnapshot = {
  items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
}

function propsFor(input: MeterInput): UsageIndicatorProps {
  const workspaces: WorkspaceSnapshot = input.sessionIds === undefined
    ? noWorkspaces
    : {
      ...noWorkspaces,
      items: [{
        workspaceId: 'workspace-1' as WorkspaceSnapshot['items'][number]['workspaceId'],
        path: '/work/project',
        title: 'project',
        sessionIds: input.sessionIds,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    }
  const limits = input.limits ?? []
  // Only the seats this meter reads are real selector stubs; the rest of the
  // standard kit stays outside the meter's props surface.
  return {
    sessionId: SID,
    useProjection: (key: string) => (input.projections ?? {})[key],
    useSessions: (selector: (state: SessionListState) => unknown) => selector(emptyList),
    useWorkspaces: (selector: (state: WorkspaceSnapshot) => unknown) => selector(workspaces),
    loadLimits: () => Promise.resolve(limits),
    t: input.translate ?? t,
  } as UsageIndicatorProps
}

function mount(input: MeterInput = {}) {
  const view = render(<UsageIndicator {...propsFor(input)} />)
  return { ...view, update: (next: MeterInput) => { view.rerender(<UsageIndicator {...propsFor(next)} />) } }
}

describe('UsageIndicator', () => {
  it('renders nothing until the session bills a token', () => {
    expect(mount().container.textContent).toBe('')
    expect(mount({ projections: { tokenUsage: buckets(0, 0) } }).container.textContent).toBe('')
  })

  it('shows the session total and opens the scope rows on click', () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 1_000_000, 200_000)]),
        tokenUsage: buckets(1_000_000, 200_000),
      },
      sessionIds: [SID],
    })
    const trigger = view.getByRole('button', { name: '本会话已用 1.2M tok' })
    expect(view.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('会话')
    expect(panel.textContent).toContain('项目')
    expect(panel.textContent).toContain('1.2M tok')
  })

  it('renders the reported limits as percentages and skips unusable ones', async () => {
    const view = mount({
      projections: { tokenUsageByModel: split([row('mock', 'a', 10, 0)]), tokenUsage: buckets(10, 0) },
      limits: [
        { period: 'week', usedTokens: 42, limitTokens: 100 },
        { period: 'month', usedTokens: 17, limitTokens: 100 },
        { period: 'week', usedTokens: 1, limitTokens: 0 },
      ],
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    await vi.waitFor(() => {
      expect(panel.textContent).toContain('周')
    })
    expect(panel.textContent).toContain('月')
    expect(panel.textContent).toContain('42%')
    expect(panel.textContent).toContain('17%')
    expect(panel.getAttribute('aria-label')).toBe('代币用量')
  })

  it('applies warning and danger classes when limits exceed soft thresholds', async () => {
    const view = mount({
      projections: { tokenUsageByModel: split([row('mock', 'a', 10, 0)]), tokenUsage: buckets(10, 0) },
      limits: [
        { period: 'week', usedTokens: 85, limitTokens: 100 },
        { period: 'month', usedTokens: 95, limitTokens: 100 },
      ],
    })
    const trigger = view.getByRole('button', { name: /tok/ })
    fireEvent.click(trigger)
    const panel = view.queryByRole('dialog')!
    await vi.waitFor(() => {
      expect(panel.textContent).toContain('85%')
    })
    const fills = panel.querySelectorAll('span[role="img"] span')
    expect(fills[0]?.className).toContain('limitWarn')
    expect(fills[1]?.className).toContain('limitDanger')
    expect(trigger.className).toContain('triggerDanger')
  })

  it('lists billed routes and marks the current model', () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0), row('mock', 'b', 3, 0)]),
        tokenUsage: buckets(13, 0),
        modelSelection: { lastUsed: null, next: { provider: 'mock', model: 'b' } },
      },
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('mock/a')
    expect(panel.textContent).toContain('mock/b')
    const marked = [...panel.querySelectorAll('dt')]
      .filter(node => node.parentElement?.className.includes('rowCurrent'))
    expect(marked).toHaveLength(1)
    expect(marked[0]?.textContent).toContain('mock/b')
  })

  it('names the unattributed route and keeps every row unmarked without a selection', () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('', '', 5, 0), row('mock', 'a', 10, 0)]),
        tokenUsage: buckets(15, 0),
      },
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('未知')
    expect(panel.textContent).toContain('mock/a')
    expect([...panel.querySelectorAll('dt')]
      .filter(node => node.parentElement?.className.includes('rowCurrent'))).toHaveLength(0)
  })

  it('renders one plain segment and no route rows for a single route', () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0)]),
        modelSelection: { lastUsed: { provider: 'mock', model: 'a' }, next: null },
      },
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    expect(view.queryByRole('dialog')!.textContent).not.toContain('mock/a')
  })

  it('renders a single full-width segment without a route split', () => {
    const view = mount({ projections: { tokenUsage: buckets(10, 0) } })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    expect(view.queryByRole('dialog')!.textContent).toContain('10 tok')
  })

  it('ignores other keys and closes the panel on Escape and on a second click', () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 4, 0), row('mock', 'b', 6, 0)]),
        tokenUsage: buckets(10, 0),
      },
    })
    const trigger = view.getByRole('button', { name: /tok/ })
    fireEvent.click(trigger)
    expect(view.queryByRole('dialog')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(view.queryByRole('dialog')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    expect(view.queryByRole('dialog')).not.toBeNull()
    fireEvent.click(trigger)
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('drops the panel when usage disappears mid-read', () => {
    const view = mount({
      projections: { tokenUsageByModel: split([row('mock', 'a', 10, 0)]), tokenUsage: buckets(10, 0) },
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    expect(view.queryByRole('dialog')).not.toBeNull()
    view.update({})
    expect(view.container.textContent).toBe('')
  })

  it('reads the English dictionary', async () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 2_000, 0)]),
        modelSelection: { lastUsed: null, next: { provider: 'mock', model: 'a' } },
      },
      sessionIds: [SID],
      limits: [{ period: 'month', usedTokens: 5, limitTokens: 10 }],
      translate: tEn,
    })
    fireEvent.click(view.getByRole('button', { name: '2K tok used this session' }))
    const panel = view.queryByRole('dialog')!
    await vi.waitFor(() => {
      expect(panel.textContent).toContain('50%')
    })
    expect(panel.textContent).toContain('Session')
    expect(panel.textContent).toContain('Project')
    expect(panel.getAttribute('aria-label')).toBe('Token usage')
    expect(panel.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('50% of the Month limit')
  })
})
