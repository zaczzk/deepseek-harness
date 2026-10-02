// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ConversationNodeDefinition, ConversationViewDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode, ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  chatViewDefinition,
} from '@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { MilestoneRowId } from '@deepseek-ai/dsh-project-register/src/types.ts'
import { MilestoneView } from '../src/client/MilestoneView.tsx'
import { milestoneDefinition } from '../src/client/milestone-definition.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] {
    return [milestoneDefinition]
  }

  fallbackEntry(): undefined {
    return undefined
  }
}

class TestViewDefinitions {
  entries(): readonly ConversationViewDefinition[] {
    return [chatViewDefinition]
  }
}

function entry(seq: number, type: string, data: unknown): SessionEvent {
  return { seq, time: 1_700_000_000_000 + seq, type, data } as unknown as SessionEvent
}

function snapshot(entries: readonly SessionEvent[]): ChatSnapshot {
  const assembler = new ConversationNodeAssembler(
    new TestEventDefinitions(), new TestViewDefinitions(),
  ) as unknown as ConversationNodeAssembler
  const window = entries.map(event => ({ type: 'event', event }))
  ;(assembler as unknown as { replaceWindow(entries: readonly unknown[], hasMore?: boolean): void }).replaceWindow(window, false)
  ;(assembler as unknown as { activateTarget(target: string): void }).activateTarget('chat')
  const value = (assembler as unknown as { snapshot(target: string): ChatSnapshot | undefined }).snapshot('chat')
  if (value === undefined) throw new Error('chat view was not registered')
  return value
}

function node(value: ChatSnapshot, kind: string): ChatConversationViewNode | undefined {
  return value.nodes.values().find(candidate => candidate.kind === kind)
}

describe('milestone transcript projection', () => {
  it('builds one milestone Chat Node per committed project/milestone event and ignores other events', () => {
    const milestone = entry(3, 'project/milestone', {
      id: 'M1', title: 'First milestone', diagram: { flag: 'updated', fingerprint: 'a1b2c3d4' },
    })
    const unrelated = entry(2, 'assistant/message', { content: [] })
    const value = snapshot([unrelated, milestone])

    const found = node(value, 'milestone')
    expect(found).toMatchObject({
      anchorSeq: 2.9,
      target: 'chat',
      data: { id: 'M1', title: 'First milestone', diagram: { flag: 'updated', fingerprint: 'a1b2c3d4' } },
    })
    expect(milestoneDefinition.match(unrelated)).toBeNull()
  })

  it('keeps the Definition total across start, update, and buildViewNode fallbacks', () => {
    const event = entry(4, 'project/milestone', {
      id: 'M2', title: 'Ship baseline', diagram: { flag: 'stale', fingerprint: null },
    })
    const match = { event, role: 'start' as const, location: { kind: 'session' as const } }
    const state = milestoneDefinition.start({} as never, match as never, {} as never)

    expect(state).toMatchObject({ id: 'M2', title: 'Ship baseline', diagram: { flag: 'stale', fingerprint: null }, seq: 4 })
    expect(milestoneDefinition.update({ state } as never, match as never)).toBe(state)
    expect(milestoneDefinition.buildViewNode!({ state: undefined } as never)).toBeNull()
    expect(milestoneDefinition.buildViewNode!({
      key: 'milestone:M2', id: 'M2', state, start: undefined,
    } as never)).toMatchObject({ location: { kind: 'unresolved' } })

    const other = entry(5, 'assistant/message', { content: [] })
    expect(() => milestoneDefinition.start({} as never, {
      event: other, role: 'start', location: { kind: 'session' },
    } as never, {} as never)).toThrow('milestone start requires project/milestone')
  })

  it('renders an updated diagram mark with title, tooltip, and aria', () => {
    const t = makeTranslate(zh, commonZh)
    const view = render(<MilestoneView node={{
      key: 'milestone:M1',
      data: { id: 'M1' as MilestoneRowId, title: 'First milestone', diagram: { flag: 'updated', fingerprint: 'a1b2c3d4' } },
    } as never} t={t} />)
    const group = view.getByRole('group', { name: '里程碑 M1：First milestone' })
    expect(group.textContent).toContain('里程碑 M1：First milestone')
    const mark = group.querySelector<HTMLElement>('[data-milestone-mark="updated"]')
    expect(mark?.textContent).toBe('已更新')
    expect(mark?.getAttribute('aria-label')).toBe('图表')
    expect(mark?.getAttribute('aria-description')).toBe('图表标记：已更新')
  })

  it('renders a null diagram as the none mark with no tooltip', () => {
    const t = makeTranslate(zh, commonZh)
    const view = render(<MilestoneView node={{
      key: 'milestone:M2',
      data: { id: 'M2' as MilestoneRowId, title: 'No diagram', diagram: null },
    } as never} t={t} />)
    const group = view.getByRole('group', { name: '里程碑 M2：No diagram' })
    const mark = group.querySelector<HTMLElement>('[data-milestone-mark="none"]')
    expect(mark?.textContent).toBe('无图表')
    expect(mark?.getAttribute('aria-label')).toBeNull()
    expect(mark?.getAttribute('aria-description')).toBeNull()
  })
})
