/**
 * The deterministic template pipeline: structured bundle rendering plus its
 * plain-text projection. This stage needs no model call and doubles as the
 * keyless test double for the whole enhancement flow. All body text is
 * package-owned and pinned verbatim by tests and the package README.
 *
 * @module @deepseek-ai/dsh-enhance/template
 */

import type {
  EnhanceBundle,
  EnhanceConfig,
  EnhanceLanguage,
  EnhanceRequest,
  EnhanceSections,
  EnhanceSpec,
} from './types.ts'

/** Stable localized verification line appended at `verification` depth. */
const VERIFICATION_LINE: Readonly<Record<EnhanceLanguage, string>> = Object.freeze({
  en: 'Confirm every acceptance criterion is satisfied before reporting completion.',
  zh: '报告完成前确认每条验收标准均已满足。',
})

/** Stable localized score instruction appended at `doneLooksLike` depth. */
const SCORE_LINE: Readonly<Record<EnhanceLanguage, string>> = Object.freeze({
  en: 'Report each criterion as <criterion>: met or unmet.',
  zh: '逐条报告：<criterion>：met 或 unmet。',
})

/** Localized section headings of the plain-text projection. */
const HEADINGS: Readonly<Record<EnhanceLanguage, Readonly<Record<string, string>>>> = Object.freeze({
  en: Object.freeze({
    objective: 'Objective',
    context: 'Context',
    constraints: 'Constraints',
    acceptance: 'Acceptance criteria',
    verification: 'Verification',
    doneLooksLike: 'Done looks like',
    goal: 'Goal',
    completion: 'Completion criteria',
    todos: 'Todos',
  }),
  zh: Object.freeze({
    objective: '目标',
    context: '背景',
    constraints: '约束',
    acceptance: '验收标准',
    verification: '验证',
    doneLooksLike: '完成时的样子',
    goal: '任务目标',
    completion: '完成标准',
    todos: '待办',
  }),
})

/**
 * Split one paragraph into sentence-like units for acceptance criteria and
 * todo seeds. A paragraph with no sentence terminators becomes one unit.
 */
function sentences(paragraph: string): readonly string[] {
  const pieces = paragraph.match(/[^.!?。！？]+[.!?。！？]*/gu) ?? []
  const units = pieces.map(piece => piece.trim()).filter(piece => piece.length > 0)
  return units.length > 0 ? units : [paragraph]
}

/**
 * Render the structured bundle for one resolved request from its draft.
 *
 * @param request - the request `resolveEnhance` resolved.
 * @param spec - the resolved specification selecting sections and language.
 * @param config - validated rubric configuration supplying principle text.
 * @returns the frozen structured bundle in canonical section order.
 */
export function renderEnhance(request: EnhanceRequest, spec: EnhanceSpec, config: EnhanceConfig): EnhanceBundle {
  const paragraphs = request.draft.trim().split(/\n[ \t]*\n+/u)
  /* v8 ignore next -- String.split always yields at least one element */
  const objective = (paragraphs[0] ?? '').replace(/\s+/gu, ' ').trim()
  const rest = paragraphs.slice(1).filter(paragraph => paragraph.trim().length > 0)
  const criteria = sentences(objective)
  const selected = new Set<string>(spec.direction === 'compact' ? ['objective', 'acceptance'] : spec.sections)
  const sections: EnhanceSections = {
    objective,
    ...selected.has('context') && rest.length > 0 ? { context: rest.join('\n\n') } : {},
    ...selected.has('constraints')
      ? { constraints: config.principles.map(principle => `[principle:${principle.id}] ${principle.text}`) }
      : {},
    acceptance: criteria,
    ...selected.has('verification') ? { verification: [VERIFICATION_LINE[spec.outputLanguage]] } : {},
    ...selected.has('doneLooksLike')
      ? { doneLooksLike: [...criteria, SCORE_LINE[spec.outputLanguage]] }
      : {},
    ...selected.has('goal') ? { goal: { objective, completionCriteria: criteria } } : {},
    ...selected.has('todos') ? { todos: criteria } : {},
  }
  return Object.freeze({ spec, sections })
}

/**
 * Project one bundle to its plain-text form with localized headings.
 *
 * @param bundle - the bundle to project.
 * @returns the section blocks separated by blank lines.
 */
export function renderBundleText(bundle: EnhanceBundle): string {
  const headings = HEADINGS[bundle.spec.outputLanguage]
  const heading = (key: string): string => {
    /* v8 ignore next -- both heading tables carry every key used below */
    return headings[key] ?? key
  }
  const { sections } = bundle
  const blocks: string[] = [`${heading('objective')}:\n${sections.objective}`]
  if (sections.context !== undefined) blocks.push(`${heading('context')}:\n${sections.context}`)
  if (sections.constraints !== undefined && sections.constraints.length > 0) {
    blocks.push(`${heading('constraints')}:\n${sections.constraints.map(line => `- ${line}`).join('\n')}`)
  }
  blocks.push(`${heading('acceptance')}:\n${sections.acceptance.map(line => `- [ ] ${line}`).join('\n')}`)
  if (sections.verification !== undefined && sections.verification.length > 0) {
    blocks.push(`${heading('verification')}:\n${sections.verification.map(line => `- ${line}`).join('\n')}`)
  }
  if (sections.doneLooksLike !== undefined && sections.doneLooksLike.length > 0) {
    blocks.push(`${heading('doneLooksLike')}:\n${sections.doneLooksLike.map(line => `- ${line}`).join('\n')}`)
  }
  if (sections.goal !== undefined) {
    blocks.push(`${heading('goal')}:\n${sections.goal.objective}\n${heading('completion')}:\n${sections.goal.completionCriteria.map(line => `- ${line}`).join('\n')}`)
  }
  if (sections.todos !== undefined && sections.todos.length > 0) {
    blocks.push(`${heading('todos')}:\n${sections.todos.map(line => `- ${line}`).join('\n')}`)
  }
  return blocks.join('\n\n')
}
