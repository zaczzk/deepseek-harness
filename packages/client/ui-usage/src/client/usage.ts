/**
 * Pure derivations behind the usage meter: scope totals from the live usage
 * projections and the shared session/workspace lists, and limit percentages
 * from provider-reported windows.
 */

import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ModelTokenUsage,
  TokenUsageByModelProjection,
  TokenUsageProjection,
} from '@deepseek-ai/dsh-token-meter/client'
import type { UsageLimit } from './contract.ts'

/** Session and project token totals behind the usage meter. */
export interface UsageTotals {
  /** Tokens billed to the current session; absent without a usage sample. */
  readonly session: number | undefined
  /** Tokens billed across the current session's workspace; absent outside a workspace. */
  readonly project: number | undefined
  /** Billed routes of the current session with a nonzero total, most tokens first. */
  readonly models: readonly ModelTokenUsage[]
}

/**
 * Sum one disjoint usage bucket set.
 * @param buckets - a route's or session's usage buckets.
 * @returns input plus output plus cache traffic.
 */
export function bucketTotal(buckets: TokenUsageProjection): number {
  return buckets.uncachedInputTokens + buckets.outputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens
}

/**
 * Tokens one list row's cached projections report, preferring the route split.
 * @param summary - a session-list row.
 * @returns its total tokens, or undefined when the row carries no usage value.
 */
function rowTotal(summary: SessionSummary | undefined): number | undefined {
  const values = summary?.projectionValues
  const split = values?.tokenUsageByModel
  if (split !== undefined) return split.models.reduce((total, row) => total + bucketTotal(row), 0)
  const totals = values?.tokenUsage
  return totals === undefined ? undefined : bucketTotal(totals)
}

/**
 * Derive the meter totals from the current session's live projections and the
 * shared lists. The project figure sums every session of the workspace the
 * current session belongs to, taking each other session's cached projection
 * values; rows without cached values contribute nothing.
 * @param current - the current session's live usage projections.
 * @param list - the session list carrying cached per-session projection values.
 * @param workspaces - the workspace snapshot identifying project membership.
 * @param sessionId - the current session.
 * @returns session and project totals plus the current session's billed routes.
 */
export function deriveUsageTotals(
  current: { split: TokenUsageByModelProjection | undefined; totals: TokenUsageProjection | undefined },
  list: SessionListState,
  workspaces: WorkspaceSnapshot,
  sessionId: SessionId,
): UsageTotals {
  const session = current.split !== undefined
    ? current.split.models.reduce((total, row) => total + bucketTotal(row), 0)
    : current.totals === undefined ? undefined : bucketTotal(current.totals)
  const models = (current.split?.models ?? [])
    .filter(row => bucketTotal(row) > 0)
    .sort((left, right) => bucketTotal(right) - bucketTotal(left))
  const workspace = workspaces.items.find(item => item.sessionIds.includes(sessionId))
  const contribution = (id: SessionId): number =>
    (id === sessionId ? session : rowTotal(list.byId[id])) ?? 0
  const project = workspace === undefined
    ? undefined
    : workspace.sessionIds.reduce((total, id) => total + contribution(id), 0)
  return { session, project, models }
}

/**
 * Consumed percentage of one provider-reported window.
 * @param limit - the reported usage window.
 * @returns whole percent, or undefined for a limit no percentage can divide by.
 */
export function limitPercent(limit: UsageLimit): number | undefined {
  return limit.limitTokens > 0 ? Math.round(limit.usedTokens * 100 / limit.limitTokens) : undefined
}
