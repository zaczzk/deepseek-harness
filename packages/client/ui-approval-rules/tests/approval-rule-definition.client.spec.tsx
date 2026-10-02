// @vitest-environment jsdom
/**
 * Rules of the rule-answered transcript projection: the Definition matches
 * only `approval/decided` records carrying a `rule`, keeps the fold
 * deterministic over the event log, and names one keyed Chat Node per
 * answered call; the row renders the answering rule (and its expiry for a
 * non-permanent rule) through the `approval.rules` dictionary.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
import { ApprovalRuleRow } from '../src/client/ApprovalRuleRow.tsx'
import { approvalRuleDefinition } from '../src/client/approval-rule-definition.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

type ApprovalRuleRowProps = Parameters<typeof ApprovalRuleRow>[0]

/** Full row props with the required Chat owner-currency stubs (ui-skill props() precedent). */
function rowProps(data: ApprovalRuleRowProps['node']['data']): ApprovalRuleRowProps {
  const t = makeTranslate(zh, commonZh)
  return {
    node: { key: 'approval-rule:r', data },
    t,
    openSkill: vi.fn(),
    openFile: vi.fn(),
    inspectCall: undefined,
    forkAt: vi.fn(),
    loadImage: vi.fn(),
    renderMessageImages: vi.fn(),
    fileMentions: vi.fn(),
  } as unknown as ApprovalRuleRowProps
}

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] {
    return [approvalRuleDefinition]
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

describe('rule-answered transcript projection', () => {
  it('builds one approval-rule Chat Node per decided-with-rule event and ignores other events', () => {
    const decided = entry(3, 'approval/decided', {
      id: 'r1', outcome: 'allowed-once', rule: { id: 'rule-1', name: 'Save files' },
    })
    const unrelated = entry(2, 'assistant/message', { content: [] })
    const value = snapshot([unrelated, decided])

    const found = node(value, 'approval-rule')
    expect(found).toMatchObject({
      target: 'chat',
      data: { ruleId: 'rule-1', name: 'Save files' },
    })
    expect(approvalRuleDefinition.match(unrelated)).toBeNull()
  })

  it('ignores a decided event with no answering rule (interactive answer)', () => {
    const decided = entry(4, 'approval/decided', { id: 'r2', outcome: 'rejected' })
    const value = snapshot([decided])
    expect(node(value, 'approval-rule')).toBeUndefined()
  })

  it('keeps the Definition total across start, update, and buildViewNode fallbacks', () => {
    const event = entry(5, 'approval/decided', {
      id: 'r3', outcome: 'allowed-once', rule: { id: 'rule-2', name: 'Read file', expiresAt: '2027-01-01T00:00:00.000Z' },
    })
    const match = { event, role: 'start' as const, location: { kind: 'session' as const } }
    const state = approvalRuleDefinition.start({} as never, match as never, {} as never)

    expect(state).toMatchObject({ ruleId: 'rule-2', name: 'Read file', expiresAt: '2027-01-01T00:00:00.000Z', seq: 5 })
    expect(approvalRuleDefinition.update({ state } as never, match as never)).toBe(state)
    expect(approvalRuleDefinition.buildViewNode!({ state: undefined } as never)).toBeNull()
    expect(approvalRuleDefinition.buildViewNode!({
      key: 'approval-rule:r3', id: 'r3', state, start: undefined,
    } as never)).toMatchObject({ location: { kind: 'unresolved' } })

    const other = entry(6, 'assistant/message', { content: [] })
    expect(() => approvalRuleDefinition.start({} as never, {
      event: other, role: 'start', location: { kind: 'session' },
    } as never, {} as never)).toThrow('approval-rule start requires approval/decided with a rule')
  })

  it('renders a permanent answering rule with no expiry line', () => {
    document.documentElement.lang = 'zh-CN'
    const view = render(<ApprovalRuleRow {...rowProps({ ruleId: 'rule-1', name: 'Save files' })} />)
    const group = view.getByRole('group', { name: '规则 Save files 应答' })
    expect(group.textContent).toBe('规则 Save files 应答')
    expect(group.hasAttribute('data-approval-rule')).toBe(true)
  })

  it('renders a non-permanent rule with its keyed expiry', () => {
    document.documentElement.lang = 'zh-CN'
    const view = render(<ApprovalRuleRow {...rowProps({ ruleId: 'rule-2', name: 'Read file', expiresAt: '2027-01-01T00:00:00.000Z' })} />)
    const group = view.getByRole('group', { name: '规则 Read file 应答' })
    expect(group.hasAttribute('data-approval-rule')).toBe(true)
    expect(group.textContent).toContain('到期')
  })
})