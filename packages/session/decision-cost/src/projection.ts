/**
 * The `milestoneCost` projection unit: a pure fold of a Session's own
 * `project/milestone` events (item 8) and the same usage records token-meter
 * folds (`assistant/message` carrying a `TokenUsage`), attributing each
 * milestone the committed tokens of the turns from its own event sequence to
 * the next milestone's — or to the session end. A milestone whose interval
 * records no usage writes `null` (data missing), never a zero, because a zero
 * would read as a cost claim the fold cannot support.
 *
 * @module @deepseek-ai/dsh-decision-cost/projection
 */

import { z } from 'zod'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { MilestoneRowId, MilestoneCostProjection } from './types.ts'
import { brandMilestoneRow } from '@deepseek-ai/dsh-project-register/src/types.ts'

/** One folded milestone boundary: the token count committed into the log just before it, and whether its own interval has seen usage. */
interface MilestoneBoundary {
  /** The milestone's branded `M<n>` identity. */
  id: MilestoneRowId
  /** Cumulative tokens committed up to (not including) this milestone's interval. */
  tokenStart: number
  /** Whether any usage-bearing turn has landed in this milestone's interval yet. */
  usageSeen: boolean
}

/** Fold state: per-milestone boundaries plus a running commit-time token total. */
export interface MilestoneCostState {
  /** This Session's milestones in event order. */
  milestones: MilestoneBoundary[]
  /** Cumulative committed tokens over the whole log. */
  totalTokens: number
  /** Whether the open (latest) interval has seen a usage-bearing turn. */
  openUsageSeen: boolean
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    milestoneCost: MilestoneCostState
  }
}

const milestoneBoundarySchema = z.object({
  id: z.string().transform(id => brandMilestoneRow(id)),
  tokenStart: z.number().nonnegative(),
  usageSeen: z.boolean(),
}).strict()

const milestoneCostStateSchema = z.object({
  milestones: z.array(milestoneBoundarySchema),
  totalTokens: z.number().nonnegative(),
  openUsageSeen: z.boolean(),
}).strict()

/**
 * The committed tokens one usage record reports, summed across billed buckets
 * (input, output, cache reads, cache writes and reasoning). Exported for the
 * unit spec's full-bucket and decision-only regressions.
 * @param usage - one settlement's token usage record.
 * @returns the sum of every billed bucket, treating absent cache/reasoning buckets as zero.
 */
export function tokensOf(usage: TokenUsage): number {
  return usage.inputTokens
    + usage.outputTokens
    + (usage.cacheReadTokens ?? 0)
    + (usage.cacheWriteTokens ?? 0)
    + (usage.reasoningTokens ?? 0)
}

/**
 * The usage record an assistant settlement carries, if any — the same probe
 * token-meter folds. Exported for the unit spec's decision-only-turn and
 * no-usage regression.
 * @param event - one committed session event.
 * @returns the settlement's usage record when the event is an assistant message, else `undefined`.
 */
export function usageOf(event: SessionEvent): TokenUsage | undefined {
  return event.type === 'assistant/message' ? event.data.usage : undefined
}

/** The `milestoneCost` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const milestoneCostProjectionDefinition = {
  key: 'milestoneCost',
  stateVersion: 1,
  stateSchema: milestoneCostStateSchema,
  init: () => ({ milestones: [], totalTokens: 0, openUsageSeen: false }),
  apply: (state, event) => {
    switch (event.type) {
      case 'project/milestone': {
        // A new milestone opens a fresh interval; stamp the just-closed
        // boundary (when there is one) with whether ITS interval saw usage,
        // then start the new interval at the current total.
        const head = state.milestones.at(-1)
        const closed = head === undefined
          ? []
          : [...state.milestones.slice(0, -1), { ...head, usageSeen: state.openUsageSeen }]
        return {
          ...state,
          milestones: [...closed, { id: event.data.id, tokenStart: state.totalTokens, usageSeen: false }],
          openUsageSeen: false,
        }
      }
      case 'assistant/message': {
        const usage = usageOf(event)
        if (usage === undefined) return state
        return {
          ...state,
          totalTokens: state.totalTokens + tokensOf(usage),
          openUsageSeen: true,
        }
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema: z.record(z.string(), z.number().nonnegative().nullable()),
    view: (state): MilestoneCostProjection => {
      const figures: Record<string, number | null> = {}
      for (const [i, boundary] of state.milestones.entries()) {
        const open = i === state.milestones.length - 1
        // A milestone interval is data-missing (null) when no usage-bearing
        // turn landed in it — that includes the still-open latest interval
        // before its first usage. A closed milestone with usage figures the
        // committed-token delta to its successor's boundary (or the live
        // total for the open interval), so a figure grows as turns commit.
        const seen = open ? state.openUsageSeen : boundary.usageSeen
        const figure = !seen
          ? null
          : (state.milestones[i + 1]?.tokenStart ?? state.totalTokens) - boundary.tokenStart
        figures[boundary.id] = figure
      }
      return figures as MilestoneCostProjection
    },
  },
} satisfies ProjectionDefinition<'milestoneCost', MilestoneCostState>
