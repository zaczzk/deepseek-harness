/**
 * The run-comparison tab's own state: the session-query roster it read and
 * the two picked runs' read lifecycle and metric figures. Each read holds its
 * last successful value across a re-read, so the read's own lifecycle is the
 * only honest failed-read signal — mirrors the decisions tab. Requests run in
 * submission order, so a settlement can never overwrite a newer request.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { RunMetrics } from './metrics.ts'
import type { SessionQueryWireLogSnapshot } from '@deepseek-ai/dsh-api-session-query-controller/types'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'

/** One run side's pick and its log-read lifecycle. */
export interface RunSideState {
  /** Picked session id, or `null` while unselected. */
  sessionId: string | null
  /** Read phase of this side's log. */
  status: 'idle' | 'loading' | 'ready' | 'failed'
  /** Last successful fold, carried across a re-read. */
  metrics?: RunMetrics
  /** Raw snapshot of the last successful read, carried for the empty-turns check. */
  snapshot?: SessionQueryWireLogSnapshot
  /** Remote failure code of the last failed read. */
  failureCode?: string
  /** True while a retry re-issues the read. */
  retrying: boolean
}

/** Read phase of the roster list. */
export type RosterStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** The tab's complete state for one Session. */
export interface RunComparisonState {
  /** Session-query roster lifecycle. */
  roster: RosterStatus
  /** Roster records held from the last successful read, newest first. */
  records: readonly SessionRecord[]
  /** Remote failure code of the last failed roster read. */
  rosterFailure?: string
  /** Side A (baseline) state. */
  sideA: RunSideState
  /** Side B (comparison) state. */
  sideB: RunSideState
}

const idleSide = (): RunSideState => ({ sessionId: null, status: 'idle', retrying: false })

type RunComparisonActions = {
  /** @param draft - state. */
  rosterLoading: (draft: RunComparisonState) => void
  /** @param draft - state. @param records - the roster records. */
  rosterLoaded: (draft: RunComparisonState, records: readonly SessionRecord[]) => void
  /** @param draft - state. @param code - Remote failure code. */
  rosterFailed: (draft: RunComparisonState, code: string) => void
  /**
   * @param draft - state.
   * @param side - which side.
   * @param sessionId - the picked id, or `null` to clear.
   */
  pick: (draft: RunComparisonState, side: 'a' | 'b', sessionId: string | null) => void
  /** @param draft - state. @param side - which side. */
  readLoading: (draft: RunComparisonState, side: 'a' | 'b') => void
  /**
   * @param draft - state.
   * @param side - which side.
   * @param snapshot - the raw read snapshot.
   * @param metrics - the folded figures.
   */
  readLoaded: (draft: RunComparisonState, side: 'a' | 'b', snapshot: SessionQueryWireLogSnapshot, metrics: RunMetrics) => void
  /** @param draft - state. @param side - which side. @param code - Remote failure code. */
  readFailed: (draft: RunComparisonState, side: 'a' | 'b', code: string) => void
  /** @param draft - state. @param side - which side. @param retrying - in-flight marker. */
  setRetrying: (draft: RunComparisonState, side: 'a' | 'b', retrying: boolean) => void
}

/** The run-comparison store handle shared by the view registration. */
export type RunComparisonStore = EngineStoreHandle<RunComparisonState, RunComparisonActions>

/** The side's slice helpers. */
function sideOf(state: RunComparisonState, side: 'a' | 'b'): RunSideState {
  return side === 'a' ? state.sideA : state.sideB
}

/**
 * Declare the run-comparison store: one instance per Session, created by the
 * framework from the registration's shared handle.
 * @returns the store handle declared on the view registration.
 */
export function createRunComparisonStore(): RunComparisonStore {
  return defineStore({
    init: (): RunComparisonState => ({
      roster: 'idle',
      records: [],
      sideA: idleSide(),
      sideB: idleSide(),
    }),
    actions: {
      rosterLoading: (d) => {
        d.roster = 'loading'
        delete d.rosterFailure
      },
      rosterLoaded: (d, records: readonly SessionRecord[]) => {
        d.roster = 'ready'
        d.records = records
        delete d.rosterFailure
      },
      rosterFailed: (d, code: string) => {
        d.roster = 'failed'
        d.rosterFailure = code
      },
      pick: (d, side: 'a' | 'b', sessionId: string | null) => {
        const target = sideOf(d, side)
        target.sessionId = sessionId
        target.status = 'idle'
        target.retrying = false
        delete target.metrics
        delete target.snapshot
        delete target.failureCode
      },
      readLoading: (d, side: 'a' | 'b') => {
        const target = sideOf(d, side)
        target.status = 'loading'
        // Keep `retrying` across the load — the face sets it true only while a
        // retry re-read is in flight, and the read's settle clears it.
        delete target.failureCode
      },
      readLoaded: (d, side: 'a' | 'b', snapshot: SessionQueryWireLogSnapshot, metrics: RunMetrics) => {
        const target = sideOf(d, side)
        target.status = 'ready'
        target.snapshot = snapshot
        target.metrics = metrics
        target.retrying = false
        delete target.failureCode
      },
      readFailed: (d, side: 'a' | 'b', code: string) => {
        const target = sideOf(d, side)
        target.status = 'failed'
        target.failureCode = code
        target.retrying = false
      },
      setRetrying: (d, side: 'a' | 'b', retrying: boolean) => {
        sideOf(d, side).retrying = retrying
      },
    },
  })
}