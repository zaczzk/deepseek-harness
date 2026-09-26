// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import type { UsageLimit, UsageReport } from '../src/client/contract.ts'
import { en, zh } from '../src/client/locales.ts'

/** Display-time clock behind every latency window in this file. */
const NOW = Date.UTC(2026, 8, 25, 2, 10)

beforeEach(() => {
  // Windows fold at display time: pin that clock so no sample ever ages out.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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
  loadLimits?: () => Promise<UsageReport>
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
    loadLimits: input.loadLimits ?? (async () => ({ limits, state: 'ok' as const })),
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

  it('shows the current model latency for both windows and hides windows without calls', () => {
    const now = NOW
    const minute = 60_000
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0)]),
        tokenUsage: buckets(10, 0),
        modelSelection: { lastUsed: { provider: 'mock', model: 'a' }, next: null },
        modelLatency: {
          routes: [{
            provider: 'mock',
            model: 'a',
            samples: [
              { at: now - 2 * 60 * minute, ms: 9_900 },
              { at: now - 30 * minute, ms: 2_400 },
              { at: now - minute, ms: 1_200 },
            ],
          }],
        },
      },
    })
    // The trigger carries the 15-minute figure beside the session total.
    expect(view.getByRole('button', { name: /tok/ }).textContent).toContain('1.2s')
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('延迟 15 分钟')
    expect(panel.textContent).toContain('延迟 1 小时')
    expect(panel.textContent).toContain('1.8s')
  })

  it('shows no latency figure for an idle model or one with no window samples', () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0)]),
        tokenUsage: buckets(10, 0),
        modelSelection: { lastUsed: { provider: 'mock', model: 'b' }, next: null },
        modelLatency: {
          routes: [{ provider: 'mock', model: 'a', samples: [{ at: NOW, ms: 1_200 }] }],
        },
      },
    })
    expect(view.getByRole('button', { name: /tok/ }).textContent).toBe('10 tok')
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).not.toContain('延迟 15 分钟')
    expect(panel.textContent).not.toContain('延迟 1 小时')
  })

  it('shows the plan, resets, and compensation rows in their pinned order', async () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0)]),
        tokenUsage: buckets(10, 0),
        modelSelection: { lastUsed: { provider: 'mock', model: 'a' }, next: null },
        modelLatency: {
          routes: [{ provider: 'mock', model: 'a', samples: Array.from({ length: 6 }, () => ({ at: NOW, ms: 1_200 })) }],
        },
      },
      limits: [{ period: 'month', usedTokens: 12_751_091_709, limitTokens: 38_000_000_000 }],
      translate: tEn,
      loadLimits: async () => ({
        limits: [{ period: 'month', usedTokens: 12_751_091_709, limitTokens: 38_000_000_000 }],
        plan: {
          name: 'Pro',
          resetsAt: '2026-10-22 23:59:59',
          daysUntilReset: 27,
          burn: { dailyTokens: 2_104_075_691, observedSince: '2026-09-25T02:10:00.000Z', projectedDays: 12 },
        },
        credits: { usedTokens: 2_400, limitTokens: 0 },
        state: 'ok',
      }),
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    await vi.waitFor(() => {
      const text = panel.textContent ?? ''
      // Pinned order: Session … Month, Compensation, Plan, Resets, then routes.
      expect(text.indexOf('Compensation')).toBeGreaterThan(text.indexOf('Month'))
      expect(text.indexOf('Plan')).toBeGreaterThan(text.indexOf('Compensation'))
      expect(text.indexOf('Resets')).toBeGreaterThan(text.indexOf('Plan'))
      expect(text).toContain('2.4K tok')
      expect(text).toContain('Pro')
      expect(text).toContain('10-22 · ≈12d')
      expect(text).toContain('1.2s · p95 1.2s')
      expect(view.getByRole('button', { name: /tok/ }).textContent).toContain('34%')
    })
  })

  it('walks the latency ladder and reveals the copy affordance', async () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0)]),
        tokenUsage: buckets(10, 0),
        modelSelection: { lastUsed: { provider: 'mock', model: 'a' }, next: null },
        modelLatency: {
          routes: [{
            provider: 'mock',
            model: 'a',
            samples: Array.from({ length: 6 }, () => ({ at: Date.now(), ms: 1_200, ttftMs: 240 })),
          }],
        },
      },
      translate: tEn,
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    await vi.waitFor(() => {
      expect(panel.textContent).toContain('1.2s · p95 1.2s · ttft 240ms')
    })
    const copy = view.getAllByRole('button', { name: 'Copy value' })[0]!
    fireEvent.click(copy)
    expect(view.getAllByRole('button', { name: 'Copied' })).toHaveLength(1)
  })

  it('keeps provider rows dark on an expired session', async () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0)]),
        tokenUsage: buckets(10, 0),
      },
      limits: [{ period: 'month', usedTokens: 5, limitTokens: 10 }],
      translate: tEn,
      loadLimits: async () => ({
        limits: [{ period: 'month', usedTokens: 5, limitTokens: 10 }],
        plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27 },
        state: 'expired',
      }),
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    await vi.waitFor(() => {
      expect(panel.textContent).toContain('Sign in to the console to see account usage')
    })
    expect(panel.textContent).not.toContain('Month')
    expect(panel.textContent).not.toContain('Pro')
    expect(panel.textContent).not.toContain('Resets')
    expect(panel.textContent).not.toContain('Compensation')
  })

  it('shows the reset date alone until a burn figure exists', async () => {
    const view = mount({
      projections: {
        tokenUsageByModel: split([row('mock', 'a', 10, 0)]),
        tokenUsage: buckets(10, 0),
      },
      translate: tEn,
      loadLimits: async () => ({
        limits: [],
        plan: { name: 'Pro', resetsAt: '2026-10-22 23:59:59', daysUntilReset: 27 },
        state: 'ok',
      }),
    })
    fireEvent.click(view.getByRole('button', { name: /tok/ }))
    const panel = view.queryByRole('dialog')!
    await vi.waitFor(() => {
      expect(panel.textContent).toContain('10-22')
    })
    expect(panel.textContent).not.toContain('≈')
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
