/**
 * Rule-answered transcript projection: folds item 4's durable `approval/decided`
 * audit event (carrying a remembered-rule reference) into one keyed
 * `conversation.chat.node` row per rule-answered tool call. The row surfaces
 * the trust regression's guarantee surface — a remembered rule answered
 * without asking — as a chat line naming the answering rule and, when the rule
 * is not permanent, when it expires.
 */
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Final renderer data for one rule-answered tool call. */
export interface ApprovalRuleAnsweredData {
  /** The answering rule's branded id. */
  readonly ruleId: string
  /** Human-readable rule name rendered verbatim in the row title. */
  readonly name: string
  /** ISO-8601 expiry, when the answering rule is not permanent. */
  readonly expiresAt?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** One remembered rule that answered a permission request. */
    'approval-rule': ApprovalRuleAnsweredData
  }
}

/** Fold state: the rendered data plus the start event's log sequence. */
interface ApprovalRuleState extends ApprovalRuleAnsweredData {
  readonly seq: number
}

/**
 * Rule-answered transcript node: one `conversation.chat.node` row per answered
 * request, matching the `approval/decided` audit record's `rule` reference and
 * keyed by the request identity (each answered call is its own row; the fold
 * rule collapses consecutive-same-rule rows in the render, never the events).
 * The event is appended once per answered request to the Session whose question
 * was decided, so this Session's own decided-with-rule events are the sole
 * source; a request answered interactively (no `rule`) renders nothing here.
 */
export const approvalRuleDefinition: ConversationNodeDefinition<ApprovalRuleState> = {
  kind: 'approval-rule',
  target: 'chat',
  match: (event) => {
    if (event.type !== 'approval/decided') return null
    const rule = event.data.rule
    if (rule === undefined) return null
    return { id: String(event.data.id), role: 'start' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'approval/decided' || match.event.data.rule === undefined) {
      throw new Error('approval-rule start requires approval/decided with a rule')
    }
    const rule = match.event.data.rule
    return {
      ruleId: String(rule.id),
      name: rule.name,
      seq: match.event.seq,
      ...(rule.expiresAt === undefined ? {} : { expiresAt: rule.expiresAt }),
    }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'approval-rule',
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq - 0.1,
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: {
        ruleId: context.state.ruleId,
        name: context.state.name,
        ...(context.state.expiresAt === undefined ? {} : { expiresAt: context.state.expiresAt }),
      },
    }
  },
}
