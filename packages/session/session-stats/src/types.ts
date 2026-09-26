/**
 * Pure types of the session-stats domain: the ONE home of the `sessionStats`
 * projection-key declaration, free of this package's host-side value imports
 * (cordis context, zod, the llm chunk predicate). Two namespace projections
 * serve it — `./types` for host consumers, `./client` for client aggregates —
 * with zero content duplication.
 *
 * @module @deepseek-ai/dsh-session-stats/types
 */

// Marks this file a module so the declaration below AUGMENTS the projection
// table instead of declaring an ambient module.
export {}

/**
 * Whole-log conversation figures, independent of how much history a client
 * has paged in. Counts and wall times all fold from the complete durable log;
 * every field is 0 until its first contributing event lands. Field names
 * mirror the client window fold so an assembly without this unit can fall
 * back to it wholesale.
 */
export interface SessionStatsProjection {
  /** Distinct turns carrying at least one closed step (`step/end`); rejected or empty turns are uncounted. */
  turns: number
  /** Closed steps (`step/end` events) — completed, failed, and cancelled steps alike. */
  steps: number
  /** Summed model wall time (`step/start` → `assistant/message`) over steps that assembled a message. */
  llmMs: number
  /** Summed tool wall time over `tool/call` → `tool/result` pairs matched by callId. */
  toolMs: number
  /** Summed first-token latency (`step/start` → first non-empty delta chunk) over `ttftSteps`. */
  ttftMs: number
  /** Steps carrying a recorded first token. */
  ttftSteps: number
  /** Summed decode wall time (first token → `assistant/message`) over steps that also report output tokens. */
  decodeMs: number
  /** Summed provider output tokens over the same decode-timed steps. */
  decodeTokens: number
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Whole-log turn/step counts and wall times; see {@link SessionStatsProjection}. */
    sessionStats: SessionStatsProjection
    /** Recent per-route model-call latencies; see {@link ModelLatencyProjection}. */
    modelLatency: ModelLatencyProjection
  }
}

/** One model call's observed latency sample. */
export interface LatencySample {
  /** Wall-clock moment of the settling message (durable event time, epoch ms). */
  at: number
  /** Model call latency (`step/start` → `assistant/message`), ms. */
  ms: number
  /** First-token latency, ms, clamped to `ms`; absent without a first-token record. */
  ttftMs?: number | undefined
}

/** Recent latency samples of one billed provider/model route. */
export interface ModelLatencyRoute {
  /** Provider of the settling message's source. */
  provider: string
  /** Model of the settling message's source. */
  model: string
  /** Samples in oldest-first order, bounded to the fold's retention. */
  samples: readonly LatencySample[]
}

/**
 * Recent model-call latencies by route, bounded to the newest samples so a
 * display can average any recent window without replaying the log. Samples
 * exist only for calls that ran: an idle model contributes nothing, and the
 * timestamps ride the durable log, so windowing at display time changes no
 * fold.
 */
export interface ModelLatencyProjection {
  /** Routes in first-sampled order. */
  routes: readonly ModelLatencyRoute[]
}
