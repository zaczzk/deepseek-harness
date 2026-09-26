/**
 * Host reader for the provider's Token Plan reports: polls the console's
 * usage and detail endpoints with the stored session and serves one
 * `TokenPlanUsageResponse` to the browser usage meter at
 * {@link TOKEN_PLAN_USAGE_PATH}.
 *
 * Security has one home, here, exactly like `dsh-host-open-in-app`: every
 * request asks the composition's `connection` service for a rejection first
 * (`requestRejection`), so its Host/Origin fence and browser authentication
 * gate every caller before any usage figure is reachable. The stored session
 * cookie stays on this side of the wire and is never served or logged.
 *
 * Failure semantics: every non-auth failure is per-poll keep-previous, while a
 * login challenge on either poll freezes the whole report as `expired` — the
 * cookie is one credential, so both polls share that fate at one commit point.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import {
  TOKEN_PLAN_USAGE_PATH,
  type TokenPlanUsageResponse,
  type UsageCreditsReport,
  type UsageLimitReport,
  type UsagePlanReport,
} from './shared.ts'
import {
  computeBurn,
  parseCredits,
  parsePlan,
  parseUsageLimits,
  recordObservation,
  reportFieldNames,
  type FirstSeen,
} from './usage.ts'

export type * from './shared.ts'

/** Cordis function-plugin name. */
export const name = 'token-plan-usage'
/** The route carrier and the trust fence guarding it. */
export const inject = ['webServer', 'connection']

/** Token-plan usage reader configuration. */
export interface Config {
  /** Console origin serving the Token Plan endpoints. */
  readonly origin: Volatile<string>
  /** Stored console session cookie value; empty keeps the reader idle. */
  readonly session: Volatile<string>
  /** Environment variable holding the session cookie when `session` is empty. */
  readonly sessionEnv: Volatile<string>
  /** Interval between usage polls, in milliseconds. */
  readonly pollIntervalMs: Volatile<number>
  /** Per-request deadline for one poll, in milliseconds. */
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

/** The console's endpoint paths, relative to the configured origin. */
const USAGE_ENDPOINT = '/api/v1/tokenPlan/usage'
const DETAIL_ENDPOINT = '/api/v1/tokenPlan/detail'

/** A login challenge: the status or the console's own envelope names it. */
function isLoginChallenge(status: number, body: unknown): boolean {
  if (status === 401) return true
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 401
}

/**
 * Register the usage route and start polling the provider's reports.
 * @param ctx - host root context carrying the web server and the trust fence.
 * @param config - origin, stored session, and polling bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const origin = config.origin.get()
  const session = config.session.get() !== ''
    ? config.session.get()
    : (process.env[config.sessionEnv.get()] ?? '')
  /** Newest report; the route serves this reference as-is. */
  let report: TokenPlanUsageResponse = { limits: [], state: 'ok' }
  /** Period observation behind the burn figure; in-memory by design. */
  let firstSeen: FirstSeen | undefined
  /** Generation of the newest started poll cycle; older cycles never commit. */
  let newestPoll = 0
  /** Set by the poll-loop disposer first thing at teardown. */
  let disposed = false
  /** Aborts in-flight provider requests the moment the poll loop is disposed. */
  const disposeAbort = new AbortController()
  /** True once teardown began; a late poll stage checks this before it acts. */
  const isDisposed = (): boolean => disposed
  /** Answer an untrusted/unauthenticated request; true when it was rejected. */
  const rejected = (req: IncomingMessage, res: ServerResponse): boolean => {
    const rejection = connectionOf(ctx).requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  const fetchReport = async (path: string): Promise<{ status: number; body: unknown }> => {
    // `redirect: 'error'`: the stored session rides this request, so a
    // redirect may never forward it to another origin. The dispose signal
    // releases the request at teardown instead of leaving it pending.
    const response = await fetch(`${origin}${path}`, {
      headers: { cookie: session, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(config.timeoutMs.get()), disposeAbort.signal]),
    })
    return { status: response.status, body: await response.json() }
  }

  const poll = async (): Promise<void> => {
    const generation = (newestPoll += 1)
    const now = Date.now()
    let limits: readonly UsageLimitReport[] = report.limits
    let credits: UsageCreditsReport | undefined = report.credits
    let plan: UsagePlanReport | undefined = report.plan
    let expired = false

    try {
      const usage = await fetchReport(USAGE_ENDPOINT)
      if (isLoginChallenge(usage.status, usage.body)) {
        expired = true
      } else {
        const parsed = parseUsageLimits(usage.body)
        if (parsed === null) {
          ctx.logger.warn(
            `token-plan-usage: usage report carries no usable counts (fields: ${reportFieldNames(usage.body).join(', ') || 'none'})`,
          )
        } else {
          limits = parsed
          credits = parseCredits(usage.body) ?? undefined
          // The newest live cycle owns the shared observation; a disposed or
          // stale one records nothing.
          if (!isDisposed() && generation === newestPoll) {
            firstSeen = recordObservation(firstSeen, parsed.find(window => window.period === 'month'), plan?.resetsAt ?? '', now)
          }
        }
      }
    } catch (pollFailure) {
      if (!isDisposed()) ctx.logger.warn(`token-plan-usage: usage poll failed: ${String(pollFailure)}`)
    }
    if (isDisposed()) return

    try {
      const detail = await fetchReport(DETAIL_ENDPOINT)
      if (isLoginChallenge(detail.status, detail.body)) {
        expired = true
      } else {
        const parsed = parsePlan(detail.body, now)
        if (parsed === null) {
          ctx.logger.warn(
            `token-plan-usage: detail report carries no plan (fields: ${reportFieldNames(detail.body).join(', ') || 'none'})`,
          )
        } else {
          const month = limits.find(window => window.period === 'month')
          const burn = month === undefined
            ? null
            : computeBurn(month.usedTokens, month.limitTokens, firstSeen, now, parsed.daysUntilReset)
          plan = {
            name: parsed.name,
            resetsAt: parsed.resetsAt,
            daysUntilReset: parsed.daysUntilReset,
            ...burn === null ? {} : { burn },
          }
        }
      }
    } catch (pollFailure) {
      if (!isDisposed()) ctx.logger.warn(`token-plan-usage: detail poll failed: ${String(pollFailure)}`)
    }
    if (isDisposed()) return

    // A login challenge freezes the whole report at this one commit point,
    // even mid-overlap; a stale cycle never overwrites a newer report.
    if (expired) {
      report = { ...report, state: 'expired' }
      return
    }
    if (generation !== newestPoll) return
    report = {
      limits,
      ...plan === undefined ? {} : { plan },
      ...credits === undefined ? {} : { credits },
      state: 'ok',
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
      sendJson(res, 200, report)
    },
  }), `token-plan-usage: GET ${TOKEN_PLAN_USAGE_PATH}`)

  if (session === '') {
    ctx.logger.info('token-plan-usage: no stored session; the usage route reports no limits')
    return
  }
  ctx.effect(() => {
    void poll()
    const timer = setInterval(() => { void poll() }, config.pollIntervalMs.get())
    // Teardown first stops new work, then releases the in-flight request:
    // after the disposer runs, no cycle records an observation or commits a
    // report, and no further provider request starts.
    return () => {
      disposed = true
      disposeAbort.abort()
      clearInterval(timer)
    }
  }, 'token-plan-usage: poll loop')
}
