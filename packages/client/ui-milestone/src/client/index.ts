/**
 * Milestone transcript plugin, browser half: registers the
 * `project/milestone` Conversation Definition and its keyed
 * `conversation.chat.node` renderer, plus the `milestone` dictionary. The
 * two owner edges onto `dsh-client-ui-conversation` and `dsh-client-ui-chat`
 * (kind, Definition, and keyed-slot types) make the two registration calls
 * compile; see packages/client/AGENTS.md for the required manifest rows and
 * tsconfig references.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MilestoneView } from './MilestoneView.tsx'
import { en, NS, type MilestoneKey, zh } from './locales.ts'
import { milestoneDefinition } from './milestone-definition.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Project-milestone transcript node copy. */
    milestone: MilestoneKey
  }
}

/** Required services for the Definition, keyed renderer, and copy. */
export const inject = ['uiConversation', 'slots', 'locale']

/** Register the milestone Definition, dictionary, and keyed Chat renderer. */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(milestoneDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-milestone: dictionaries')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'milestone',
    locale: NS,
  }, MilestoneView))
}
