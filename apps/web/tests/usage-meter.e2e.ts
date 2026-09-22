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

        const trigger = page.getByRole('button', { name: /tok used this session$/ })
        await trigger.waitFor()
        expect(await trigger.textContent()).toMatch(/^\d+(\.\d+)?[KM]? tok$/)
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
})
