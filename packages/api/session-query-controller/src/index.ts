/**
 * Host session-query Remote owner: exposes the domain package's exact reads,
 * traces, and filters to browsers over the generated `sessionQueries`
 * namespace. The controller is a thin seam over `ctx.sessionQuery` — it
 * reuses the domain's wire records and translates the domain's typed
 * failures onto the Remote error channel so a browser seat renders the same
 * `SessionQueryError.code` it would on the Host. It owns no query state:
 * the domain package remains the single owner of corpus reads and replay.
 *
 * @module @deepseek-ai/dsh-api-session-query-controller
 */

import { Context } from '@deepseek-ai/cordis'
import type { SessionLogSnapshot } from '@deepseek-ai/dsh-session-query'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-session-query'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  SessionQueryFilterEventsRequest,
  SessionQueryFilterEventsValue,
  SessionQueryListRequest,
  SessionQueryListValue,
  SessionQueryReadRequest,
  SessionQueryReadValue,
  SessionQueryTraceRequest,
  SessionQueryTraceValue,
} from './types.ts'
import type { SessionQueryRemoteCode } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host session-query Remote namespace owner. */
    sessionQueryController: SessionQueryController
  }
}

/** Session Query Controller deployment policy. */
export interface Config {
  /** Reserved for deployment-tunable read bounds; no field is shipped. */
  readonly _?: never
}

/** Host service backing the generated `ctx.remote.sessionQueries` namespace. */
export class SessionQueryController extends TypertRemoteService {
  static inject = ['sessionQuery', 'typert']

  static Config: z<Config> = z.object({})

  /**
   * @param ctx - Host context carrying the live-preferred session-query engine.
   * @param config - reserved deployment policy (none shipped).
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'sessionQueryController', { namespace: 'sessionQueries' })
    // schemastery has filled the (empty) schema; the assertion records that.
    void config
  }

  /**
   * List the complete logical corpus, newest first, with live/persisted flags.
   * The roster is a request/response snapshot: a UI re-reads it to refresh,
   * and no stream state lives on this side.
   * @param _request - reserved request wrapper (the un-fenced corpus list takes no argument).
   * @returns the deterministic newest-first cloned session records.
   */
  @Remote('listSessions')
  async listSessions(_request: SessionQueryListRequest): Promise<SessionQueryListValue> {
    try {
      return await this.ctx.sessionQuery.listSessions()
    } catch (error) {
      throw this.translate(error, 'listSessions')
    }
  }

  /**
   * Read and replay-validate one complete logical session log without making
   * it live. The request's session id is the read target; a UI must constrain
   * which sessions its caller may inspect (the query service has no caller
   * authorization). The domain's raw log events are projected onto a bounded
   * wire envelope (each event's validated JSON data under `data: JsonValue`)
   * before they cross the Remote boundary.
   * @param request - live or persisted session id to read.
   * @returns the cloned header and complete raw event log from one observation, JSON-bounded.
   */
  @Remote('readSession')
  async readSession(request: SessionQueryReadRequest): Promise<SessionQueryReadValue> {
    try {
      return await this.project(await this.ctx.sessionQuery.readSession(request.sessionId))
    } catch (error) {
      throw this.translate(error, 'readSession')
    }
  }

  /**
   * Filter one logical session's first-party event documents with ANDed
   * metadata and literal-text predicates.
   * @param request - target session id and the ANDed predicate set.
   * @returns matching semantic documents in ascending seq order.
   */
  @Remote('filterEvents')
  async filterEvents(request: SessionQueryFilterEventsRequest): Promise<SessionQueryFilterEventsValue> {
    try {
      return await this.ctx.sessionQuery.filterEvents(request.sessionId, request.filters)
    } catch (error) {
      throw this.translate(error, 'filterEvents')
    }
  }

  /**
   * Trace known ancestry and descendants for one logical session from one
   * corpus observation.
   * @param request - logical session id to trace.
   * @returns a complete lineage or the first parent that could not be resolved.
   */
  @Remote('traceSession')
  async traceSession(request: SessionQueryTraceRequest): Promise<SessionQueryTraceValue> {
    try {
      return await this.ctx.sessionQuery.traceSession(request.sessionId)
    } catch (error) {
      throw this.translate(error, 'traceSession')
    }
  }

  /**
   * Project the domain's raw log snapshot onto the bounded wire envelope: the
   * header and offset pass through, and each logged event's validated JSON
   * payload lands under `data: JsonValue`. The domain's `SessionEvent` data is
   * already JSON-validated at append (`core/session` snapshotJsonValue), so the
   * width is one-way and lossless.
   * @param snapshot - the domain's cloned validated log read.
   * @returns the JSON-bounded wire snapshot the Remote namespace carries.
   */
  private project(snapshot: SessionLogSnapshot): SessionQueryReadValue {
    return {
      session: snapshot.session,
      inheritedEventCount: snapshot.inheritedEventCount,
      events: snapshot.events.map(event => ({
        type: event.type,
        seq: event.seq,
        time: event.time,
        data: event.data as JsonValue,
        ...(event.surfaceOp === undefined ? {} : { surfaceOp: event.surfaceOp as JsonValue }),
        ...(event.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: event.sourceEventSeqs as JsonValue }),
        ...(event.ignorable === undefined ? {} : { ignorable: event.ignorable }),
      })),
    }
  }

  /**
   * Translate a domain failure onto the Remote error channel, preserving the
   * typed `SessionQueryErrorCode` in a `session-query/<kebab>` Remote code so
   * the browser renders the same story the Host would.
   * @param error - the domain read's thrown failure.
   * @param method - the Remote method name, carried as attacker-controlled context for diagnosis.
   * @returns a RemoteError the generated namespace propagates to the client.
   */
  private translate(error: unknown, method: string): RemoteError {
    if (error instanceof Error) {
      const code = (
        error as { code?: string }
      ).code
      if (typeof code === 'string' && code.startsWith('SESSION_QUERY_')) {
        const remoteCode = `session-query/${code.slice('SESSION_QUERY_'.length).toLowerCase().replaceAll('_', '-')}` as SessionQueryRemoteCode
        return new RemoteError(remoteCode, error.message, {
          method,
        })
      }
    }
    return new RemoteError('session-query/error', String(error), { method })
  }
}

export default SessionQueryController
