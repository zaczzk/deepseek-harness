/**
 * Explicit request resolution: one `resolve(request): Spec` step turning a
 * draft into its route, depth sections, and body language. Classification
 * uses purely local deterministic signals so a prediction never costs a
 * model call and cannot fail nondeterministically.
 *
 * @module @deepseek-ai/dsh-enhance/resolve
 */

import { EnhanceError } from './error.ts'
import type {
  EnhanceConfig,
  EnhanceLanguage,
  EnhanceRequest,
  EnhanceRoute,
  EnhanceSpec,
} from './types.ts'

/** Draft characters that mark the body language as Chinese. */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/u

/** Derive the body language from the draft text. */
function detectLanguage(draft: string): EnhanceLanguage {
  return CJK.test(draft) ? 'zh' : 'en'
}

/** Classifier outcome: predicted route plus the rule that selected it. */
interface Classification {
  readonly route: EnhanceRoute
  readonly matchedRule: string
}

/** Classify one non-empty draft with the first matching deterministic signal. */
function classify(draft: string, config: EnhanceConfig): Classification {
  for (const pattern of config.skipPatterns) {
    if (pattern.test(draft)) return { route: 'skip', matchedRule: `skip-pattern:${pattern.source}` }
  }
  const characters = draft.trim().length
  if (characters < config.limits.minDraftCharacters) return { route: 'skip', matchedRule: 'min-draft-characters' }
  if (characters < config.limits.foldBelowCharacters) return { route: 'fold', matchedRule: 'fold-below-characters' }
  if (characters > config.limits.splitAboveCharacters) return { route: 'split', matchedRule: 'split-above-characters' }
  return { route: 'enhance', matchedRule: 'default' }
}

/**
 * Resolve one enhancement request against validated configuration.
 *
 * @param request - draft text and optional depth name.
 * @param config - validated rubric configuration.
 * @returns the frozen resolved specification, in canonical section order.
 * @throws {@link EnhanceError} when the draft is blank or the depth is undeclared.
 */
export function resolveEnhance(request: EnhanceRequest, config: EnhanceConfig): EnhanceSpec {
  if (request.draft.trim().length === 0) {
    throw new EnhanceError('the draft must contain non-whitespace text')
  }
  const depth = request.depth ?? config.defaultDepth
  const sections = Object.hasOwn(config.depths, depth) ? config.depths[depth] : undefined
  if (sections === undefined) {
    throw new EnhanceError(`unknown depth "${depth}"; declare one of: ${Object.keys(config.depths).join(', ')}`)
  }
  const { route, matchedRule } = classify(request.draft, config)
  return Object.freeze({
    route,
    matchedRule,
    depth,
    sections,
    direction: request.direction ?? 'enhance',
    outputLanguage: config.outputLanguage === 'auto' ? detectLanguage(request.draft) : config.outputLanguage,
  })
}
