/** The session-header usage meter reports session and project tokens and shows no limit rows without a provider report. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { fixtureUserPrompts, launchWebScaffold, selectedSessionFixture, watchConsole, webSnapshotMode } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/fresh-round-trip/session.v3.jsonl', import.meta.url))

describe.skipIf(webSnapshotMode() === 'record')('web e2e: session-header usage meter', () => {
  it('shows session and project tokens and hides unreported limit rows', async () => {
    const fixture = await selectedSessionFixture(FIXTURE, false)
    const scaffold = await launchWebScaffold({
      replayFixture: fixture,
      compareReplaySession: false,
      paceMs: 5,
    })
    try {
      const browser = await chromium.launch()
      try {
        const page = await newEnglishPage(browser)
        const tripwire = watchConsole(page)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await connectFreshWorkspace(page, scaffold.workspaceCwd)
        const prompts = fixtureUserPrompts(await readFile(fixture, 'utf8'))
        expect(prompts).toHaveLength(1)
        const settled = scaffold.whenTurnSettled()
        const input = page.locator('[data-composer-input]').first()
        await input.fill(prompts[0]!)
        await input.press('Enter')
        await settled

        const trigger = page.getByRole('button', { name: /tok used this session/ })
        await trigger.waitFor()
        expect(await trigger.textContent()).toMatch(/^\d+(\.\d+)?[KM]? tok( · [\d.]+[KM]?(ms|s))?( · \d+%)?$/)
        await trigger.click()
        const panel = page.getByRole('dialog', { name: 'Token usage' })
        await panel.waitFor()
        expect(await panel.textContent()).toContain('Session')
        expect(await panel.textContent()).toContain('Project')
        // No source reports a usage window in replay: the meter shows no limit bar.
        expect(await panel.locator('[role="img"]').count()).toBe(0)
        await page.keyboard.press('Escape')
        await panel.waitFor({ state: 'hidden' })
        expect(tripwire.pageErrors).toEqual([])
        expect(tripwire.warnings).toEqual([])
      } finally {
        await browser.close()
      }
    } finally {
      await scaffold.close()
    }
  })

  it('renders the reported plan, credits, and quota percent from the host route', async () => {
    const fixture = await selectedSessionFixture(FIXTURE, false)
    const scaffold = await launchWebScaffold({
      replayFixture: fixture,
      compareReplaySession: false,
      paceMs: 5,
    })
    try {
      const browser = await chromium.launch()
      try {
        const page = await newEnglishPage(browser)
        const tripwire = watchConsole(page)
        // The keyless lane stubs the host route: no console cookie exists here.
        await page.route('**/dsh/token-plan/usage', route => route.fulfill({
          json: {
            limits: [{ period: 'month', usedTokens: 42, limitTokens: 100 }],
            plan: {
              name: 'Pro',
              resetsAt: '2026-10-22 23:59:59',
              daysUntilReset: 27,
              burn: { dailyTokens: 2_104_075_691, observedSince: '2026-09-25T02:10:00.000Z', projectedDays: 12 },
            },
            credits: { usedTokens: 2_400, limitTokens: 0 },
            state: 'ok',
          },
        }))
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await connectFreshWorkspace(page, scaffold.workspaceCwd)
        const prompts = fixtureUserPrompts(await readFile(fixture, 'utf8'))
        const settled = scaffold.whenTurnSettled()
        const input = page.locator('[data-composer-input]').first()
        await input.fill(prompts[0]!)
        await input.press('Enter')
        await settled

        const trigger = page.getByRole('button', { name: /tok used this session/ })
        await trigger.waitFor()
        expect(await trigger.textContent()).toContain('42%')
        await trigger.click()
        const panel = page.getByRole('dialog', { name: 'Token usage' })
        await panel.waitFor()
        const text = await panel.textContent()
        expect(text).toContain('Month')
        expect(text).toContain('Compensation')
        expect(text).toContain('Plan')
        expect(text).toContain('Pro')
        expect(text).toContain('Resets')
        expect(text).toContain('10-22 · ≈12d')
        await page.keyboard.press('Escape')
        expect(tripwire.pageErrors).toEqual([])
        expect(tripwire.warnings).toEqual([])
      } finally {
        await browser.close()
      }
    } finally {
      await scaffold.close()
    }
  })

  it('replaces the provider rows with one actionable line when the session expired', async () => {
    const fixture = await selectedSessionFixture(FIXTURE, false)
    const scaffold = await launchWebScaffold({
      replayFixture: fixture,
      compareReplaySession: false,
      paceMs: 5,
    })
    try {
      const browser = await chromium.launch()
      try {
        const page = await newEnglishPage(browser)
        const tripwire = watchConsole(page)
        await page.route('**/dsh/token-plan/usage', route => route.fulfill({
          json: { limits: [{ period: 'month', usedTokens: 42, limitTokens: 100 }], state: 'expired' },
        }))
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await connectFreshWorkspace(page, scaffold.workspaceCwd)
        const prompts = fixtureUserPrompts(await readFile(fixture, 'utf8'))
        const settled = scaffold.whenTurnSettled()
        const input = page.locator('[data-composer-input]').first()
        await input.fill(prompts[0]!)
        await input.press('Enter')
        await settled

        const trigger = page.getByRole('button', { name: /tok used this session/ })
        await trigger.waitFor()
        expect(await trigger.textContent()).not.toContain('%')
        await trigger.click()
        const panel = page.getByRole('dialog', { name: 'Token usage' })
        await panel.waitFor()
        expect(await panel.textContent()).toContain('Sign in to the console to see account usage')
        expect(await panel.textContent()).not.toContain('Month')
        await page.keyboard.press('Escape')
        expect(tripwire.pageErrors).toEqual([])
        expect(tripwire.warnings).toEqual([])
      } finally {
        await browser.close()
      }
    } finally {
      await scaffold.close()
    }
  })
})
