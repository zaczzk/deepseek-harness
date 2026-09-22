/**
 * Enhance preview popover: streams the rewrite as a plain-text ghost while it
 * arrives, then renders it as changed-line hunks against the captured draft in
 * the `conversation.input.overlay` anchor with Accept and Dismiss actions.
 * The draft is written only by Accept's atomic replace of the settled text;
 * every other exit — Dismiss, Escape, an outside pointer, or a keystroke
 * abort — leaves the draft byte-identical. Copy is locale-owned labels only —
 * state is colour, position, icon, and label.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { diffLines } from 'diff'
import clsx from 'clsx'
import {
  IconCheckOutlineRegular,
  IconCloseOutlineRegular,
  IconLoadingOutlineRegular,
  useAnchoredMaxHeight,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnhanceController } from './enhance-controller.ts'
import css from './EnhancePreviewView.module.css'

/** Design cap on the popover height (the MenuDropdown family's card cap). */
const MAX_HEIGHT = 320

/** Injected business face of the preview overlay entry. */
export interface EnhancePreviewInjected {
  /** The composer's Enhance controller (state store + verbs). */
  controller: EnhanceController
}

/** Full popover props: injected face and the locale seat. */
export type EnhancePreviewViewProps = EnhancePreviewInjected & PropsLocale<'enhance'>

/**
 * Render the Enhance preview popover.
 * @param props - injected controller; `t` rides the standard locale seat.
 * @returns the preview card while open; null while closed.
 */
export function EnhancePreviewView({ controller, t }: EnhancePreviewViewProps) {
  const state = useSyncExternalStore(
    (fn: () => void) => controller.state.subscribe(fn),
    () => controller.state.getSnapshot(),
  )
  const cardRef = useRef<HTMLDivElement | null>(null)
  useAnchoredMaxHeight(cardRef, MAX_HEIGHT, state)
  // Escape and a pointer outside the card and the composer abort exactly like
  // Dismiss; the composer card keeps its pointers (a keystroke owns that exit).
  useEffect(() => {
    if (!state.open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return
      if (cardRef.current?.contains(event.target)) return
      const composerCard = cardRef.current?.closest('[data-composer-card]')
      if (composerCard?.contains(event.target)) return
      controller.dismiss()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') controller.dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [state.open, controller])
  if (!state.open) return null
  return (
    <div ref={cardRef} className={css.card} role="dialog" aria-label={t('preview.aria')}>
      {state.status === 'pending' && <IconLoadingOutlineRegular aria-hidden />}
      {state.status === 'error' && <div className={css.error} role="alert">{t('error.preview')}</div>}
      {state.status === 'streaming' && (
        <div className={clsx(css.diff, css.ghost)} aria-label={t('ghost.aria')}>
          {state.text.split('\n').filter(line => line.length > 0).map((line, index) => (
            <div key={`${String(index)}-${line}`}>{line}</div>
          ))}
        </div>
      )}
      {state.status === 'ready' && (
        <div className={css.diff} aria-label={t('diff.aria')}>
          {diffLines(state.original, state.text).flatMap((part, index) =>
            part.value.split('\n').filter((line, all) => line.length > 0 || all < part.count - 1).map(line => (
              <div key={`${index}-${line}`} className={clsx(part.added === true && css.added, part.removed === true && css.removed)}>
                {line}
              </div>
            )))}
        </div>
      )}
      <div className={css.actions}>
        <button type="button" onClick={() => controller.dismiss()}>
          <IconCloseOutlineRegular aria-hidden />
          {t('action.dismiss')}
        </button>
        <button type="button" disabled={state.status !== 'ready'} onClick={() => controller.accept()}>
          <IconCheckOutlineRegular aria-hidden />
          {t('action.accept')}
        </button>
      </div>
    </div>
  )
}
