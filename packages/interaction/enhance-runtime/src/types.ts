/**
 * Wire vocabulary of the enhance Remote face. Remote boundary types live on
 * this public type subpath so generated codecs reference them without rooting
 * through the package entry.
 *
 * @module @deepseek-ai/dsh-enhance-runtime/types
 */

import type {
  EnhanceDirection,
  EnhanceLanguage,
  EnhanceRoute,
  EnhanceSections,
} from '@deepseek-ai/dsh-enhance/types'

/** One preview request from a composer or command surface. */
export interface EnhancePreviewRequest {
  /** Draft text to structure. */
  readonly draft: string
  /** Depth name; the rubric's defaultDepth applies when absent. */
  readonly depth?: string
  /** Rewrite direction; `enhance` applies when absent. */
  readonly direction?: EnhanceDirection
}

/** One progressive text delta of a streamed preview's plain-text projection. */
export interface EnhancePreviewChunk {
  /** Text appended to the projection so far. */
  readonly text: string
}

/** Resolved preview: classifier facts, structured sections, and rendered text. */
export interface EnhancePreviewResult {
  /** Predicted route for the draft. */
  readonly route: EnhanceRoute
  /** Classifier rule that selected the route. */
  readonly matchedRule: string
  /** Resolved depth name. */
  readonly depth: string
  /** Resolved rewrite direction. */
  readonly direction: EnhanceDirection
  /** Resolved body language. */
  readonly outputLanguage: EnhanceLanguage
  /** Structured sections in canonical render order. */
  readonly sections: EnhanceSections
  /** Plain-text projection of the sections. */
  readonly text: string
}
