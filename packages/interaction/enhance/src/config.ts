/**
 * Rubric configuration validation at the `.dsh/enhance.yml` parser boundary.
 * Every violation is collected and reported at once so a misconfigured
 * deployment fails loud at load with an actionable list.
 *
 * @module @deepseek-ai/dsh-enhance/config
 */

import { EnhanceError } from './error.ts'
import type {
  EnhanceConfig,
  EnhanceExample,
  EnhanceLanguage,
  EnhanceLimits,
  EnhancePrinciple,
  EnhanceSectionId,
  EnhanceSections,
} from './types.ts'

/**
 * Canonical section render order. Depths select subsets of this list, and
 * every rendered bundle follows exactly this order.
 */
export const SECTION_ORDER: readonly EnhanceSectionId[] = Object.freeze([
  'objective',
  'context',
  'constraints',
  'acceptance',
  'verification',
  'doneLooksLike',
  'goal',
  'todos',
])

/** Section ids accepted by a depth or an example. */
const SECTION_IDS: ReadonlySet<string> = new Set<string>(SECTION_ORDER)

/** Citation prefix of one constraint line: `[principle:<id>] <text>`. */
const CITATION_PREFIX = '[principle:'

/** Identifier grammar for principle ids and depth names. */
const IDENTIFIER = /^[a-z][a-z0-9-]*$/u

/**
 * Whether one constraint line cites a configured principle with non-blank
 * text, exactly in the `[principle:<id>] <text>` grammar.
 */
function citesPrinciple(line: unknown, principleIds: ReadonlySet<string>): boolean {
  if (typeof line !== 'string' || !line.startsWith(CITATION_PREFIX)) return false
  const close = line.indexOf(']')
  if (close <= CITATION_PREFIX.length) return false
  const id = line.slice(CITATION_PREFIX.length, close)
  return IDENTIFIER.test(id) && principleIds.has(id) && isText(line.slice(close + 1))
}

/** Whether a value is a plain record, not an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a value is a string with non-whitespace content. */
function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Whether a value is an array of strings with non-whitespace content. */
function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isText)
}

/**
 * Validate one candidate bundle against the shared section rules.
 *
 * @param sections - untrusted structured sections (configuration or model JSON).
 * @param principleIds - configured principle ids a constraint line may cite.
 * @returns every violated rule, empty when the sections are valid.
 */
export function validateSections(sections: unknown, principleIds: ReadonlySet<string>): readonly string[] {
  if (!isRecord(sections)) return ['sections: must be an object']
  const violations: string[] = []
  for (const key of Object.keys(sections)) {
    if (!SECTION_IDS.has(key)) violations.push(`sections: unknown section "${key}"`)
  }
  if (!isText(sections['objective'])) {
    violations.push('sections.objective: must be non-empty text')
  }
  if (sections['context'] !== undefined && !isText(sections['context'])) {
    violations.push('sections.context: must be non-empty text when present')
  }
  const constraints = sections['constraints']
  if (constraints !== undefined) {
    if (!Array.isArray(constraints) || constraints.length === 0) {
      violations.push('sections.constraints: must be a non-empty array when present')
    } else {
      for (const [index, line] of constraints.entries()) {
        if (!citesPrinciple(line, principleIds)) {
          violations.push(`sections.constraints[${index}]: must cite a configured principle as [principle:<id>] <text>`)
        }
      }
    }
  }
  if (!isTextList(sections['acceptance'])) {
    violations.push('sections.acceptance: must be a non-empty array of non-blank strings')
  }
  if (sections['verification'] !== undefined && !isTextList(sections['verification'])) {
    violations.push('sections.verification: must be a non-empty array of non-blank strings when present')
  }
  if (sections['doneLooksLike'] !== undefined && !isTextList(sections['doneLooksLike'])) {
    violations.push('sections.doneLooksLike: must be a non-empty array of non-blank strings when present')
  }
  if (sections['todos'] !== undefined && !isTextList(sections['todos'])) {
    violations.push('sections.todos: must be a non-empty array of non-blank strings when present')
  }
  const goal = sections['goal']
  if (goal !== undefined) {
    if (!isRecord(goal)) {
      violations.push('sections.goal: must be an object when present')
    } else {
      if (!isText(goal['objective'])) violations.push('sections.goal.objective: must be non-empty text')
      if (!isTextList(goal['completionCriteria'])) {
        violations.push('sections.goal.completionCriteria: must be a non-empty array of non-blank strings')
      }
    }
  }
  return violations
}

/**
 * Keep only constraint lines that cite a configured principle, for use on
 * model-produced output at the bundle boundary. Uncited lines are dropped,
 * never rewritten.
 *
 * @param lines - candidate plain-text lines from a refinement stage.
 * @param principleIds - configured principle ids a line may cite.
 * @returns the cited lines in their original order.
 */
export function dropUncitedLines(lines: readonly string[], principleIds: ReadonlySet<string>): readonly string[] {
  return lines.filter(line => citesPrinciple(line, principleIds))
}

/**
 * Validate one untrusted rubric configuration and resolve it to typed values.
 *
 * @param raw - parsed YAML content of `.dsh/enhance.yml`.
 * @returns the frozen validated configuration with compiled skip patterns.
 * @throws {@link EnhanceError} listing every violated rule.
 */
export function validateEnhanceConfig(raw: unknown): EnhanceConfig {
  if (!isRecord(raw)) throw new EnhanceError('invalid enhance configuration: the document must be an object')
  const violations: string[] = []
  for (const key of Object.keys(raw)) {
    if (!['principles', 'examples', 'skipPatterns', 'limits', 'depths', 'defaultDepth', 'outputLanguage'].includes(key)) {
      violations.push(`configuration: unknown field "${key}"`)
    }
  }

  const principles: EnhancePrinciple[] = []
  const principleIds = new Set<string>()
  const rawPrinciples = raw['principles']
  if (!Array.isArray(rawPrinciples) || rawPrinciples.length === 0) {
    violations.push('principles: must be a non-empty array')
  } else {
    for (const [index, entry] of rawPrinciples.entries()) {
      if (!isRecord(entry) || !isText(entry['id']) || !IDENTIFIER.test(entry['id']) || !isText(entry['text'])) {
        violations.push(`principles[${index}]: must be { id: <lowercase identifier>, text: <non-empty text> }`)
        continue
      }
      const id = entry['id']
      if (principleIds.has(id)) {
        violations.push(`principles[${index}]: duplicate id "${id}"`)
        continue
      }
      principleIds.add(id)
      principles.push({ id, text: entry['text'] })
    }
    if (principles.length === 0) violations.push('principles: must contain at least one valid principle')
  }

  const skipPatterns: RegExp[] = []
  const rawPatterns = raw['skipPatterns']
  if (!Array.isArray(rawPatterns)) {
    violations.push('skipPatterns: must be an array of regular-expression strings')
  } else {
    for (const [index, entry] of rawPatterns.entries()) {
      if (typeof entry !== 'string' || entry.length === 0) {
        violations.push(`skipPatterns[${index}]: must be a non-empty regular-expression string`)
        continue
      }
      try {
        skipPatterns.push(new RegExp(entry, 'u'))
      } catch {
        violations.push(`skipPatterns[${index}]: not a valid regular expression: ${entry}`)
      }
    }
  }

  let limits: EnhanceLimits | undefined
  const rawLimits = raw['limits']
  if (!isRecord(rawLimits)) {
    violations.push('limits: must be an object with minDraftCharacters, foldBelowCharacters, splitAboveCharacters, maxExamples')
  } else {
    const fields = ['minDraftCharacters', 'foldBelowCharacters', 'splitAboveCharacters', 'maxExamples'] as const
    const values: Record<string, number> = {}
    for (const field of fields) {
      const value = rawLimits[field]
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        violations.push(`limits.${field}: must be ${field === 'maxExamples' ? 'a non-negative' : 'a positive'} safe integer`)
        continue
      }
      const allowed = field === 'maxExamples' ? value >= 0 : value >= 1
      if (!allowed) {
        violations.push(`limits.${field}: must be ${field === 'maxExamples' ? 'a non-negative' : 'a positive'} safe integer`)
        continue
      }
      values[field] = value
    }
    if (Object.keys(values).length === fields.length) {
      const min = values['minDraftCharacters'] as number
      const fold = values['foldBelowCharacters'] as number
      const split = values['splitAboveCharacters'] as number
      if (min > fold || fold > split) {
        violations.push('limits: must satisfy minDraftCharacters <= foldBelowCharacters <= splitAboveCharacters')
      } else {
        limits = { minDraftCharacters: min, foldBelowCharacters: fold, splitAboveCharacters: split, maxExamples: values['maxExamples'] as number }
      }
    }
  }

  const depths: Record<string, readonly EnhanceSectionId[]> = {}
  const rawDepths = raw['depths']
  if (!isRecord(rawDepths) || Object.keys(rawDepths).length === 0) {
    violations.push('depths: must be an object with at least one depth')
  } else {
    for (const [name, entry] of Object.entries(rawDepths)) {
      if (!IDENTIFIER.test(name)) {
        violations.push(`depths.${name}: depth name must be a lowercase identifier`)
        continue
      }
      const seen = new Set<string>()
      const selected: EnhanceSectionId[] = []
      if (!Array.isArray(entry) || entry.length === 0) {
        violations.push(`depths.${name}: must be a non-empty array of section ids`)
      } else {
        for (const section of entry) {
          if (typeof section !== 'string' || !SECTION_IDS.has(section)) {
            violations.push(`depths.${name}: unknown section "${String(section)}"`)
            continue
          }
          if (seen.has(section)) {
            violations.push(`depths.${name}: duplicate section "${section}"`)
            continue
          }
          seen.add(section)
          selected.push(section as EnhanceSectionId)
        }
        if (!seen.has('objective') || !seen.has('acceptance')) {
          violations.push(`depths.${name}: must include the objective and acceptance sections`)
        }
      }
      if (selected.length > 0) depths[name] = SECTION_ORDER.filter(section => seen.has(section))
    }
  }

  const rawDefaultDepth = raw['defaultDepth']
  if (typeof rawDefaultDepth !== 'string' || !Object.hasOwn(depths, rawDefaultDepth)) {
    violations.push('defaultDepth: must name a declared depth')
  }

  const rawLanguage = raw['outputLanguage']
  const language: EnhanceLanguage | 'auto' | undefined = rawLanguage === 'auto' || rawLanguage === 'en' || rawLanguage === 'zh'
    ? rawLanguage
    : undefined
  if (language === undefined) violations.push('outputLanguage: must be "auto", "en", or "zh"')

  const examples: EnhanceExample[] = []
  const rawExamples = raw['examples']
  if (rawExamples !== undefined) {
    if (!Array.isArray(rawExamples)) {
      violations.push('examples: must be an array of { input, sections } pairs')
    } else {
      if (limits !== undefined && rawExamples.length > limits.maxExamples) {
        violations.push(`examples: must contain at most limits.maxExamples (${limits.maxExamples}) pairs`)
      }
      for (const [index, entry] of rawExamples.entries()) {
        if (!isRecord(entry) || !isText(entry['input'])) {
          violations.push(`examples[${index}]: must be { input: <non-empty text>, sections: <validated sections> }`)
          continue
        }
        const sectionViolations = validateSections(entry['sections'], principleIds)
        if (sectionViolations.length > 0) {
          violations.push(...sectionViolations.map(violation => `examples[${index}].${violation}`))
          continue
        }
        examples.push({ input: entry['input'], sections: entry['sections'] as EnhanceSections })
      }
    }
  }

  if (violations.length > 0) {
    throw new EnhanceError(`invalid enhance configuration:\n- ${violations.join('\n- ')}`)
  }
  /* v8 ignore next 8 -- every branch above rejects the invalid shapes these narrowed casts stand on */
  return Object.freeze({
    principles: Object.freeze(principles),
    examples: Object.freeze(examples),
    skipPatterns: Object.freeze(skipPatterns),
    limits: Object.freeze(limits as EnhanceLimits),
    depths: Object.freeze(depths),
    defaultDepth: rawDefaultDepth as string,
    outputLanguage: language as EnhanceLanguage | 'auto',
  })
}
