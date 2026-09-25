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

/**
 * Average model-call latency of one route inside a recent window.
 *
 * Only calls that ran contribute: samples exist per assembled message, so an
 * idle model dilutes nothing and a window without samples reports no average.
 * @param routes - the latency rings carried by the `modelLatency` projection.
 * @param provider - route provider (the model in use).
 * @param model - route model (the model in use).
 * @param now - display-time clock, epoch ms.
 * @param windowMs - window length behind `now`.
 * @returns average latency in ms, or undefined without in-window samples.
 */
export function windowLatency(
  routes: readonly { provider: string; model: string; samples: readonly { at: number; ms: number }[] }[] | undefined,
  provider: string | undefined,
  model: string | undefined,
  now: number,
  windowMs: number,
): number | undefined {
  if (routes === undefined || provider === undefined || model === undefined) return undefined
  const route = routes.find(candidate => candidate.provider === provider && candidate.model === model)
  const samples = route?.samples.filter(sample => sample.at >= now - windowMs) ?? []
  if (samples.length === 0) return undefined
  return Math.round(samples.reduce((total, sample) => total + sample.ms, 0) / samples.length)
}

/**
 * Tail (p95) model-call latency of one route inside a recent window.
 *
 * The tail reports "has it been really slow" where an average hides spikes;
 * fewer than five in-window calls is too small a set for a tail figure, so
 * this reports nothing and the row shows its average alone.
 * @param routes - the latency rings carried by the `modelLatency` projection.
 * @param provider - route provider (the model in use).
 * @param model - route model (the model in use).
 * @param now - display-time clock, epoch ms.
 * @param windowMs - window length behind `now`.
 * @returns nearest-rank p95 latency in ms, or undefined below five samples.
 */
export function windowLatencyP95(
  routes: readonly { provider: string; model: string; samples: readonly { at: number; ms: number }[] }[] | undefined,
  provider: string | undefined,
  model: string | undefined,
  now: number,
  windowMs: number,
): number | undefined {
  if (routes === undefined || provider === undefined || model === undefined) return undefined
  const route = routes.find(candidate => candidate.provider === provider && candidate.model === model)
  const samples = route?.samples.filter(sample => sample.at >= now - windowMs) ?? []
  if (samples.length < 5) return undefined
  const ordered = [...samples].map(sample => sample.ms).sort((a, b) => a - b)
  return ordered[Math.min(Math.max(Math.ceil(0.95 * ordered.length) - 1, 0), ordered.length - 1)]
}
