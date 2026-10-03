/**
 * Web run-comparison plugin, browser half: the `run-comparison` entry of the
 * conversation view slot. The bus selects two persisted Sessions from the
 * session-query roster and folds the six per-run metrics over their recorded
 * logs. The registration rides the slot service's effect wrapper, so plugin
 * unload removes the tab. Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the sessionQueries Client service merge (ctx.sessionQueries).
import type {} from '@deepseek-ai/dsh-api-session-query-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view' SlotMap row (declared by the slot's
// owning package) must be in the program for the register call to type.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the renderer-owned slots service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { registerFace } from './face.ts'
import { createRunComparisonStore } from './store.ts'
import { RunComparisonView } from './RunComparisonView.tsx'
import { en, NS, zh, type RunComparisonKey } from './locales.ts'

export type { RunComparisonInjected } from './face.ts'
export type { RunComparisonState, RunComparisonStore, RunSideState } from './store.ts'
export type { RunMetrics, RunWireEvent } from './metrics.ts'
export type { RunComparisonKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Run comparison view's copy. */
    runComparison: RunComparisonKey
  }
}

/** Required services: the slot registry, copy, and the session-query Client service. */
export const inject = ['slots', 'locale', 'sessionQueries']

/**
 * Client plugin body: register the `runComparison` dictionaries and the
 * run-comparison conversation view tab.
 * @param ctx - client root context carrying slots, copy, and the session-query face.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-run-comparison: dictionaries')
  const t = ctx.locale.bind(NS)
  const store = createRunComparisonStore()
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'run-comparison',
    order: 40,
    locale: NS,
    label: () => t('view.tab'),
    store,
    inject: (_sessionId, actions) => registerFace(ctx.sessionQueries)(actions),
  }, RunComparisonView))
}