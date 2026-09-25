/**
 * Usage route over a real WebServer booted through the vendored Loader (the
 * REAL-composition requirement): the connection trust fence, the polled
 * report's parse-or-keep-previous behavior, the credential-ref session, the
 * poll-failure path, and the no-session idle state. The provider's console
 * endpoint is faked through `fetch`; the connection service is a controllable
 * stub (its real provider is the browser composition).
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
import Include from '@deepseek-ai/cordis-plugin-include'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as TokenPlanUsage from '../src/index.ts'
import type { TokenPlanUsageResponse } from '../src/shared.ts'

let root: string | undefined
let context: Context | undefined
/** The real transport: tests stub `fetch` for the provider poll only. */
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
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  expect([...context.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])
  return `http://127.0.0.1:${String(context.webServer.port)}`
}

const limitsOf = async (origin: string): Promise<TokenPlanUsageResponse['limits']> => {
  const res = await realFetch(`${origin}/dsh/token-plan/usage`)
  return ((await res.json()) as TokenPlanUsageResponse).limits
}

const jsonResponse = (body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

/** The console's live report shape around one monthly-quota row. */
const monthReport = (used: number, limit: number): unknown => ({
  code: 0,
  message: '',
  data: { monthUsage: { items: [{ name: 'month_total_token', used, limit }] } },
})

describe('token-plan usage route', () => {
  it('serves the polled report as one monthly window', async () => {
    const seen: { url: string | undefined; cookie: string | undefined } = { url: undefined, cookie: undefined }
    const report = vi.fn((url: string, init?: RequestInit) => {
      seen.url = url
      seen.cookie = (init?.headers as Record<string, string>).cookie
      return jsonResponse(monthReport(42, 100))
    })
    vi.stubGlobal('fetch', report)
    const origin = await boot('cookie-value')
    await vi.waitFor(async () => {
      expect(await limitsOf(origin)).toEqual([{
        period: 'month',
        usedTokens: 42,
        limitTokens: 100,
      }])
    })
    expect(seen).toEqual({
      url: 'https://console.example/api/v1/tokenPlan/usage',
      cookie: 'cookie-value',
    })
  })

  it('re-polls the report on the configured interval', async () => {
    // Only the interval fakes: boot's file and listener work stays real.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const report = vi.fn(() => jsonResponse(monthReport(1, 2)))
    vi.stubGlobal('fetch', report)
    await boot('cookie-value')
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(report).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(report).toHaveBeenCalledTimes(3)
  })

  it('publishes nothing when the report drifts off the console counts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ data: { usedTokens: 1, limitTokens: 2 } })))
    const origin = await boot('cookie-value')
    await vi.waitFor(async () => {
      expect(await limitsOf(origin)).toEqual([])
    })
  })

  it('keeps serving the last report through a failed poll', async () => {
    let offline = false
    vi.stubGlobal('fetch', vi.fn(() => offline
      ? Promise.reject(new Error('console unreachable'))
      : jsonResponse(monthReport(7, 10))))
    const origin = await boot('cookie-value')
    await vi.waitFor(async () => {
      expect(await limitsOf(origin)).toHaveLength(1)
    })
    offline = true
    expect(await limitsOf(origin)).toEqual([{ period: 'month', usedTokens: 7, limitTokens: 10 }])
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
      expect(await limitsOf(origin)).toHaveLength(1)
    })
    expect(seen.cookie).toBe('env-cookie')
  })

  it('reports no limits and polls nothing without a stored session', async () => {
    const report = vi.fn()
    vi.stubGlobal('fetch', report)
    const origin = await boot('')
    expect(await limitsOf(origin)).toEqual([])
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
      expect(hits).toEqual(['/api/v1/tokenPlan/usage'])
      expect(await limitsOf(origin)).toEqual([])
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    }
  })
})
