// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EnhanceController } from '../src/client/enhance-controller.ts'
import { EnhanceButtonView } from '../src/client/EnhanceButtonView.tsx'
import { EnhancePreviewView } from '../src/client/EnhancePreviewView.tsx'
import { enhanceDoubles, type EnhanceDoubles } from './enhance-doubles.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { en, type EnhanceKey } from '../src/client/locales.ts'
import type { EnhanceButtonViewProps } from '../src/client/EnhanceButtonView.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    enhance: EnhanceKey
  }
}

afterEach(cleanup)

/** The complete streamed rewrite the doubles deliver piecewise. */
const COMPLETE = 'Ship the settings page.\n\nAcceptance criteria:\n- [ ] Ship the settings page.'

/** Locale seat stub typed as the Enhance button/preview `t` prop. */
const t: EnhanceButtonViewProps['t'] = makeTranslate(en, commonEn)

/** Let stream work and one paint flush land. */
async function settle(): Promise<void> {
  await act(async () => { await new Promise(resolve => { setTimeout(resolve, 35) }) })
}

/** Open one streaming attempt over fresh doubles and render the popover. */
async function openStream(): Promise<{ b: EnhanceDoubles; controller: EnhanceController }> {
  const b = enhanceDoubles('Ship the settings page')
  const controller = new EnhanceController(b.deps)
  render(<EnhancePreviewView controller={controller} t={t} />)
  act(() => { controller.request() })
  b.streams[0]!.push('Ship the settings page.\n')
  await settle()
  return { b, controller }
}

describe('EnhanceButtonView', () => {
  it('renders one labelled icon control that requests a preview and keeps focus', () => {
    const b = enhanceDoubles('Ship the settings page')
    const controller = new EnhanceController(b.deps)
    render(<EnhanceButtonView controller={controller} t={t} />)
    const button = screen.getByRole('button', { name: en['button.aria'] })
    let defaultPrevented = false
    // The observer sits on document so React's delegated handler has run.
    document.addEventListener('mousedown', (event) => { defaultPrevented = event.defaultPrevented })
    fireEvent.mouseDown(button, { bubbles: true, cancelable: true })
    expect(defaultPrevented).toBe(true)
    fireEvent.click(button)
    expect(b.streams).toHaveLength(1)
  })
})

describe('EnhancePreviewView', () => {
  it('renders nothing while closed', () => {
    const b = enhanceDoubles('draft')
    const controller = new EnhanceController(b.deps)
    const { container } = render(<EnhancePreviewView controller={controller} t={t} />)
    expect(container.textContent).toBe('')
  })

  it('shows the pending icon and a disabled Accept while the stream opens', async () => {
    const b = enhanceDoubles('draft')
    const controller = new EnhanceController(b.deps)
    render(<EnhancePreviewView controller={controller} t={t} />)
    act(() => { controller.request() })
    await settle()
    expect(screen.getByRole('dialog', { name: en['preview.aria'] })).toBeDefined()
    expect(screen.getByRole('button', { name: en['action.accept'] })).toHaveProperty('disabled', true)
  })

  it('paints the ghost progressively and settles into the diff gate', async () => {
    const { b } = await openStream()
    const ghost = screen.getByLabelText(en['ghost.aria'])
    expect(ghost.textContent).toContain('Ship the settings page.')
    expect(ghost.textContent).not.toContain('Acceptance criteria:')
    expect(screen.getByRole('button', { name: en['action.accept'] })).toHaveProperty('disabled', true)
    b.streams[0]!.push('\nAcceptance criteria:\n- [ ] Ship the settings page.')
    await settle()
    expect(screen.getByLabelText(en['ghost.aria']).textContent).toContain('Acceptance criteria:')
    b.streams[0]!.end()
    await settle()
    const dialog = screen.getByRole('dialog', { name: en['preview.aria'] })
    const diff = screen.getByLabelText(en['diff.aria'])
    expect(diff.textContent).toContain('Acceptance criteria:')
    expect(diff.textContent).toContain('- [ ] Ship the settings page.')
    // The mechanical no-explanatory-prose check: the card's text is locale
    // labels and model text only — no caption, footnote, or callout nodes.
    expect(dialog.querySelectorAll('[class*="caption"],[class*="footnote"],[class*="callout"]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: en['action.accept'] })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: en['action.accept'] }))
    await settle()
    expect(b.writes).toEqual([COMPLETE])
  })

  it('a keystroke abort discards the overlay leaving the draft byte-identical', async () => {
    const { b } = await openStream()
    act(() => { b.keystroke() })
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(b.writes).toEqual([])
    expect(b.draft()).toBe('Ship the settings page')
    expect(b.streams[0]!.disposals()).toBe(1)
  })

  it('Dismiss, Escape, and an outside pointer abort identically', async () => {
    const aborts: Array<() => void> = [
      () => { fireEvent.click(screen.getByRole('button', { name: en['action.dismiss'] })) },
      () => { fireEvent.keyDown(document, { key: 'Escape' }) },
      () => { fireEvent.pointerDown(document.body) },
    ]
    for (const abort of aborts) {
      const { b } = await openStream()
      abort()
      await settle()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(b.writes).toEqual([])
      expect(b.draft()).toBe('Ship the settings page')
      expect(b.streams[0]!.disposals()).toBe(1)
      cleanup()
    }
  })

  it('only a pointer truly outside the card and composer, or Escape, aborts', async () => {
    const b = enhanceDoubles('Ship the settings page')
    const controller = new EnhanceController(b.deps)
    render(
      <div data-composer-card="">
        <EnhancePreviewView controller={controller} t={t} />
        <button type="button" data-testid="composer-button" />
      </div>,
    )
    act(() => { controller.request() })
    b.streams[0]!.push('partial')
    await settle()
    fireEvent.pointerDown(screen.getByRole('dialog'))
    fireEvent.pointerDown(screen.getByTestId('composer-button'))
    const detached = new Event('pointerdown', { bubbles: true })
    Object.defineProperty(detached, 'target', { value: {} })
    document.dispatchEvent(detached)
    fireEvent.keyDown(document, { key: 'Enter' })
    await settle()
    expect(screen.getByRole('dialog', { name: en['preview.aria'] })).toBeDefined()
    expect(b.streams[0]!.disposals()).toBe(0)
    fireEvent.pointerDown(document.body)
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(b.streams[0]!.disposals()).toBe(1)
  })

  it('shows exactly one actionable error line on failure', async () => {
    const b = enhanceDoubles('draft')
    const controller = new EnhanceController(b.deps)
    render(<EnhancePreviewView controller={controller} t={t} />)
    act(() => { controller.request() })
    b.streams[0]!.fail(new Error('nope'))
    await settle()
    expect(screen.getByRole('alert').textContent).toBe(en['error.preview'])
    expect(b.writes).toEqual([])
  })

  it('renders changed lines as data and applies only on Accept', async () => {
    const b = enhanceDoubles('Ship the settings page')
    const controller = new EnhanceController(b.deps)
    render(<EnhancePreviewView controller={controller} t={t} />)
    act(() => { controller.request() })
    b.streams[0]!.push(COMPLETE)
    b.streams[0]!.end()
    await settle()
    const dialog = screen.getByRole('dialog', { name: en['preview.aria'] })
    expect(dialog.textContent).toContain('Ship the settings page.')
    expect(dialog.textContent).toContain('Acceptance criteria:')
    expect(dialog.querySelectorAll('[class*="caption"],[class*="footnote"],[class*="callout"]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: en['action.dismiss'] }))
    await settle()
    expect(b.writes).toEqual([])
    act(() => { controller.request() })
    b.streams[1]!.push(COMPLETE)
    b.streams[1]!.end()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: en['action.accept'] }))
    await settle()
    expect(b.writes).toEqual([COMPLETE])
  })
})
