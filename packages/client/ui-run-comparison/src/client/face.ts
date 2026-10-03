/**
 * The run-comparison tab's asynchronous half: reading the session-query
 * roster and each picked run's log through the `sessionQueries` Client
 * service, folding the six metrics, and writing outcomes through the store's
 * own actions. The view never awaits anything; it asks for the register and
 * this face drives the reads. Requests run in submission order, so a
 * settlement can never overwrite a newer request.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import type { ISessionQueries } from '@deepseek-ai/dsh-api-session-query-controller/client'
import type {
  SessionQueryListValue,
  SessionQueryReadValue,
} from '@deepseek-ai/dsh-api-session-query-controller/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import { foldMetrics } from './metrics.ts'
import type { RunComparisonStore } from './store.ts'

/** A remote outcome settled into the store's code-or-value shape. */
type RemoteOutcome<T> = { value: T; code?: undefined } | { value?: undefined; code: string }

/** Normalise a Remote result into the face's settled shape. */
function settle<T>(result: RemoteResult<T>, fallback: string): RemoteOutcome<T> {
  return result.ok ? { value: result.value } : { code: result.error.code ?? fallback }
}

/** The run-comparison tab's injected business face, as the view receives it. */
export interface RunComparisonInjected {
  /** Load the session-query roster into the store. */
  readonly loadRoster: () => void
  /**
   * Pick (or clear) one side's run and read its log.
   * @param side - which side.
   * @param sessionId - the picked run, or `null` to clear.
   */
  readonly pick: (side: 'a' | 'b', sessionId: string | null) => void
  /** Re-issue the failed roster read. */
  readonly retryRoster: () => void
  /** Re-issue one side's failed log read. */
  readonly retryRead: (side: 'a' | 'b') => void
}

/**
 * Bind the tab's face to the session-query Client service.
 * @param queries - the Client `sessionQueries` service.
 * @returns the Slot `inject` factory body: bound actions in, face out.
 */
export function registerFace(
  queries: ISessionQueries,
): (actions: BoundActions<RunComparisonStore>) => RunComparisonInjected {
  return (actions): RunComparisonInjected => {
    let rosterQueue: Promise<void> = Promise.resolve()
    // The last session each side asked to read, kept so a failed read's Retry
    // re-issues the exact same read — a failed pick clears the store's own
    // sessionId, so the face owns the re-read target.
    const picks: Record<'a' | 'b', string | null> = { a: null, b: null }
    const reads: Record<'a' | 'b', Promise<void>> = { a: Promise.resolve(), b: Promise.resolve() }

    const runRoster = (): void => {
      actions.rosterLoading()
      rosterQueue = rosterQueue.then(async () => {
        let result: RemoteResult<SessionQueryListValue>
        try {
          result = await queries.listSessions()
        } catch {
          actions.rosterFailed('gateway/internal')
          return
        }
        const outcome = settle(result, 'session-query/error')
        if (outcome.value !== undefined) actions.rosterLoaded(outcome.value as readonly SessionRecord[])
        else actions.rosterFailed(outcome.code)
      })
    }

    const readSide = (side: 'a' | 'b', sessionId: string): void => {
      actions.readLoading(side)
      reads[side] = reads[side].then(async () => {
        let result: RemoteResult<SessionQueryReadValue>
        try {
          result = await queries.readSession(sessionId as never)
        } catch {
          actions.setRetrying(side, false)
          actions.readFailed(side, 'gateway/internal')
          return
        }
        const outcome = settle(result, 'session-query/error')
        if (outcome.value !== undefined) {
          actions.readLoaded(side, outcome.value, foldMetrics(outcome.value))
        } else {
          actions.setRetrying(side, false)
          actions.readFailed(side, outcome.code)
        }
      })
    }

    return {
      loadRoster: runRoster,
      pick: (side, sessionId) => {
        picks[side] = sessionId
        actions.pick(side, sessionId)
        if (sessionId !== null) readSide(side, sessionId)
      },
      retryRoster: runRoster,
      retryRead: (side) => {
        const sessionId = picks[side]
        if (sessionId !== null) {
          actions.setRetrying(side, true)
          readSide(side, sessionId)
        }
      },
    }
  }
}