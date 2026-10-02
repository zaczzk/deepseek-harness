/**
 * Public Remote request and response types for the session-query controller.
 * Both Host and Client compiler faces compile these shared types; the wire
 * records are reused from the `session-query` domain package rather than
 * re-declared, so the browser sees the same records the Host folds.
 *
 * @module @deepseek-ai/dsh-api-session-query-controller/types
 */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SessionEventResultFilter,
  SessionEventSearchDocument,
  SessionLineageTrace,
} from '@deepseek-ai/dsh-session-query'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export type {
  SessionEventResultFilter,
  SessionEventSearchDocument,
  SessionLineageTrace,
  SessionRecord,
} from '@deepseek-ai/dsh-session-query'

/** The domain's kebab-cased Remote code for one typed `SessionQueryErrorCode`. */
export type SessionQueryRemoteCode =
  | 'session-query/aborted'
  | 'session-query/corrupt-session'
  | 'session-query/event-not-found'
  | 'session-query/index-failed'
  | 'session-query/invalid-config'
  | 'session-query/invalid-cursor'
  | 'session-query/invalid-filter'
  | 'session-query/invalid-limit'
  | 'session-query/invalid-query'
  | 'session-query/invalid-lineage'
  | 'session-query/invalid-surface'
  | 'session-query/invalid-window'
  | 'session-query/persistence-failed'
  | 'session-query/search-disabled'
  | 'session-query/session-not-found'
  | 'session-query/stale-cursor'
  | 'session-query/source-conflict'

/**
 * Merge the session-query domain's typed failures onto the Remote error
 * vocabulary so a browser seat discriminates them by the same stable `code`
 * the Host reads. Details stay opaque: each code carries the human diagnostic
 * and the method that threw, never session content.
 */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The typed `SessionQueryError.code`, kebab-cased onto the Remote, or the unclassified fallback. */
    'session-query/aborted': { readonly method: string }
    'session-query/corrupt-session': { readonly method: string }
    'session-query/event-not-found': { readonly method: string }
    'session-query/index-failed': { readonly method: string }
    'session-query/invalid-config': { readonly method: string }
    'session-query/invalid-cursor': { readonly method: string }
    'session-query/invalid-filter': { readonly method: string }
    'session-query/invalid-limit': { readonly method: string }
    'session-query/invalid-query': { readonly method: string }
    'session-query/invalid-lineage': { readonly method: string }
    'session-query/invalid-surface': { readonly method: string }
    'session-query/invalid-window': { readonly method: string }
    'session-query/persistence-failed': { readonly method: string }
    'session-query/search-disabled': { readonly method: string }
    'session-query/session-not-found': { readonly method: string }
    'session-query/stale-cursor': { readonly method: string }
    'session-query/source-conflict': { readonly method: string }
    'session-query/error': { readonly method: string }
  }
}

/** List the complete logical corpus, newest first, with live/persisted flags. */
export interface SessionQueryListRequest {
  /** Reserved for a caller-argument fence if the fenced list is ever introduced. */
  readonly _?: never
}

/** The deterministic newest-first corpus record set. */
export type SessionQueryListValue = readonly import('@deepseek-ai/dsh-session-query').SessionRecord[]

/** Read and replay-validate one complete logical session log without making it live. */
export interface SessionQueryReadRequest {
  readonly sessionId: SessionId
}

/**
 * One bounded event on the session-read wire. The domain's `SessionEvent`
 * payload is a merge-extensible map, so the controller projects each logged
 * event's validated JSON data onto this fixed envelope before it crosses the
 * Remote boundary — the same width `api/session-controller`'s
 * `SessionWireEvent` applies to the same source log.
 */
export interface SessionQueryWireEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: JsonValue
  readonly ignorable?: true
  /** Earlier sources on current surface events; opaque JSON on unknown ignorable events. */
  readonly sourceEventSeqs?: JsonValue
  /** Canonical placement on current surface events; opaque JSON on unknown ignorable events. */
  readonly surfaceOp?: JsonValue
}

/** One bounded read of a logical session's complete validated raw event log. */
export interface SessionQueryWireLogSnapshot {
  /** Cloned session header selected from the same observation as `events`. */
  readonly session: import('@deepseek-ai/dsh-session').SessionHeader
  /** Exact number of fork-inherited events in the observed log. */
  readonly inheritedEventCount: number
  /** Cloned contiguous raw events after balancing and replay validation, bounded to JSON. */
  readonly events: readonly SessionQueryWireEvent[]
}

/** The cloned header and complete raw event log from one observation, JSON-bounded. */
export type SessionQueryReadValue = SessionQueryWireLogSnapshot

/** Filter one logical session's first-party event documents with ANDed predicates. */
export interface SessionQueryFilterEventsRequest {
  readonly sessionId: SessionId
  readonly filters: readonly SessionEventResultFilter[]
}

/** Matching semantic documents in ascending seq order. */
export type SessionQueryFilterEventsValue = readonly SessionEventSearchDocument[]

/** Trace known ancestry and descendants for one logical session. */
export interface SessionQueryTraceRequest {
  readonly sessionId: SessionId
}

/** A complete lineage or the first parent that could not be resolved. */
export type SessionQueryTraceValue = SessionLineageTrace
