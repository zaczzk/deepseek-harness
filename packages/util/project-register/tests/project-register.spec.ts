/** Register grammar, diagram extraction, fingerprints, and complete-file text reads. */
import { describe, expect, it } from 'vitest'
import {
  ARCHITECTURE_FILE, REGISTER_FILE, appendRegisterRow, diagramFingerprint, diagramFreshness,
  diagramSource, formatRegisterRow, latestMilestone, nextRegisterId, parseRegister,
  readWorkspaceText, type RegisterRow, type WorkspaceBytesRemote,
} from '../src/index.ts'

const ROW: RegisterRow = {
  id: 'M1', date: '2026-09-21', kind: 'milestone', title: 'Architecture freeze',
  status: 'done', diagram: { flag: 'stale', fingerprint: '0a1b2c3d' },
}
const DECISION: RegisterRow = {
  id: 'D1', date: '2026-09-20', kind: 'decision', title: 'File-backed registers',
  status: 'accepted', diagram: null,
}

describe('register grammar', () => {
  it('names the two workspace files', () => {
    expect(ARCHITECTURE_FILE).toBe('ARCHITECTURE.md')
    expect(REGISTER_FILE).toBe('DECISIONS.md')
  })

  it('round-trips a row through its table line', () => {
    const line = formatRegisterRow(ROW)
    expect(line).toBe('| M1 | 2026-09-21 | milestone | Architecture freeze | done | stale@0a1b2c3d |')
    expect(parseRegister(line)).toEqual([ROW])
    expect(parseRegister(formatRegisterRow(DECISION))).toEqual([DECISION])
  })

  it('renders a bare flag and an em dash', () => {
    expect(formatRegisterRow({ ...ROW, diagram: { flag: 'absent', fingerprint: null } }))
      .toBe('| M1 | 2026-09-21 | milestone | Architecture freeze | done | absent |')
    expect(formatRegisterRow(DECISION).endsWith('| — |')).toBe(true)
  })

  it('cuts a title at the bound and folds its whitespace and pipes', () => {
    const line = formatRegisterRow({ ...DECISION, title: `a\n| b |${'x'.repeat(300)}` })
    expect(line).toBe(`| D1 | 2026-09-20 | decision | a / b /${'x'.repeat(193)} | accepted | — |`)
  })

  it('parses rows in file order and skips lines outside the grammar', () => {
    const text = [
      '# Decision Register', '',
      '| ID | Date | Kind | Title | Status | Diagram |',
      '|----|------|------|-------|--------|---------|',
      formatRegisterRow(DECISION),
      'prose between rows',
      formatRegisterRow(ROW),
      '| D2 | 2026-09-21 | verdict | bad kind | accepted | — |',
      '| D3 | 2026-09-21 | decision | bad status | shipped | — |',
      '| D4 | 2026-09-21 | decision | bad diagram | accepted | stale@zz |',
      '| D5 | 2026-09-21 | decision |  | accepted | — |',
      '| D6 | 21-09-2026 | decision | bad date | accepted | — |',
      '| D7 | 2026-09-21 | decision | ok | accepted | — | extra |',
    ].join('\n')
    expect(parseRegister(text)).toEqual([DECISION, ROW])
  })

  it('appends to an existing table and mints the next identity from raw lines', () => {
    const text = appendRegisterRow(`${formatRegisterRow(DECISION)}\nbad | M9 | row\n`, ROW)
    const lines = text.split('\n')
    expect(lines[0]).toBe(formatRegisterRow(DECISION))
    expect(lines[1]).toBe(formatRegisterRow(ROW))
    expect(lines[2]).toBe('bad | M9 | row')
    expect(nextRegisterId(text, 'milestone')).toBe('M2')
    expect(nextRegisterId(text, 'decision')).toBe('D2')
    expect(nextRegisterId(text, 'decision')).toBe('D2')
  })

  it('reuses an id already on a malformed row', () => {
    expect(nextRegisterId('| M3 | x | y | z | w | v |', 'milestone')).toBe('M4')
  })

  it('appends after an empty table separator or header', () => {
    const emptyTable = [
      '| ID | Date | Kind | Title | Status | Diagram |',
      '|----|------|------|-------|--------|---------|',
    ].join('\n')
    expect(appendRegisterRow(emptyTable, DECISION)).toBe(`${emptyTable}\n${formatRegisterRow(DECISION)}\n`)
    const headerOnly = '| ID | Date | Kind | Title | Status | Diagram |'
    expect(appendRegisterRow(headerOnly, DECISION)).toBe(`${headerOnly}\n${formatRegisterRow(DECISION)}\n`)
  })

  it('creates the register block in an empty document and after prose', () => {
    const created = appendRegisterRow('', DECISION)
    expect(created).toBe([
      '# Decision Register', '',
      '| ID | Date | Kind | Title | Status | Diagram |',
      '|----|------|------|-------|--------|---------|',
      formatRegisterRow(DECISION), '',
    ].join('\n'))
    const afterProse = appendRegisterRow('notes\n', ROW)
    expect(afterProse.startsWith('notes\n\n# Decision Register\n')).toBe(true)
    expect(afterProse.endsWith(`${formatRegisterRow(ROW)}\n`)).toBe(true)
  })

  it('finds the latest milestone row', () => {
    const rows = parseRegister([formatRegisterRow(ROW), formatRegisterRow(DECISION), formatRegisterRow({ ...ROW, id: 'M2' })].join('\n'))
    expect(latestMilestone(rows)?.id).toBe('M2')
    expect(latestMilestone(parseRegister(formatRegisterRow(DECISION)))).toBeUndefined()
  })
})

describe('diagram extraction and fingerprints', () => {
  it('returns the first closed non-empty Mermaid block', () => {
    const markdown = ['# Architecture', '', '```mermaid', 'graph TD;', '  A-->B', '```', '', '```mermaid', 'x', '```'].join('\n')
    expect(diagramSource(markdown)).toBe('graph TD;\n  A-->B')
  })

  it('returns undefined for no block, an empty block, or an unclosed block', () => {
    expect(diagramSource('# Architecture')).toBeUndefined()
    expect(diagramSource('```mermaid\n\n```')).toBeUndefined()
    expect(diagramSource('```mermaid\ngraph TD;')).toBeUndefined()
  })

  it('fingerprints equal sources equally and differs on change', () => {
    expect(diagramFingerprint('graph TD; A-->B')).toBe(diagramFingerprint('graph TD; A-->B'))
    expect(diagramFingerprint('graph TD; A-->B')).toMatch(/^[0-9a-f]{8}$/)
    expect(diagramFingerprint('graph TD; A-->B')).not.toBe(diagramFingerprint('graph TD; A-->C'))
    expect(diagramFingerprint('')).toBe(diagramFingerprint(''))
  })

  it('derives live freshness from the recorded milestone evidence', () => {
    const source = 'graph TD; A-->B'
    const fingerprint = diagramFingerprint(source)
    expect(diagramFreshness(undefined, undefined)).toBe('absent')
    expect(diagramFreshness(source, undefined)).toBe('current')
    expect(diagramFreshness(source, { flag: 'updated', fingerprint })).toBe('current')
    expect(diagramFreshness(source, { flag: 'stale', fingerprint })).toBe('stale')
    expect(diagramFreshness('graph TD; A-->C', { flag: 'stale', fingerprint })).toBe('current')
    expect(diagramFreshness(source, { flag: 'stale', fingerprint: null })).toBe('stale')
  })
})

describe('complete-file text reads', () => {
  function remote(result: Awaited<ReturnType<WorkspaceBytesRemote['workspaceFiles']['readBytes']>>): WorkspaceBytesRemote {
    const readBytes = () => Promise.resolve(result)
    return { workspaceFiles: { readBytes } }
  }

  it('decodes the bytes with their version', async () => {
    const data = new TextEncoder().encode('héllo\n')
    await expect(readWorkspaceText(remote({ ok: true, value: { version: 'v1', data } }), 's', 'DECISIONS.md'))
      .resolves.toEqual({ ok: true, value: { text: 'héllo\n', version: 'v1' } })
  })

  it('reports the Host failure code and a result without a value', async () => {
    await expect(readWorkspaceText(remote({ ok: false, error: { code: 'workspace-file/not-found' } }), 's', 'x.md'))
      .resolves.toEqual({ ok: false, error: { code: 'workspace-file/not-found' } })
    await expect(readWorkspaceText(remote({ ok: false }), 's', 'x.md'))
      .resolves.toEqual({ ok: false, error: { code: 'workspace-file/not-regular-file' } })
    await expect(readWorkspaceText(remote({ ok: true }), 's', 'x.md'))
      .resolves.toEqual({ ok: false, error: { code: 'workspace-file/not-regular-file' } })
  })
})
