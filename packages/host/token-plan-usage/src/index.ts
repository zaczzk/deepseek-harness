/**
 * Host reader for the provider's Token Plan usage report: polls the console's
 * usage endpoint with the stored session and serves the newest reported
 * windows to the browser usage meter at {@link TOKEN_PLAN_USAGE_PATH}.
 *
 * Security has one home, here, exactly like `dsh-host-open-in-app`: every
 * request asks the composition's `connection` service for a rejection first
 * (`requestRejection`), so its Host/Origin fence and browser authentication
 * gate every caller before any usage figure is reachable. The stored session
 * cookie stays on this side of the wire and is never served or logged.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { TOKEN_PLAN_USAGE_PATH, type TokenPlanUsageResponse, type UsageLimitReport } from './shared.ts'
import { parseUsageLimits, reportFieldNames } from './usage.ts'

export type * from './shared.ts'

/** Cordis function-plugin name. */
export const name = 'token-plan-usage'
/** The route carrier and the trust fence guarding it. */
export const inject = ['webServer', 'connection']

/** Token-plan usage reader configuration. */
export interface Config {
  /** Console origin serving the Token Plan usage endpoint. */
  readonly origin: Volatile<string>
  /** Stored console session cookie value; empty keeps the reader idle. */
  readonly session: Volatile<string>
  /** Environment variable holding the session cookie when `session` is empty. */
  readonly sessionEnv: Volatile<string>
  /** Interval between usage polls, in milliseconds. */
  readonly pollIntervalMs: Volatile<number>
  /** Per-request deadline for one usage poll, in milliseconds. */
  readonly timeoutMs: Volatile<number>
}

export const Config = z.object({
  origin: z.string().default('https://platform.xiaomimimo.com').volatile(),
  session: z.string().role('secret').default('').volatile(),
  sessionEnv: z.string().role('credential-ref').default('DSH_TOKEN_PLAN_SESSION').volatile(),
  pollIntervalMs: z.number().step(1).min(60_000).max(86_400_000).default(900_000).volatile(),
  timeoutMs: z.number().step(1).min(1_000).max(120_000).default(15_000).volatile(),
})

/** Trust surface consumed here; the browser-side connection package owns the full type. */
interface TokenPlanConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

/** The composition's connection service (typed locally: its package is browser-side). */
function connectionOf(ctx: Context): TokenPlanConnection {
  return Reflect.get(ctx, 'connection') as TokenPlanConnection
}

/** JSON response (no-store: usage windows are live facts). */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** 405 with the route's one supported method. */
function sendMethodNotAllowed(res: ServerResponse, allow: 'GET'): void {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** The console's usage endpoint path, relative to the configured origin. */
const USAGE_ENDPOINT = '/api/v1/tokenPlan/usage'

/**
 * Register the usage route and start polling the provider's report.
 * @param ctx - host root context.
 * @param config - origin, stored session, and polling bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const origin = config.origin.get()
  const session = config.session.get() !== ''
    ? config.session.get()
    : (process.env[config.sessionEnv.get()] ?? '')
  /** Newest reported windows; the route serves this reference as-is. */
  let limits: readonly UsageLimitReport[] = []
  /** Answer an untrusted/unauthenticated request; true when it was rejected. */
  const rejected = (req: IncomingMessage, res: ServerResponse): boolean => {
    const rejection = connectionOf(ctx).requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  const poll = async (): Promise<void> => {
    try {
      // `redirect: 'error'`: the stored session rides this request, so a
      // redirect may never forward it to another origin.
      const response = await fetch(`${origin}${USAGE_ENDPOINT}`, {
        headers: { cookie: session, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs.get()),
      })
      const body: unknown = await response.json()
      const parsed = parseUsageLimits(body)
      if (parsed === null) {
        // Field names only: enough to retarget the parser, and no usage value
        // ever reaches the log.
        ctx.logger.warn(
          `token-plan-usage: report carries no usable counts (fields: ${reportFieldNames(body).join(', ') || 'none'})`,
        )
        return
      }
      limits = parsed
    } catch (error: unknown) {
      ctx.logger.warn(`token-plan-usage: usage poll failed: ${String(error)}`)
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TOKEN_PLAN_USAGE_PATH,
    handler: (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      const payload: TokenPlanUsageResponse = { limits }
      sendJson(res, 200, payload)
    },
  }), `token-plan-usage: GET ${TOKEN_PLAN_USAGE_PATH}`)

  if (session === '') {
    ctx.logger.info('token-plan-usage: no stored session; the usage route reports no limits')
    return
  }
  ctx.effect(() => {
    void poll()
    const timer = setInterval(() => { void poll() }, config.pollIntervalMs.get())
    return () => { clearInterval(timer) }
  }, 'token-plan-usage: poll loop')
}
