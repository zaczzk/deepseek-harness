/**
 * Project-milestone transcript projection: folds item 8's durable
 * `project/milestone` session event into one keyed `conversation.chat.node`
 * row per committed milestone. The event is appended once to the Session whose
 * register row committed, so this Session's own milestone events are the sole
 * source — a milestone minted by another Session's register never enters this
 * transcript and renders no placeholder here (that surface is item 9's
 * register row, which labels the figure unavailable instead).
 */
import type {} from '@deepseek-ai/dsh-project-register/src/types.ts'
import type { MilestoneRowId } from '@deepseek-ai/dsh-project-register/src/types.ts'
import type { DiagramMark } from '@deepseek-ai/dsh-util-project-register'
import type {
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

/** Final renderer data for one committed milestone. */
export interface MilestoneNodeData {
  /** The row's branded `M<n>` identity, interpolated verbatim into `node.title`. */
  readonly id: MilestoneRowId
  /** The milestone title, exactly as recorded in the row. */
  readonly title: string
  /** The diagram evidence recorded with the row; null without a diagram source. */
  readonly diagram: DiagramMark | null
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** One committed project register milestone. */
    'milestone': MilestoneNodeData
  }
}

/** Fold state: the rendered data plus the start event's log sequence. */
interface MilestoneState extends MilestoneNodeData {
  readonly seq: number
}

/** Project-milestone transcript node: one row per committed milestone. */
export const milestoneDefinition: ConversationNodeDefinition<MilestoneState> = {
  kind: 'milestone',
  target: 'chat',
  match: event => event.type === 'project/milestone'
    ? { id: String(event.data.id), role: 'start' }
    : null,
  start: (_context, match) => {
    if (match.event.type !== 'project/milestone') {
      throw new Error('milestone start requires project/milestone')
    }
    return {
      id: match.event.data.id,
      title: match.event.data.title,
      diagram: match.event.data.diagram,
      seq: match.event.seq,
    }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'milestone',
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq - 0.1,
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: {
        id: context.state.id,
        title: context.state.title,
        diagram: context.state.diagram,
      },
    }
  },
}
