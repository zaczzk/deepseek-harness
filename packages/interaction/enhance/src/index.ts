/**
 * Deterministic prompt-to-task structuring for the `/enhance` command:
 * validated `.dsh/enhance.yml` rubric configuration, one explicit
 * `resolve(request): Spec` step, and the model-free template pipeline that
 * emits the structured task, goal, and todo bundle. Pure functions only;
 * every I/O boundary lives in `@deepseek-ai/dsh-command-enhance`.
 *
 * @module @deepseek-ai/dsh-enhance
 */

export { SECTION_ORDER, dropUncitedLines, validateEnhanceConfig, validateSections } from './config.ts'
export { EnhanceError } from './error.ts'
export { resolveEnhance } from './resolve.ts'
export { renderBundleText, renderEnhance } from './template.ts'
export type * from './types.ts'
