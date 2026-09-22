/**
 * Pure milestone logic: transition detection against the previously observed
 * todo list, marker matching, diagram flags from the architecture document and
 * the previous mark, the milestone date, and register-row minting.
 */
import { describe, expect, it } from 'vitest'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/types'
import { diagramFingerprint, type DiagramMark, type RegisterRow } from '@deepseek-ai/dsh-util-project-register'
import {
  completedMilestones, milestoneDate, milestoneDiagram, milestoneRow, type MilestonePlan,
} from '../src/record.ts'

const item = (content: string, status: TodoItem['status']): TodoItem => ({ content, status })

const ARCHITECTURE = '# Architecture\n\n```mermaid\nflowchart LR\n  A --> B\n```\n'
const DIAGRAM_SOURCE = 'flowchart LR\n  A --> B'

describe('completedMilestones', () => {
  it('records nothing when no previous list was observed', () => {
    expect(completedMilestones(undefined, [item('milestone: Ship', 'completed')], 'milestone:')).toEqual([])
  })

  it('records the title when a milestone completes between two observed lists', () => {
    const previous = [item('milestone: Land core', 'pending')]
    const next = [item('milestone: Land core', 'completed')]
    expect(completedMilestones(previous, next, 'milestone:')).toEqual(['Land core'])
  })

  it('records a milestone that turns completed from in_progress', () => {
    const previous = [item('milestone: Land core', 'in_progress')]
    const next = [item('milestone: Land core', 'completed')]
    expect(completedMilestones(previous, next, 'milestone:')).toEqual(['Land core'])
  })

  it('records a milestone absent from the previous list', () => {
    const previous = [item('milestone: Other', 'pending')]
    const next = [item('milestone: Other', 'pending'), item('milestone: New', 'completed')]
    expect(completedMilestones(previous, next, 'milestone:')).toEqual(['New'])
  })

  it('does not record a milestone the previous list already completed', () => {
    const done = [item('milestone: Ship', 'completed')]
    expect(completedMilestones(done, done, 'milestone:')).toEqual([])
  })

  it('keeps waiting while a milestone is not completed', () => {
    for (const status of ['pending', 'in_progress'] as const) {
      const list = [item('milestone: Ship', status)]
      expect(completedMilestones(list, list, 'milestone:')).toEqual([])
    }
  })

  it('matches the marker case-insensitively on trimmed content and trims the title', () => {
    const previous = [item('  MiLeStOnE:   Ship It  ', 'pending')]
    const next = [item('  MiLeStOnE:   Ship It  ', 'completed')]
    expect(completedMilestones(previous, next, 'milestone:')).toEqual(['Ship It'])
  })

  it('skips items whose content does not start with the marker', () => {
    const previous = [item('prepare milestone: Ship', 'pending'), item('todo: Ship', 'pending')]
    const next = [item('prepare milestone: Ship', 'completed'), item('todo: Ship', 'completed')]
    expect(completedMilestones(previous, next, 'milestone:')).toEqual([])
  })

  it('skips a milestone whose title is empty', () => {
    const previous = [item('milestone:', 'pending'), item('milestone:   ', 'pending')]
    const next = [item('milestone:', 'completed'), item('milestone:   ', 'completed')]
    expect(completedMilestones(previous, next, 'milestone:')).toEqual([])
  })

  it('records several newly completed milestones in list order', () => {
    const previous = [item('milestone: First', 'pending'), item('milestone: Second', 'pending'), item('plain', 'pending')]
    const next = [item('milestone: First', 'completed'), item('milestone: Second', 'completed'), item('plain', 'completed')]
    expect(completedMilestones(previous, next, 'milestone:')).toEqual(['First', 'Second'])
  })

  it('honors a custom marker', () => {
    const previous = [item('milestone: Ignored', 'pending'), item('@done Renovate', 'pending')]
    const next = [item('milestone: Ignored', 'completed'), item('@done Renovate', 'completed')]
    expect(completedMilestones(previous, next, '@done')).toEqual(['Renovate'])
  })
})

describe('milestoneDiagram', () => {
  it('reports absent without an architecture document', () => {
    expect(milestoneDiagram(undefined, null)).toEqual({ flag: 'absent', fingerprint: null })
  })

  it('reports absent when the document holds no Mermaid block', () => {
    expect(milestoneDiagram('# Architecture\n', null)).toEqual({ flag: 'absent', fingerprint: null })
  })

  it('reports absent for an unclosed or empty Mermaid block', () => {
    expect(milestoneDiagram('```mermaid\nflowchart LR\n', null)).toEqual({ flag: 'absent', fingerprint: null })
    expect(milestoneDiagram('```mermaid\n```\n', null)).toEqual({ flag: 'absent', fingerprint: null })
  })

  it('reports updated with the diagram fingerprint when no previous mark exists', () => {
    expect(milestoneDiagram(ARCHITECTURE, null)).toEqual({ flag: 'updated', fingerprint: diagramFingerprint(DIAGRAM_SOURCE) })
  })

  it('reports stale when the previous mark recorded the same fingerprint', () => {
    const fingerprint = diagramFingerprint(DIAGRAM_SOURCE)
    for (const flag of ['updated', 'stale'] as const) {
      expect(milestoneDiagram(ARCHITECTURE, { flag, fingerprint })).toEqual({ flag: 'stale', fingerprint })
    }
  })

  it('reports updated when the diagram changed since the previous mark', () => {
    const previous: DiagramMark = { flag: 'stale', fingerprint: '00000000' }
    expect(milestoneDiagram(ARCHITECTURE, previous)).toEqual({ flag: 'updated', fingerprint: diagramFingerprint(DIAGRAM_SOURCE) })
  })

  it('reports updated for a hand-written previous mark without a fingerprint', () => {
    expect(milestoneDiagram(ARCHITECTURE, { flag: 'stale', fingerprint: null }))
      .toEqual({ flag: 'updated', fingerprint: diagramFingerprint(DIAGRAM_SOURCE) })
  })
})

describe('milestoneDate', () => {
  it('formats the UTC calendar date', () => {
    expect(milestoneDate(new Date('2026-03-09T23:59:59.999Z'))).toBe('2026-03-09')
    expect(milestoneDate(new Date('2026-03-10T00:00:00.000Z'))).toBe('2026-03-10')
  })

  it('always formats as YYYY-MM-DD', () => {
    expect(milestoneDate(new Date(0))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(milestoneDate(new Date(0))).toBe('1970-01-01')
  })
})

describe('milestoneRow', () => {
  it('mints M1 on an empty document and carries every milestone field', () => {
    expect(milestoneRow('', 'Land core', 'absent', null, '2026-01-02')).toEqual({
      id: 'M1', date: '2026-01-02', kind: 'milestone', title: 'Land core', status: 'done',
      diagram: { flag: 'absent', fingerprint: null },
    })
  })

  it('mints the next milestone identity past existing milestone rows', () => {
    const existing = [
      '| ID | Date | Kind | Title | Status | Diagram |',
      '|----|------|------|-------|--------|---------|',
      '| M1 | 2026-01-01 | milestone | First | done | absent |',
    ].join('\n')
    expect(milestoneRow(existing, 'Second', 'updated', 'deadbeef', '2026-01-02').id).toBe('M2')
  })

  it('does not let a decision row consume the milestone identity', () => {
    const existing = [
      '| ID | Date | Kind | Title | Status | Diagram |',
      '|----|------|------|-------|--------|---------|',
      '| D1 | 2026-01-01 | decision | Choose | accepted | — |',
    ].join('\n')
    expect(milestoneRow(existing, 'First', 'absent', null, '2026-01-02').id).toBe('M1')
  })

  it('carries the diagram evidence verbatim', () => {
    const row: RegisterRow = milestoneRow('', 'Ship', 'updated', 'deadbeef', '2026-01-02')
    expect(row.diagram).toEqual({ flag: 'updated', fingerprint: 'deadbeef' })
    const plan: MilestonePlan = { title: 'Ship', ...row.diagram! }
    expect(plan).toEqual({ title: 'Ship', flag: 'updated', fingerprint: 'deadbeef' })
  })
})
