import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ModelTokenUsage, TokenUsageByModelProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { formatTokens } from '../src/client/format.ts'
import { en } from '../src/client/locales.ts'
import { bucketTotal, deriveUsageTotals, limitPercent } from '../src/client/usage.ts'

const CURRENT = SessionId('current')
const OTHER = SessionId('other')
const LEGACY = SessionId('legacy')
const SILENT = SessionId('silent')
const MISSING = SessionId('missing')

const row = (
  provider: string,
  model: string,
  uncachedInputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): ModelTokenUsage =>
  ({ provider, model, uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens })

const split = (models: ModelTokenUsage[]): TokenUsageByModelProjection => ({ models })
const buckets = (
  uncachedInputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): TokenUsageProjection => ({ uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens })

const list = (byId: SessionListState['byId']): SessionListState =>
  ({ ids: Object.keys(byId) as SessionId[], byId, phase: 'ready', projectionsBySession: {} })

const summary = (projectionValues: SessionSummary['projectionValues']): SessionSummary => ({
  id: OTHER,
  displayTitle: 'Other',
  running: false,
  retainedBy: {},
  blank: false,
  updatedAt: 0,
  ...projectionValues === undefined ? {} : { projectionValues },
})

const workspaces = (sessionIds: SessionId[]): WorkspaceSnapshot => ({
  items: sessionIds.length === 0 ? [] : [{
    workspaceId: 'workspace-1' as WorkspaceSnapshot['items'][number]['workspaceId'],
    path: '/work/project',
    title: 'project',
    sessionIds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
})

const derive = (
  current: { split: TokenUsageByModelProjection | undefined; totals: TokenUsageProjection | undefined },
  byId: SessionListState['byId'] = {},
  sessionIds: SessionId[] = [],
): ReturnType<typeof deriveUsageTotals> =>
  deriveUsageTotals(current, list(byId), workspaces(sessionIds), CURRENT)

describe('bucketTotal', () => {
  it('sums input, output, and cache traffic', () => {
    expect(bucketTotal(buckets(10, 4, 7, 2))).toBe(23)
    expect(bucketTotal(buckets(0, 0))).toBe(0)
  })
})

describe('deriveUsageTotals', () => {
  it('totals the route split and keeps only nonzero routes, most used first', () => {
    const usage = derive({
      split: split([row('mock', 'a', 10, 4), row('mock', 'b', 1_000, 0), row('mock', 'c', 0, 0)]),
      totals: buckets(999, 999),
    })
    expect(usage.session).toBe(1_014)
    expect(usage.models.map(model => model.model)).toEqual(['b', 'a'])
  })

  it('falls back to the assistant-only totals when no split is available', () => {
    const usage = derive({ split: undefined, totals: buckets(10, 4, 7, 2) })
    expect(usage.session).toBe(23)
    expect(usage.models).toEqual([])
  })

  it('reports no session total before any usage sample', () => {
    expect(derive({ split: undefined, totals: undefined }).session).toBeUndefined()
  })

  it('sums every session of the current workspace, preferring cached route splits', () => {
    const usage = derive(
      { split: split([row('mock', 'a', 10, 0)]), totals: buckets(10, 0) },
      {
        [OTHER]: summary({ tokenUsageByModel: split([row('mock', 'b', 5, 5)]) }),
        [LEGACY]: summary({ tokenUsage: buckets(3, 4) }),
        [SILENT]: summary(undefined),
      },
      [CURRENT, OTHER, LEGACY, SILENT, MISSING],
    )
    expect(usage.session).toBe(10)
    expect(usage.project).toBe(27)
  })

  it('counts a workspace whose current session has no usage yet', () => {
    const usage = derive(
      { split: undefined, totals: undefined },
      { [OTHER]: summary({ tokenUsage: buckets(3, 4) }) },
      [CURRENT, OTHER],
    )
    expect(usage.session).toBeUndefined()
    expect(usage.project).toBe(7)
  })

  it('omits the project figure outside a workspace', () => {
    expect(derive({ split: split([row('mock', 'a', 10, 0)]), totals: undefined }, {}, []).project).toBeUndefined()
  })
})

describe('limitPercent', () => {
  it('reports whole percent of a usable limit', () => {
    expect(limitPercent({ period: 'week', usedTokens: 42, limitTokens: 100 })).toBe(42)
  })

  it('refuses a limit no percentage can divide by', () => {
    expect(limitPercent({ period: 'month', usedTokens: 42, limitTokens: 0 })).toBeUndefined()
  })
})

describe('formatTokens', () => {
  const t = makeTranslate(en, commonEn) as Parameters<typeof formatTokens>[1]

  it.each([
    [517, '517'],
    [12_240, '12.2K'],
    [517_000, '517K'],
    [1_230_000, '1.2M'],
  ])('formats %d tokens as %s', (value, expected) => {
    expect(formatTokens(value, t)).toBe(expected)
  })
})
