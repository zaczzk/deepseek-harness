/**
 * Ranked register guidance: parse the project decision register and render a
 * compact, model-facing ranked block for the instruction bundle.
 *
 * @module @deepseek-ai/dsh-agent-instructions/register
 */

import {
  diagramFreshness,
  diagramSource,
  formatRegisterRow,
  latestMilestone,
  parseRegister,
  REGISTER_FILE,
} from '@deepseek-ai/dsh-util-project-register'

/** Project-relative display path of the register guidance candidate. */
export const REGISTER_GUIDANCE_DISPLAY = REGISTER_FILE

/** Table header line rendered before the register rows. */
const REGISTER_GUIDANCE_HEADER = '| ID | Date | Kind | Title | Status | Diagram |'
const REGISTER_GUIDANCE_SEPARATOR = '|----|------|------|-------|--------|---------|'

/**
 * Render the ranked register guidance block for one project register.
 *
 * Rows are rendered verbatim from {@link formatRegisterRow} (the same compact
 * table line the workspace tabs and the milestone recorder use), and the block
 * closes with the latest milestone's diagram freshness line. When the register
 * holds no well-formed rows the block is empty so the candidate contributes
 * nothing once an empty register is present.
 * @param registerText - the `DECISIONS.md` document, or undefined when unreadable.
 * @param architectureText - the `ARCHITECTURE.md` document, or undefined when unreadable.
 * @returns the ranked block, or an empty string when no row is parseable.
 */
export function renderRegisterGuidance(
  registerText: string | undefined,
  architectureText: string | undefined,
): string {
  if (registerText === undefined) return ''
  const rows = parseRegister(registerText)
  if (rows.length === 0) return ''
  const latest = latestMilestone(rows)
  const freshness = diagramFreshness(
    architectureText === undefined ? undefined : diagramSource(architectureText),
    latest?.diagram ?? undefined,
  )
  const lines = [REGISTER_GUIDANCE_HEADER, REGISTER_GUIDANCE_SEPARATOR, ...rows.map(formatRegisterRow)]
  if (latest !== undefined) {
    lines.push(`Latest milestone ${latest.id} (${latest.date}): diagram ${freshness}.`)
  }
  return lines.join('\n')
}
