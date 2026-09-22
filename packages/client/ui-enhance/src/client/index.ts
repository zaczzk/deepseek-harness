/**
 * Enhance composer plugin, browser half: one per-composer controller shared
 * by the `conversation.input.right` button entry and the
 * `conversation.input.overlay` preview popover. The controller is the only
 * reach to the enhance Remote and the session input facade; the draft is
 * written only by accept's single atomic replace.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the enhance Remote namespace's Context merge ('remote.enhance').
import type {} from '@deepseek-ai/dsh-enhance-runtime/remote'
// Type-only: pulls the 'conversation.input.*' SlotMap declarations and the
// SessionInputResolver face into this program so the registrations below
// typecheck against the real declarations — no runtime edge to ui-conversation.
import type { SessionInputResolver } from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { EnhanceController } from './enhance-controller.ts'
import type { EnhanceButtonInjected } from './EnhanceButtonView.tsx'
import { EnhanceButtonView } from './EnhanceButtonView.tsx'
import type { EnhancePreviewInjected } from './EnhancePreviewView.tsx'
import { EnhancePreviewView } from './EnhancePreviewView.tsx'
import { en, zh, type EnhanceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The button's and the preview popover's copy. */
    enhance: EnhanceKey
  }
}

export { EnhanceController } from './enhance-controller.ts'
export type { EnhanceDeps, EnhanceState } from './enhance-controller.ts'
export type { EnhanceButtonInjected, EnhanceButtonViewProps } from './EnhanceButtonView.tsx'
export type { EnhancePreviewInjected, EnhancePreviewViewProps } from './EnhancePreviewView.tsx'
export type { EnhanceKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'enhance'

/** Required services: session scopes, the conversation input facade, the enhance Remote, and the locale registry. */
export const inject = ['sessions', 'conversation', 'remote', 'remote.enhance', 'locale']

/**
 * Mount the Enhance button and its preview popover over one shared
 * per-composer controller.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-enhance: dictionaries')
  ctx.inject(['slots', 'sessions', 'conversation'], (scope: ClientContext) => {
    const sessions = scope.get('sessions') as ISessions
    const conversation = scope.get('conversation') as { readonly input: SessionInputResolver }
    const enhance = scope.get('remote.enhance') as {
      preview: (request: { readonly draft: string }) => Promise<import('@deepseek-ai/dsh-enhance-runtime').EnhancePreviewResult>
    }
    const controllers = new Map<string, EnhanceController>()
    const controllerFor = (sessionId: SessionId): EnhanceController => {
      const existing = controllers.get(sessionId)
      if (existing !== undefined) return existing
      const actx = sessions.scope(sessionId)
      if (actx === undefined) throw new Error(`ui-enhance: session "${String(sessionId)}" resolved no scope`)
      const controller = new EnhanceController({
        preview: draft => enhance.preview({ draft }),
        readDraft: () => conversation.input.for(actx).state.getSnapshot().draft,
        setDraft: (text) => { conversation.input.for(actx).setDraft(text) },
        focus: () => { conversation.input.for(actx).focus() },
      })
      controllers.set(sessionId, controller)
      return controller
    }
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'enhance-button',
      order: 2,
      locale: NS,
      inject: (sessionId): EnhanceButtonInjected => ({ controller: controllerFor(sessionId) }),
    }, EnhanceButtonView))
    scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
      name: 'conversation.input.overlay',
      id: 'enhance-preview',
      order: 2,
      locale: NS,
      inject: (sessionId): EnhancePreviewInjected => ({ controller: controllerFor(sessionId) }),
    }, EnhancePreviewView))
  })
}
