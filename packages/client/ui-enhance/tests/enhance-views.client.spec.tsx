// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EnhanceController } from '../src/client/enhance-controller.ts'
import type { EnhancePreviewResult } from '@deepseek-ai/dsh-enhance-runtime'
import { EnhanceButtonView } from '../src/client/EnhanceButtonView.tsx'
import { EnhancePreviewView } from '../src/client/EnhancePreviewView.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** One deterministic preview result whose text rewrites the original. */
const PREVIEW: EnhancePreviewResult = {
  route: 'enhance',
  matchedRule: 'default',
  depth: 'spec',
  direction: 'enhance',
  outputLanguage: 'en',
  sections: { objective: 'Ship the settings page.', acceptance: ['Ship the settings page.'] },
  text: 'Ship the settings page.\n\nAcceptance criteria:\n- [ ] Ship the settings page.',
}

/** The locale seat stub: keys resolve through the English dictionary. */
const t = (key: string): string => en[key as keyof typeof en]

/** Build a controller over recorded collaborators. */
function bench(): {
  controller: EnhanceController
  setDraft: string[]
  requestCount: () => number
} {
  const setDraft: string[] = []
  let requests = 0
  const controller = new EnhanceController({
    preview: () => { requests += 1; return Promise.resolve(PREVIEW) },
    readDraft: () => 'Ship the settings page',
    setDraft: (text) => { setDraft.push(text) },
    focus: () => {},
  })
  return { controller, setDraft, requestCount: () => requests }
}

describe('EnhanceButtonView', () => {
  it('renders one labelled icon control that requests a preview and keeps focus', () => {
    const b = bench()
    render(<EnhanceButtonView controller={b.controller} t={t} />)
    const button = screen.getByRole('button', { name: en['button.aria'] })
    let defaultPrevented = false
    fireEvent.mouseDown(button, { bubbles: true, cancelable: true })
    button.addEventListener('mousedown', (event) => { defaultPrevented = event.defaultPrevented })
    fireEvent.mouseDown(button, { bubbles: true, cancelable: true })
    expect(defaultPrevented).toBe(true)
    fireEvent.click(button)
    expect(b.requestCount()).toBe(1)
  })
})

describe('EnhancePreviewView', () => {
  it('renders nothing while closed', () => {
    const b = bench()
    const { container } = render(<EnhancePreviewView controller={b.controller} t={t} />)
    expect(container.textContent).toBe('')
  })

  it('shows the pending icon while a preview is in flight', () => {
    const controller = new EnhanceController({
      preview: () => new Promise(() => {}),
      readDraft: () => 'draft',
      setDraft: () => { throw new Error('never') },
      focus: () => {},
    })
    render(<EnhancePreviewView controller={controller} t={t} />)
    act(() => { controller.request() })
    expect(screen.getByRole('dialog', { name: en['preview.aria'] })).toBeDefined()
    expect(screen.getByRole('button', { name: en['action.accept'] })).toHaveProperty('disabled', true)
  })

  it('shows exactly one actionable error line on failure', () => {
    const controller = new EnhanceController({
      preview: () => Promise.reject(new Error('nope')),
      readDraft: () => 'draft',
      setDraft: () => { throw new Error('never') },
      focus: () => {},
    })
    render(<EnhancePreviewView controller={controller} t={t} />)
    act(() => { controller.request() })
    void Promise.resolve().then(() => {
      expect(screen.getByRole('alert').textContent).toBe(en['error.preview'])
    })
  })

  it('renders changed lines as data and applies only on Accept', async () => {
    const b = bench()
    render(<EnhancePreviewView controller={b.controller} t={t} />)
    act(() => { b.controller.request() })
    await act(async () => { await Promise.resolve() })
    const dialog = screen.getByRole('dialog', { name: en['preview.aria'] })
    expect(dialog.textContent).toContain('Ship the settings page.')
    expect(dialog.textContent).toContain('Acceptance criteria:')
    // The mechanical no-explanatory-prose check: the card's text is locale
    // labels and model text only — no caption, footnote, or callout nodes.
    expect(dialog.querySelectorAll('[class*="caption"],[class*="footnote"],[class*="callout"]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: en['action.dismiss'] }))
    expect(b.setDraft).toEqual([])
    act(() => { b.controller.request() })
    await act(async () => { await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: en['action.accept'] }))
    expect(b.setDraft).toEqual([PREVIEW.text])
  })
})
