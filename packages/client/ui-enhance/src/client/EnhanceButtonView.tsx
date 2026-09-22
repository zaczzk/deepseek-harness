/**
 * Enhance button: one quiet composer control that requests a preview. The
 * affordance stays visible on every draft (deemphasis is a later refinement);
 * pointer-down keeps the composer's focus and caret.
 */
import type { MouseEvent } from 'react'
import { IconEnhanceOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnhanceController } from './enhance-controller.ts'

/** Injected business face of the button entry. */
export interface EnhanceButtonInjected {
  /** The composer's Enhance controller (state store + verbs). */
  controller: EnhanceController
}

/** Full button props: injected face and the locale seat. */
export type EnhanceButtonViewProps = EnhanceButtonInjected & PropsLocale<'enhance'>

/**
 * Render the Enhance control.
 * @param props - injected controller; `t` rides the standard locale seat.
 * @returns the icon button requesting one preview.
 */
export function EnhanceButtonView({ controller, t }: EnhanceButtonViewProps) {
  const keepFocus = (event: MouseEvent<HTMLButtonElement>): void => { event.preventDefault() }
  return (
    <button type="button" aria-label={t('button.aria')} onMouseDown={keepFocus} onClick={() => controller.request()}>
      <IconEnhanceOutlineRegular aria-hidden />
    </button>
  )
}
