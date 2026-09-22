/**
 * Session and project token-usage meter in the Session header's utility row.
 *
 * The meter reads the host-computed `tokenUsageByModel`, `tokenUsage`, and
 * `modelSelection` projections and the shared session/workspace lists; it owns
 * no accounting. Provider-reported usage windows arrive through the injected
 * reader and render only while a source reports them.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { UsageIndicator } from './UsageIndicator.tsx'
import type { UsageInjected } from './contract.ts'
import { loadLimits } from './limits.ts'
import { en, NS, zh, type UsageKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-header token-usage meter copy. */
    usage: UsageKey
  }
}

export type { UsageIndicatorProps } from './UsageIndicator.tsx'
export type { UsageInjected, UsageLimit } from './contract.ts'

/** Required services: the slot registry and copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the header meter.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-usage: dictionaries')
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'usage',
    order: 10,
    locale: NS,
    inject: (): UsageInjected => ({ loadLimits }),
  }, UsageIndicator))
}
