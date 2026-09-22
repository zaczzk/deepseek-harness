/**
 * Web architecture plugin, browser half: the `architecture` entry of the
 * conversation view slot over the session workspace's `ARCHITECTURE.md` and
 * `DECISIONS.md`, plus the `architecture` dictionaries. The registration rides
 * the slot service's effect wrapper, so plugin unload removes the tab. Export
 * discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
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
import { architectureFace, type ArchitectureInjected } from './face.ts'
import { renderMermaidSvg } from './render-diagram.ts'
import { createArchitectureStore } from './store.ts'
import { ArchitectureView } from './ArchitectureView.tsx'
import { en, NS, zh, type ArchitectureKey } from './locales.ts'

export type { ArchitectureInjected, ReadProjectDoc, RenderDiagram } from './face.ts'
export type {
  ArchitectureState, ArchitectureStore, DocState, ProjectDocKey, RenderState,
} from './store.ts'
export type { ArchitectureViewProps } from './ArchitectureView.tsx'
export type { ArchitectureKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Architecture view's copy. */
    architecture: ArchitectureKey
  }
}

/** Required services: the slot registry, copy, and the workspace Files Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register the `architecture` dictionaries and the
 * Architecture conversation view tab.
 * @param ctx - client root context carrying slots, copy, and file readers.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-architecture: dictionaries')
  // Registration-time text (the view tab label) reads through the bound
  // translate as a thunk, so it follows the active locale without
  // re-registration.
  const t = ctx.locale.bind(NS)
  const store = createArchitectureStore()
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'architecture',
    order: 20,
    locale: NS,
    label: () => t('view.architecture'),
    store,
    inject: (sessionId: SessionId, actions): ArchitectureInjected =>
      architectureFace(path => readWorkspaceText(ctx.remote, sessionId, path), renderMermaidSvg)(actions),
  }, ArchitectureView))
}
