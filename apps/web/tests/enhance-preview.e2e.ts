/** The composer Enhance control previews a rewrite and applies it only on Accept. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { afterEach, describe, expect, it } from 'vitest'
import { launchWebScaffold, webSnapshotMode, watchConsole } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

const RUBRIC = fileURLToPath(new URL('./fixtures/enhance-rubric.yml', import.meta.url))

let overlayRoot: string | undefined

afterEach(async () => {
  if (overlayRoot !== undefined) await rm(overlayRoot, { recursive: true, force: true })
  overlayRoot = undefined
})

/** Compose the enhance preview service into the scaffold with an absolute rubric path. */
async function enhanceOverlay(): Promise<string> {
  overlayRoot = await mkdtemp(join(tmpdir(), 'web-enhance-e2e-'))
  const overlay = join(overlayRoot, 'enhance-compose.patch.yml')
  await writeFile(overlay, [
    'insert:',
    '  - id: enhance-runtime',
    "    name: '@deepseek-ai/dsh-enhance-runtime'",
    '    config:',
    `      enhanceFile: '${RUBRIC.replaceAll('\\', '/')}'`,
    "      onMissing: 'fail'",
    '',
  ].join('\n'))
  return overlay
}

describe.skipIf(webSnapshotMode() === 'record')('web e2e: composer Enhance preview', () => {
  it('applies the rewrite on Accept and keeps the draft byte-identical on Dismiss', async () => {
    const scaffold = await launchWebScaffold({
      compareReplaySession: false,
      paceMs: 5,
      extraOverlayPath: await enhanceOverlay(),
    })
    try {
      const browser = await chromium.launch()
      try {
        const page = await newEnglishPage(browser)
        const tripwire = watchConsole(page)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await connectFreshWorkspace(page, scaffold.workspaceCwd)

        const input = page.locator('[data-composer-input]').first()
        const draft = 'Add a settings page with save and cancel buttons.'
        await input.fill(draft)

        const trigger = page.getByRole('button', { name: 'Enhance draft' })
        await trigger.waitFor()
        await trigger.click()
        const preview = page.getByRole('dialog', { name: 'Enhance preview' })
        await preview.waitFor()

        // Dismiss keeps the draft byte-identical.
        await page.getByRole('button', { name: 'Dismiss' }).click()
        await preview.waitFor({ state: 'detached' })
        expect(await input.textContent()).toBe(draft)

        // Accept performs the single atomic replace of the draft.
        await trigger.click()
        await preview.waitFor()
        await page.getByRole('button', { name: 'Accept' }).click()
        await preview.waitFor({ state: 'detached' })
        expect(await input.textContent()).toContain('Objective:')
        expect(await input.textContent()).toContain(draft)
        await tripwire
      } finally {
        await browser.close()
      }
    } finally {
      await scaffold.close()
    }
  })
})
