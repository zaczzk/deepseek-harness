/**
 * Rule-answered transcript row: one `conversation.chat.node` line per
 * answered tool call that a remembered approval rule answered. The title
 * names the answering rule (verbatim) and, for a non-permanent rule, its
 * expiry. Every rendered string is a keyed `approval.rules` namespace value.
 */
import { memo } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ApprovalRuleAnsweredData } from './approval-rule-definition.ts'
import type { ApprovalRulesKey } from './locales.ts'
import css from './ApprovalRuleRow.module.css'

type ApprovalRuleRowProps =
  PropsRuntime<'conversation.chat.node', 'approval-rule'>
  & PropsLocale<'approval.rules'>

/** ISO-8601 expiry rendered in the browser's current locale and time zone. */
export function localDate(iso: string): string {
  return new Intl.DateTimeFormat(document.documentElement.lang, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(iso))
}

/**
 * One rule-answered tool call shown in the transcript. The title interpolates
 * the answering rule's name verbatim; a non-permanent rule appends its
 * keyed expiry (`rules.expiry`, with the locale-formatted date) in place of
 * the permanent rule's `rules.noExpiry` line, which the list row keys and
 * the transcript omits for a permanent rule.
 */
export const ApprovalRuleRow = memo(function ApprovalRuleRow({
  node, t,
}: ApprovalRuleRowProps) {
  const data: ApprovalRuleAnsweredData = node.data
  const title = t('transcript.rule', { name: data.name })
  return (
    <div className={css.row} role="group" aria-label={title} data-approval-rule="">
      <span className={css.title}>{title}</span>
      {data.expiresAt === undefined
        ? null
        : <span className={css.expiry}>{t('rules.expiry' satisfies ApprovalRulesKey, { date: localDate(data.expiresAt) })}</span>}
    </div>
  )
})
