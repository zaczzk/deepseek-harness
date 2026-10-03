/**
 * Session Query Controller client half: installs `ctx.sessionQueries` over
 * the generated `sessionQueries` Remote namespace. The plugin resolves the
 * namespace face while its own context is current, because callers (a React
 * comparison seat) issue reads on caller stacks whose dynamic context has not
 * declared `remote.sessionQueries`.
 *
 * @module @deepseek-ai/dsh-api-session-query-controller/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-session-query-controller/remote'
import { ClientSessionQueries } from './service.ts'

export type { ISessionQueries } from './service.ts'
export type {
  SessionQueryListRequest,
  SessionQueryListValue,
  SessionQueryReadRequest,
  SessionQueryReadValue,
  SessionQueryFilterEventsRequest,
  SessionQueryFilterEventsValue,
  SessionQueryTraceRequest,
  SessionQueryTraceValue,
} from '../types.ts'

/** Required Client Remote services. */
export const inject = ['remote', 'remote.sessionQueries']

/**
 * Install the client session-query service.
 * @param ctx - Client root Context.
 */
export function apply(ctx: Context): void {
  // Read the namespace now, not inside a caller stack: see the module JSDoc.
  const { remote } = ctx
  new ClientSessionQueries(ctx, remote.sessionQueries)
}
