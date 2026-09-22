/**
 * Browser-safe project register grammar shared by the project tabs and the
 * milestone recorder: the `DECISIONS.md` decision-register table, the
 * `ARCHITECTURE.md` Mermaid diagram extraction, diagram fingerprints, and one
 * bounded complete-file text read over the `workspaceFiles` Remote.
 * @module @deepseek-ai/dsh-util-project-register
 */

/** Workspace file holding the current architecture diagram. */
export const ARCHITECTURE_FILE = 'ARCHITECTURE.md'

/** Workspace file holding the decision register table. */
export const REGISTER_FILE = 'DECISIONS.md'

/** Longest register title one row carries; longer titles are cut at the bound. */
export const REGISTER_TITLE_LIMIT = 200

/** What one register row records. */
export type RegisterKind = 'decision' | 'milestone'

/** Lifecycle label one register row carries. */
export type RegisterStatus = 'proposed' | 'accepted' | 'superseded' | 'done'

/** Diagram state recorded at a milestone. */
export type DiagramFlag = 'updated' | 'stale' | 'absent'

/** The diagram evidence recorded on a milestone row. */
export interface DiagramMark {
  /** Diagram state at the milestone. */
  readonly flag: DiagramFlag
  /** Fingerprint of the diagram source at the milestone, when one was recorded. */
  readonly fingerprint: string | null
}

/** One decision-register table row. */
export interface RegisterRow {
  /** Row identity: `D<n>` for a decision, `M<n>` for a milestone. */
  readonly id: string
  /** ISO calendar date (`YYYY-MM-DD`). */
  readonly date: string
  /** What the row records. */
  readonly kind: RegisterKind
  /** Row subject, kept verbatim except for table-breaking characters. */
  readonly title: string
  /** Lifecycle label. */
  readonly status: RegisterStatus
  /** Milestone diagram evidence; null on a decision row. */
  readonly diagram: DiagramMark | null
}

/** Diagram state shown live against the latest milestone record. */
export type DiagramFreshness = 'current' | 'stale' | 'absent'

const REGISTER_HEADER = '| ID | Date | Kind | Title | Status | Diagram |'
const REGISTER_SEPARATOR = '|----|------|------|-------|--------|---------|'
const ID_CELL = /^([DM])(\d+)$/
const DATE_CELL = /^\d{4}-\d{2}-\d{2}$/
const DIAGRAM_CELL = /^([a-z]+)(?:@([0-9a-f]{8}))?$/
const REGISTER_KINDS: readonly RegisterKind[] = ['decision', 'milestone']
const REGISTER_STATUSES: readonly RegisterStatus[] = ['proposed', 'accepted', 'superseded', 'done']
const DIAGRAM_FLAGS: readonly DiagramFlag[] = ['updated', 'stale', 'absent']
const EMPTY_DIAGRAM_CELLS: readonly string[] = ['', '-', '—']

/** The trimmed cells of one Markdown table row, or undefined for any other line. */
function cells(line: string): string[] | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 3) return undefined
  return trimmed.slice(1, -1).split('|').map(cell => cell.trim())
}

/** The exactly-six trimmed cells of one register table line, or undefined for any other line. */
function rowCells(line: string): readonly [string, string, string, string, string, string] | undefined {
  const parts = cells(line)
  return parts === undefined || parts.length !== 6
    ? undefined
    : parts as [string, string, string, string, string, string]
}

/** The diagram evidence of one Diagram cell, or undefined for a malformed cell. */
function diagramMark(cell: string): DiagramMark | null | undefined {
  if (EMPTY_DIAGRAM_CELLS.includes(cell)) return null
  const match = DIAGRAM_CELL.exec(cell)
  if (match === null) return undefined
  const flag = match[1] as DiagramFlag
  if (!DIAGRAM_FLAGS.includes(flag)) return undefined
  return { flag, fingerprint: match[2] ?? null }
}

/** One register row parsed from a table line, or undefined for any other line. */
function parseRow(line: string): RegisterRow | undefined {
  const parts = rowCells(line)
  if (parts === undefined) return undefined
  const [id, date, kind, title, status, diagramCell] = parts
  const diagram = diagramMark(diagramCell)
  if (!ID_CELL.test(id) || !DATE_CELL.test(date) || title === '' || diagram === undefined) return undefined
  if (!REGISTER_KINDS.includes(kind as RegisterKind)) return undefined
  if (!REGISTER_STATUSES.includes(status as RegisterStatus)) return undefined
  return { id, date, kind: kind as RegisterKind, title, status: status as RegisterStatus, diagram }
}

/**
 * Parse every well-formed decision-register row of one register document.
 * Lines outside the table grammar and rows with an unknown kind, status, or
 * Diagram cell are skipped rather than rejected.
 * @param text - the `DECISIONS.md` document.
 * @returns the parsed rows in file order.
 */
export function parseRegister(text: string): RegisterRow[] {
  const rows: RegisterRow[] = []
  for (const line of text.split('\n')) {
    const row = parseRow(line)
    if (row !== undefined) rows.push(row)
  }
  return rows
}

/**
 * Render one register row as its Markdown table line. A title is cut at
 * {@link REGISTER_TITLE_LIMIT} characters, its newlines collapse to spaces, and
 * its `|` characters become `/` so the row stays one table line.
 * @param row - the row to render.
 * @returns the `| … |` line, newline excluded.
 */
export function formatRegisterRow(row: RegisterRow): string {
  const title = row.title.replace(/\s+/g, ' ').trim().replaceAll('|', '/').slice(0, REGISTER_TITLE_LIMIT)
  const diagram = row.diagram === null
    ? '—'
    : row.diagram.fingerprint === null ? row.diagram.flag : `${row.diagram.flag}@${row.diagram.fingerprint}`
  return `| ${row.id} | ${row.date} | ${row.kind} | ${title} | ${row.status} | ${diagram} |`
}

/** Whether one table line is the register's separator row. */
function isSeparator(line: string): boolean {
  const parts = cells(line)
  return parts !== undefined && parts.length === 6 && parts.every(part => /^:?-{3,}:?$/.test(part))
}

/**
 * Append one row to a register document's table. The row lands after the last
 * register row, or after an empty table's separator or header; a document
 * without a register table gets the standard heading and table appended. The
 * result ends with exactly one trailing newline.
 * @param text - the `DECISIONS.md` document, possibly empty.
 * @param row - the row to record.
 * @returns the document with the row appended.
 */
export function appendRegisterRow(text: string, row: RegisterRow): string {
  const line = formatRegisterRow(row)
  const lines = text.split('\n')
  let rowAnchor = -1
  let separatorAnchor = -1
  let headerAnchor = -1
  for (const [index, line] of lines.entries()) {
    const parts = rowCells(line)
    if (parts === undefined) continue
    if (ID_CELL.test(parts[0])) rowAnchor = index
    else if (isSeparator(line)) separatorAnchor = index
    else if (parts[0] === 'ID') headerAnchor = index
  }
  const anchor = rowAnchor >= 0 ? rowAnchor : separatorAnchor >= 0 ? separatorAnchor : headerAnchor
  if (anchor >= 0) {
    lines.splice(anchor + 1, 0, line)
    return `${lines.join('\n').replace(/\n+$/, '')}\n`
  }
  const base = text.trim() === '' ? '' : `${text.replace(/\n+$/, '')}\n\n`
  return `${base}# Decision Register\n\n${REGISTER_HEADER}\n${REGISTER_SEPARATOR}\n${line}\n`
}

/**
 * The next unused row identity of one kind. The scan reads raw table lines so
 * an id already present is never reissued, even when its row is malformed.
 * @param text - the `DECISIONS.md` document, possibly empty.
 * @param kind - the row kind whose identity is minted.
 * @returns `D<n>` or `M<n>` with the smallest unused ordinal.
 */
export function nextRegisterId(text: string, kind: RegisterKind): string {
  const prefix = kind === 'milestone' ? 'M' : 'D'
  let next = 1
  for (const line of text.split('\n')) {
    const first = cells(line)?.[0]
    const match = first === undefined ? null : ID_CELL.exec(first)
    if (match === null || match[1] !== prefix) continue
    const ordinal = Number(match[2])
    if (Number.isSafeInteger(ordinal) && ordinal >= next) next = ordinal + 1
  }
  return `${prefix}${next}`
}

/**
 * The latest milestone row of a parsed register.
 * @param rows - parsed register rows in file order.
 * @returns the last milestone row, or undefined when none exists.
 */
export function latestMilestone(rows: readonly RegisterRow[]): RegisterRow | undefined {
  let latest: RegisterRow | undefined
  for (const row of rows) {
    if (row.kind === 'milestone') latest = row
  }
  return latest
}

/**
 * Extract the current architecture diagram: the source of the first fenced
 * `mermaid` block in the architecture document.
 * @param markdown - the `ARCHITECTURE.md` document.
 * @returns the diagram source, or undefined when the document holds no closed non-empty Mermaid block.
 */
export function diagramSource(markdown: string): string | undefined {
  const lines = markdown.split('\n')
  for (const [index, opener] of lines.entries()) {
    if (!/^```mermaid\s*$/.test(opener.trim())) continue
    const body: string[] = []
    for (const line of lines.slice(index + 1)) {
      if (line.trim() === '```') {
        const source = body.join('\n').trim()
        return source === '' ? undefined : source
      }
      body.push(line)
    }
    return undefined
  }
  return undefined
}

/**
 * Fingerprint one diagram source: an 8-hex-digit FNV-1a hash. Equal sources
 * fingerprint equally across the Host and the browser; it identifies content
 * change only and carries no security value.
 * @param source - the Mermaid diagram source.
 * @returns the lowercase fingerprint.
 */
export function diagramFingerprint(source: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * The diagram state to show now, derived from the current diagram source and
 * the latest milestone's recorded evidence. A recorded `stale` clears as soon
 * as the diagram source differs from the fingerprint it recorded.
 * @param source - the current diagram source, or undefined when absent.
 * @param mark - the latest milestone's diagram evidence, when one exists.
 * @returns `absent` without a diagram, `stale` for an unchanged diagram a milestone recorded as stale, otherwise `current`.
 */
export function diagramFreshness(source: string | undefined, mark: DiagramMark | undefined): DiagramFreshness {
  if (source === undefined) return 'absent'
  if (mark?.flag !== 'stale') return 'current'
  return mark.fingerprint !== null && mark.fingerprint !== diagramFingerprint(source) ? 'current' : 'stale'
}

/** One complete-file text read's outcome. */
export type ProjectTextResult =
  | { readonly ok: true; readonly value: { readonly text: string; readonly version: string } }
  | { readonly ok: false; readonly error: { readonly code: string } }

/** The `workspaceFiles` complete-byte read this package calls, structurally typed. */
export interface WorkspaceBytesRemote {
  readonly workspaceFiles: {
    /**
     * Read one complete file.
     * @param sessionId - the Session whose workspace resolves `path`.
     * @param path - absolute or workspace-relative path.
     * @param options - byte-read options; an empty object reads the complete file.
     * @param signal - cancels the call.
     * @returns the bytes with their version, or the Host's typed failure.
     */
    readBytes(
      sessionId: string,
      path: string,
      options: Readonly<Record<string, unknown>>,
      signal?: AbortSignal,
    ): Promise<{
      readonly ok: boolean
      readonly value?: { readonly version: string; readonly data: Uint8Array }
      readonly error?: { readonly code: string }
    }>
  }
}

/**
 * Read one complete UTF-8 workspace file as text over the `workspaceFiles`
 * Remote. Decoding replaces invalid sequences; the Host still rejects files it
 * reports too large.
 * @param remote - the Remote face carrying `workspaceFiles.readBytes`.
 * @param sessionId - the Session whose workspace resolves `path`.
 * @param path - absolute or workspace-relative path.
 * @param signal - cancels the call.
 * @returns the decoded text with its file version, or the Host's failure code.
 */
export async function readWorkspaceText(
  remote: WorkspaceBytesRemote,
  sessionId: string,
  path: string,
  signal?: AbortSignal,
): Promise<ProjectTextResult> {
  const result = await remote.workspaceFiles.readBytes(sessionId, path, {}, signal)
  if (!result.ok || result.value === undefined) {
    return { ok: false, error: { code: result.error?.code ?? 'workspace-file/not-regular-file' } }
  }
  const text = new TextDecoder('utf-8').decode(result.value.data)
  return { ok: true, value: { text, version: result.value.version } }
}
