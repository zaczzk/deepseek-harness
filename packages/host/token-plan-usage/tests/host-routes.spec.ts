/**
 * Usage route over a real WebServer booted through the vendored Loader (the
 * REAL-composition requirement): the connection trust fence, the two-poll
 * failure matrix (per-poll keep-previous, login challenge freezes the whole
 * report), the burn observation, the credits presence rule, and the
 * no-session idle state. The provider's console endpoints are faked through
 * `fetch`; the connection service is a controllable stub (its real provider is
 * the browser composition).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { ModuleLoader } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as TokenPlanUsage from '../src/index.ts'
import type { TokenPlanUsageResponse } from '../src/shared.ts'

let root: string | undefined
let context: Context | undefined
/** The real transport: tests stub `fetch` for the provider polls only. */
const realFetch = globalThis.fetch.bind(globalThis)
/** Answer the connection stub gives the route until a test changes it. */
const trust: { rejection: 401 | 403 | undefined } = { rejection: undefined }

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  trust.rejection = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Boot webserver + token-plan-usage rows through the real Loader. */
async function boot(session: string, consoleOrigin = 'https://console.example'): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-token-plan-usage-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-host-token-plan-usage'",
    '  config:',
    `    origin: '${consoleOrigin}'`,
    `    session: '${session}'`,
    '    pollIntervalMs: 60000',
    '    timeoutMs: 5000',
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  context.provide('connection', { requestRejection: () => trust.rejection } as never)
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-host-token-plan-usage', TokenPlanUsage],
  ])
  // The Loader seam: a complete ModuleLoader shape whose only live member
  // answers plugin imports from the fixture map.
  const internal: ModuleLoader = {
    version: 'v2',
    loadCache: new Map(),
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
    register: () => {},
    getOrCreateModuleJob: () => Promise.reject(new Error('unused test seam')),
    resolveSync: () => { throw new Error('unused test seam') },
    load: () => Promise.reject(new Error('unused test seam')),
  }
  context.loader.internal = internal
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  expect([...context.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])
  return `http://127.0.0.1:${String(context.webServer.port)}`
}

const reportOf = async (origin: string): Promise<TokenPlanUsageResponse> => {
  const res = await realFetch(`${origin}/dsh/token-plan/usage`)
  return (await res.json()) as TokenPlanUsageResponse
}

const jsonResponse = (body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

/** The console's live report shape around one monthly-quota row. */
const monthReport = (used: number, limit: number, credits?: { used: number; limit: number }): unknown => ({
  code: 0,
  message: '',
  data: {
    monthUsage: { items: [{ name: 'month_total_token', used, limit }] },
    usage: { items: [{ name: 'compensation_total_token', used: credits?.used ?? 0, limit: credits?.limit ?? 0 }] },
  },
})

/** The console's live detail report shape. */
const detailReport = (name: string, end: string): unknown => ({
  code: 0,
  message: '',
  data: { planName: name, currentPeriodEnd: end, expired: false },
})

/** The console's login challenge envelope. */
const loginChallenge = (): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify({ code: 401, loginUrl: 'https://account.example/login' }), { status: 401 }))

describe('token-plan usage route', () => {
  it('serves the polled window, plan, and credits as one report', async () => {
    const seen: { url: string | undefined; cookie: string | undefined } = { url: undefined, cookie: undefined }
    const report = vi.fn((url: string, init?: RequestInit) => {
      seen.url = url
      seen.cookie = (init?.headers as Record<string, string>).cookie
      return url.endsWith('/detail')
        ? jsonResponse(detailReport('Pro', '2026-10-22 23:59:59'))
        : jsonResponse(monthReport(42, 100, { used: 2_400, limit: 0 }))
    })
    vi.stubGlobal('fetch', report)
    const origin = await boot('cookie-value')
    await vi.waitFor(async () => {
      const served = await reportOf(origin)
      expect(served.limits).toEqual([{ period: 'month', usedTokens: 42, limitTokens: 100 }])
      expect(served.credits).toEqual({ usedTokens: 2_400, limitTokens: 0 })
    })
    const served = await reportOf(origin)
    expect(served.plan?.name).toBe('Pro')
    expect(served.plan?.resetsAt).toBe('2026-10-22 23:59:59')
    expect(served.state).toBe('ok')
    expect(seen.cookie).toBe('cookie-value')
  })

  it('keeps each previous poll through its own failure', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let detailFails = false
    let usageFails = false
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/detail')) {
        return detailFails
          ? Promise.reject(new Error('detail unreachable'))
          : jsonResponse(detailReport('Pro', '2026-10-22 23:59:59'))
      }
      return usageFails
        ? Promise.reject(new Error('usage unreachable'))
        : jsonResponse(monthReport(7, 10))
    }))
    const origin = await boot('cookie-value')
    await vi.advanceTimersByTimeAsync(0)
    expect((await reportOf(origin)).plan?.name).toBe('Pro')
    detailFails = true
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await reportOf(origin)).limits).toEqual([{ period: 'month', usedTokens: 7, limitTokens: 10 }])
    detailFails = false
    usageFails = true
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await reportOf(origin)).plan?.name).toBe('Pro')
  })

  it('freezes the whole report as expired on a login challenge', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let challenged = false
    vi.stubGlobal('fetch', vi.fn((url: string) => challenged
      ? loginChallenge()
      : (url.endsWith('/detail')
        ? jsonResponse(detailReport('Pro', '2026-10-22 23:59:59'))
        : jsonResponse(monthReport(7, 10)))))
    const origin = await boot('cookie-value')
    await vi.advanceTimersByTimeAsync(0)
    expect((await reportOf(origin)).state).toBe('ok')
    challenged = true
    await vi.advanceTimersByTimeAsync(60_000)
    const served = await reportOf(origin)
    expect(served.state).toBe('expired')
    expect(served.limits).toEqual([{ period: 'month', usedTokens: 7, limitTokens: 10 }])
    expect(served.plan?.name).toBe('Pro')
  })

  it('refuses drifted reports and keeps the previous ones', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let drifted = false
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/detail')
      ? jsonResponse({ data: { usedTokens: 1 } })
      : (drifted
        ? jsonResponse({ data: { monthUsage: { items: [{ name: 'other', used: 1, limit: 2 }] } } })
        : jsonResponse(monthReport(7, 10)))))
    const origin = await boot('cookie-value')
    await vi.advanceTimersByTimeAsync(0)
    expect((await reportOf(origin)).limits).toHaveLength(1)
    drifted = true
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await reportOf(origin)).limits).toEqual([{ period: 'month', usedTokens: 7, limitTokens: 10 }])
  })

  it('serves the plan without a burn figure when the usage report never arrives', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/detail')
      ? jsonResponse(detailReport('Pro', '2026-10-22 23:59:59'))
      : Promise.reject(new Error('usage unreachable'))))
    const origin = await boot('cookie-value')
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000)
    const served = await reportOf(origin)
    expect(served.plan?.name).toBe('Pro')
    expect(served.plan?.burn).toBeUndefined()
  })

  it('attaches the burn figure once the observation covers its window', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    let calls = 0
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.endsWith('/detail')) return jsonResponse(detailReport('Pro', '2026-10-22 23:59:59'))
      calls += 1
      return jsonResponse(monthReport(calls === 1 ? 100 : 700, 1_000))
    }))
    const origin = await boot('cookie-value')
    await vi.advanceTimersByTimeAsync(0)
    expect((await reportOf(origin)).plan?.burn).toBeUndefined()
    await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000)
    const burn = (await reportOf(origin)).plan?.burn
    expect(burn?.dailyTokens).toBeGreaterThan(0)
    expect(burn?.projectedDays).toBeGreaterThanOrEqual(1)
  })

  it('re-polls the reports on the configured interval', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const report = vi.fn(() => jsonResponse(monthReport(1, 2)))
    vi.stubGlobal('fetch', report)
    await boot('cookie-value')
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(report).toHaveBeenCalledTimes(4)
  })

  it('reads the session from its credential-ref environment variable', async () => {
    vi.stubEnv('DSH_TOKEN_PLAN_SESSION', 'env-cookie')
    const seen: { cookie: string | undefined } = { cookie: undefined }
    const report = vi.fn((_url: string, init?: RequestInit) => {
      seen.cookie = (init?.headers as Record<string, string>).cookie
      return jsonResponse(monthReport(1, 2))
    })
    vi.stubGlobal('fetch', report)
    const origin = await boot('')
    await vi.waitFor(async () => {
      expect((await reportOf(origin)).limits).toHaveLength(1)
    })
    expect(seen.cookie).toBe('env-cookie')
  })

  it('reports no limits and polls nothing without a stored session', async () => {
    const report = vi.fn()
    vi.stubGlobal('fetch', report)
    const origin = await boot('')
    expect((await reportOf(origin)).limits).toEqual([])
    expect(report).not.toHaveBeenCalled()
  })

  it('holds the connection trust fence and answers GET only', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({})))
    const origin = await boot('cookie-value')
    const posted = await realFetch(`${origin}/dsh/token-plan/usage`, { method: 'POST' })
    expect(posted.status).toBe(405)
    expect(posted.headers.get('allow')).toBe('GET')

    trust.rejection = 401
    const refused = await realFetch(`${origin}/dsh/token-plan/usage`)
    expect(refused.status).toBe(401)
  })

  it('refuses a redirect so the stored session never reaches the target', async () => {
    const hits: string[] = []
    const server = createServer((req, res) => {
      hits.push(String(req.url))
      if (req.url === '/api/v1/tokenPlan/usage') {
        res.writeHead(302, { location: '/steal' })
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"used":1,"limit":2}')
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as AddressInfo).port
    try {
      const origin = await boot('cookie-value', `http://127.0.0.1:${String(port)}`)
      await vi.waitFor(() => {
        expect(hits).toContain('/api/v1/tokenPlan/usage')
      })
      expect(hits).not.toContain('/steal')
      expect((await reportOf(origin)).limits).toEqual([])
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    }
  })
})
