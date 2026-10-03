/**
 * Remembered-approval-rules plugin, browser half: registers the rule-answered
 * `approval/decided` Conversation Definition and its keyed
 * `conversation.chat.node` renderer, plus the Settings section owning the
 * rule roster (list + add/edit form + revoke) over the `approvalRuleSets`
 * client service, and the `approval.rules` dictionary. Registration rides the
 * plugin fiber (Definitions, keyed renderer, section, and dictionary
 * disappear together on unload for HMR safety).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-approval-rules/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ApprovalRulesSectionController } from './approval-rules-store.ts'
import { ApprovalRuleRow } from './ApprovalRuleRow.tsx'
import { ApprovalRulesSection, type ApprovalRulesSectionInjected } from './ApprovalRulesSection.tsx'
import type { ApprovalRuleId } from '@deepseek-ai/dsh-user-approval'
import { en, NS, type ApprovalRulesKey, zh } from './locales.ts'
import { approvalRuleDefinition } from './approval-rule-definition.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Remembered-approval-rule section, form, and transcript-row copy. */
    'approval.rules': ApprovalRulesKey
  }
}

/** Required services for the Definition, keyed renderer, section, and copy. */
export const inject = ['uiConversation', 'slots', 'locale', 'approvalRuleSets', 'remote', 'remote.permissionPresets', 'sessions']

/**
 * Client plugin body: the rule-answered transcript row, the Settings section
 * owning the rule roster (plus item 12's effective-permission readout over the
 * Session controller and the permission catalog), and the shared dictionary.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(approvalRuleDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-approval-rules: dictionaries')

  /* v8 ignore start -- framework-called slot-inject closures; registration
     verified by browser-plugin spec, closures exercised by e2e web snapshots */
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'approval-rule',
    locale: NS,
  }, ApprovalRuleRow))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'approval-rules',
    order: 25,
    label: () => ctx.locale.bind(NS)('nav' satisfies ApprovalRulesKey),
    locale: NS,
    inject: (): ApprovalRulesSectionInjected => {
      const section = new ApprovalRulesSectionController(ctx.approvalRuleSets)
      const sessions = ctx.get('sessions') as ISessions
      return {
        hooks: { approvalRulesSection: section.store },
        load: () => section.load(),
        retry: () => section.retry(),
        startCreate: () => section.startCreate(),
        startEdit: (id: ApprovalRuleId) => section.startEdit(id),
        cancelEdit: () => section.cancelEdit(),
        updateDraft: (patch) => { section.updateDraft(patch) },
        save: () => section.save(),
        revoke: (id: ApprovalRuleId) => section.revoke(id),
        dismissError: () => section.dismissError(),
        readout: {
          readCatalog: async () => {
            const result = await ctx.remote.permissionPresets.catalog()
            if (result.ok) return result.value
            throw new Error(result.error.message)
          },
          refreshProjects: (sessionId: SessionId) => { void sessions.refreshProjections(sessionId) },
        },
      }
    },
  }, ApprovalRulesSection))
  /* v8 ignore stop */
}
