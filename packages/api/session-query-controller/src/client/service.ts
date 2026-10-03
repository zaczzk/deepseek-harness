/**
 * The `ctx.sessionQueries` client service: RPC passthroughs over the
 * generated `sessionQueries` namespace. Each method maps to one Remote call
 * and returns the Remote result, so a comparison seat owns its own read
 * lifecycle and error presentation from the typed failure code. No shared
 * stream or selection state lives here — a run comparison derives from the
 * exact reads it issues.
 *
 * @module @deepseek-ai/dsh-api-session-query-controller/client/service
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  SessionQueryFilterEventsRequest,
  SessionQueryFilterEventsValue,
  SessionQueryListRequest,
  SessionQueryListValue,
  SessionQueryReadRequest,
  SessionQueryReadValue,
  SessionQueryTraceRequest,
  SessionQueryTraceValue,
} from '../types.ts'

/** The generated `sessionQueries` namespace face. */
export interface SessionQueriesRemote {
  /**
   * List the complete logical corpus, newest first.
   * @param request - reserved request wrapper.
   * @returns the deterministic newest-first corpus records, or a transport failure.
   */
  listSessions(request: SessionQueryListRequest): Promise<RemoteResult<SessionQueryListValue>>
  /**
   * Read and replay-validate one complete logical session log.
   * @param request - live or persisted session id to read.
   * @returns the cloned header and complete raw log, or a typed/transport failure.
   */
  readSession(request: SessionQueryReadRequest): Promise<RemoteResult<SessionQueryReadValue>>
  /**
   * Filter one logical session's event documents with ANDed predicates.
   * @param request - target session and the predicate set.
   * @returns matching documents in ascending seq order, or a typed/transport failure.
   */
  filterEvents(request: SessionQueryFilterEventsRequest): Promise<RemoteResult<SessionQueryFilterEventsValue>>
  /**
   * Trace known ancestry and descendants for one logical session.
   * @param request - logical session id to trace.
   * @returns the lineage, or a typed/transport failure.
   */
  traceSession(request: SessionQueryTraceRequest): Promise<RemoteResult<SessionQueryTraceValue>>
}

/** The client session-query service face. */
export interface ISessionQueries {
  /**
   * List the complete logical corpus, newest first, with live/persisted flags.
   * @returns the records, or the typed/transport failure for a rejection.
   */
  listSessions(): Promise<RemoteResult<SessionQueryListValue>>
  /**
   * Read and replay-validate one complete logical session log.
   * @param sessionId - the session to read.
   * @returns the cloned header and complete raw log, or the failure.
   */
  readSession(sessionId: SessionIdLike): Promise<RemoteResult<SessionQueryReadValue>>
  /**
   * Filter one logical session's event documents.
   * @param sessionId - the session to scan.
   * @param filters - ANDed metadata and literal-text predicates.
   * @returns matching documents, or the failure.
   */
  filterEvents(sessionId: SessionIdLike, filters: SessionQueryFilterEventsRequest['filters']): Promise<RemoteResult<SessionQueryFilterEventsValue>>
  /**
   * Trace ancestry and descendants for one logical session.
   * @param sessionId - the session to trace.
   * @returns the lineage, or the failure.
   */
  traceSession(sessionId: SessionIdLike): Promise<RemoteResult<SessionQueryTraceValue>>
}

/** The session id argument as accepted on the wire (branded `SessionId`). */
type SessionIdLike = SessionQueryReadRequest['sessionId']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** React-free session-query Remote passthroughs. */
    sessionQueries: ISessionQueries
  }
}

/** Owns the four RPC passthroughs over the generated `sessionQueries` namespace. */
export class ClientSessionQueries extends Service implements ISessionQueries {
  /**
   * @param ctx - client root Context.
   * @param remote - the generated `sessionQueries` namespace.
   */
  constructor(
    ctx: Context,
    private readonly remote: SessionQueriesRemote,
  ) {
    super(ctx, 'sessionQueries')
  }

  listSessions(): Promise<RemoteResult<SessionQueryListValue>> {
    return this.remote.listSessions({})
  }

  readSession(sessionId: SessionIdLike): Promise<RemoteResult<SessionQueryReadValue>> {
    return this.remote.readSession({ sessionId })
  }

  filterEvents(sessionId: SessionIdLike, filters: SessionQueryFilterEventsRequest['filters']): Promise<RemoteResult<SessionQueryFilterEventsValue>> {
    return this.remote.filterEvents({ sessionId, filters })
  }

  traceSession(sessionId: SessionIdLike): Promise<RemoteResult<SessionQueryTraceValue>> {
    return this.remote.traceSession({ sessionId })
  }
}
