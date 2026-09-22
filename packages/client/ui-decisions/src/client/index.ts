/**
 * Web decisions plugin, browser half: the `decisions` entry of the
 * conversation view slot over the session workspace's `DECISIONS.md`, plus
 * the `decisions` dictionaries. The registration rides the slot service's
 * effect wrapper, so plugin unload removes the tab. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
// Type-only: the 'conversation.view' SlotMap row (declared by the slot's
// owning package) must be in the program for the register call to type.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { readWorkspaceText } from '@deepseek-ai/dsh-util-project-register'
import { registerFace, type RegisterInjected } from './face.ts'
import { createRegisterStore } from './store.ts'
import { DecisionsView } from './DecisionsView.tsx'
import { en, NS, zh, type DecisionsKey } from './locales.ts'

export type { ReadProjectDoc, RegisterInjected } from './face.ts'
export type { RegisterDocState, RegisterState, RegisterStore } from './store.ts'
export type { DecisionsViewProps } from './DecisionsView.tsx'
export type { DecisionsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Decisions view's copy. */
    decisions: DecisionsKey
  }
}

/** Required services: the slot registry, copy, and the workspace Files Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register the `decisions` dictionaries and the Decisions
 * conversation view tab.
 * @param ctx - client root context carrying slots, copy, and file readers.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-decisions: dictionaries')
  // Registration-time text (the view tab label) reads through the bound
  // translate as a thunk, so it follows the active locale without
  // re-registration.
  const t = ctx.locale.bind(NS)
  const store = createRegisterStore()
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'decisions',
    order: 30,
    locale: NS,
    label: () => t('view.decisions'),
    store,
    inject: (sessionId: SessionId, actions): RegisterInjected =>
      registerFace(path => readWorkspaceText(ctx.remote, sessionId, path))(actions),
  }, DecisionsView))
}
