/**
 * Type vocabulary for deterministic prompt enhancement: the validated
 * rubric configuration, the resolved request specification, and the
 * structured bundle the template pipeline emits.
 *
 * @module @deepseek-ai/dsh-enhance/types
 */

/** Closed section vocabulary that a depth selects from. */
export type EnhanceSectionId =
  | 'objective'
  | 'context'
  | 'constraints'
  | 'acceptance'
  | 'verification'
  | 'doneLooksLike'
  | 'goal'
  | 'todos'

/** Deterministic route prediction for one draft. */
export type EnhanceRoute = 'skip' | 'enhance' | 'split' | 'fold'

/** Rewrite direction: expand the draft into a task, or compact it to its core. */
export type EnhanceDirection = 'enhance' | 'compact'

/** Enhancement body language. Chrome copy is locale-owned by consumers. */
export type EnhanceLanguage = 'en' | 'zh'

/** One configured design principle the template cites verbatim. */
export interface EnhancePrinciple {
  /** Citation id appearing in constraint lines as `[principle:<id>]`. */
  readonly id: string
  /** Verbatim principle text copied into the bundle. */
  readonly text: string
}

/** Goal draft proposed at `goal` depth; emission is a separate human-authoritative step. */
export interface EnhanceGoalDraft {
  /** Objective text proposed for the goal domain. */
  readonly objective: string
  /** Completion criteria proposed for the goal domain. */
  readonly completionCriteria: readonly string[]
}

/**
 * Structured task, goal, and todo output of the template pipeline. Optional
 * members are absent when the resolved depth does not select their section,
 * except `context`, which is also absent when the draft carries none.
 */
export interface EnhanceSections {
  /** One-paragraph task objective derived from the draft. */
  readonly objective: string
  /** Remaining draft paragraphs, verbatim. */
  readonly context?: string
  /** Cited constraint lines: `[principle:<id>] <text>`. */
  readonly constraints?: readonly string[]
  /** Acceptance criteria without list markers. Never empty. */
  readonly acceptance: readonly string[]
  /** Verification steps without list markers. */
  readonly verification?: readonly string[]
  /** Done-criteria lines followed by the localized score instruction. */
  readonly doneLooksLike?: readonly string[]
  /** Goal draft proposed at `goal` depth. */
  readonly goal?: EnhanceGoalDraft
  /** Todo seeds without list markers. */
  readonly todos?: readonly string[]
}

/**
 * Golden input/output pair doubling as few-shot anchors for a later model
 * stage and as template-stage goldens for keyless tests.
 */
export interface EnhanceExample {
  /** Example draft. */
  readonly input: string
  /** Expected structured sections for the example. */
  readonly sections: EnhanceSections
}

/** Caps and thresholds for the deterministic classifier. */
export interface EnhanceLimits {
  /** Drafts shorter than this many characters route `skip`. */
  readonly minDraftCharacters: number
  /** Drafts shorter than this many characters route `fold`. */
  readonly foldBelowCharacters: number
  /** Drafts longer than this many characters route `split`. */
  readonly splitAboveCharacters: number
  /** Maximum accepted example pairs. */
  readonly maxExamples: number
}

/** Validated `.dsh/enhance.yml` contents. */
export interface EnhanceConfig {
  /** Principles the template cites verbatim into constraint lines. */
  readonly principles: readonly EnhancePrinciple[]
  /** Validated example pairs, in file order. */
  readonly examples: readonly EnhanceExample[]
  /** Compiled skip patterns, in file order. */
  readonly skipPatterns: readonly RegExp[]
  /** Classifier thresholds and caps. */
  readonly limits: EnhanceLimits
  /** Depth name to emitted section set. */
  readonly depths: Readonly<Record<string, readonly EnhanceSectionId[]>>
  /** Depth used when a request names none. */
  readonly defaultDepth: string
  /** `auto` derives the body language from the draft. */
  readonly outputLanguage: 'auto' | EnhanceLanguage
}

/** Caller input for one enhancement. */
export interface EnhanceRequest {
  /** Draft text to structure. Must contain non-whitespace characters. */
  readonly draft: string
  /** Depth name; when absent, {@link EnhanceConfig.defaultDepth} applies. */
  readonly depth?: string
  /** Rewrite direction; when absent, {@link resolveEnhance} resolves `enhance`. */
  readonly direction?: EnhanceDirection
}

/** Resolved request: route, depth sections, direction, and body language. */
export interface EnhanceSpec {
  /** Predicted route for the draft. */
  readonly route: EnhanceRoute
  /** Classifier rule that selected the route, for logs and UI. */
  readonly matchedRule: string
  /** Resolved depth name. */
  readonly depth: string
  /** Sections the resolved depth emits, in canonical render order. */
  readonly sections: readonly EnhanceSectionId[]
  /** Resolved rewrite direction. */
  readonly direction: EnhanceDirection
  /** Resolved body language. */
  readonly outputLanguage: EnhanceLanguage
}

/** Resolved request plus the emitted structured bundle. */
export interface EnhanceBundle {
  /** The resolved request specification. */
  readonly spec: EnhanceSpec
  /** The emitted structured sections. */
  readonly sections: EnhanceSections
}
