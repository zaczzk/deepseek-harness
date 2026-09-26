/**
 * The `modelLatency` projection unit: a bounded per-route ring of model-call
 * latency samples, one per assembled assistant message.
 *
 * The fold mirrors `sessionStats`'s model wall time: `step/start` →
 * `assistant/message` of the same turn/step, so a cancelled or max-tokens step
 * that assembles no message contributes no sample and an idle model
 * contributes nothing at all. Samples carry the durable event time, so a
 * display averages any recent window at render time without moving the fold —
 * replay stays deterministic.
 *
 * @module @deepseek-ai/dsh-session-stats/latency-projection
 */

import { z } from 'zod'
import { assistantStreamFirstTokenTime } from '@deepseek-ai/dsh-llm'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
// Import for the `modelLatency` SessionProjectionStateMap key merge.
import type {} from './types.ts'
import type { LatencySample } from './types.ts'

/** Newest samples retained per route; older ones leave the ring. */
export const LATENCY_SAMPLE_LIMIT = 256

const sampleSchema = z.object({
  at: z.number().nonnegative(),
  ms: z.number().nonnegative(),
  ttftMs: z.number().nonnegative().optional(),
}).strict()

const routeSchema = z.object({
  provider: z.string(),
  model: z.string(),
  samples: z.array(sampleSchema),
}).strict()

const modelLatencySchema = z.object({ routes: z.array(routeSchema) }).strict()

const modelLatencyStateSchema = z.object({
  view: modelLatencySchema,
  openStep: z.object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    startTime: z.number().nonnegative(),
  }).nullable(),
}).strict()

type ModelLatencyState = z.infer<typeof modelLatencyStateSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    modelLatency: ModelLatencyState
  }
}

/**
 * Append one sample to its route's ring, opening the route on its first call.
 * @param routes - the rings so far, in first-sampled order.
 * @param provider - settling message's provider.
 * @param model - settling message's model.
 * @param sample - the appended latency sample.
 * @returns the next route list, with the sample's route bounded to the limit.
 */
function credit(
  routes: ModelLatencyState['view']['routes'],
  provider: string,
  model: string,
  sample: LatencySample,
): ModelLatencyState['view']['routes'] {
  const matched = routes.some(route => route.provider === provider && route.model === model)
  if (!matched) return [...routes, { provider, model, samples: [sample] }]
  return routes.map(route => route.provider === provider && route.model === model
    ? { ...route, samples: [...route.samples, sample].slice(-LATENCY_SAMPLE_LIMIT) }
    : route)
}

/** The `modelLatency` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const modelLatencyProjectionDefinition = {
  key: 'modelLatency',
  stateVersion: 2,
  stateSchema: modelLatencyStateSchema,
  init: (): ModelLatencyState => ({ view: { routes: [] }, openStep: null }),
  apply: (state, event) => {
    switch (event.type) {
      case 'step/start':
        return {
          ...state,
          openStep: { turn: event.data.turn, step: event.data.step, startTime: event.time },
        }
      case 'assistant/message': {
        const open = state.openStep
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state
        // One assembled message per step: closing the boundary means a
        // defensive duplicate cannot accrue twice.
        const ms = Math.max(0, event.time - open.startTime)
        // The first-token helper reports an absolute stamp; the sample keeps
        // a duration, clamped to the call it belongs to.
        const firstToken = assistantStreamFirstTokenTime(event.data.stream)
        const ttftMs = firstToken === undefined
          ? undefined
          : Math.min(Math.max(0, firstToken - open.startTime), ms)
        const sample: LatencySample = {
          at: event.time,
          ms,
          ...ttftMs === undefined ? {} : { ttftMs },
        }
        const { provider, model } = event.data.message.source
        return {
          ...state,
          openStep: null,
          view: { routes: credit(state.view.routes, provider, model, sample) },
        }
      }
      case 'step/end':
        return state.openStep === null ? state : { ...state, openStep: null }
      default:
        return state
    }
  },
  wire: {
    viewSchema: modelLatencySchema,
    view: state => state.view,
  },
} satisfies ProjectionDefinition<'modelLatency', ModelLatencyState>
