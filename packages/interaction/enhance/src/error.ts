/**
 * Expected enhancement failures: invalid requests and invalid rubric
 * configuration. Callers may render these directly; anything else is an
 * unexpected implementation failure and propagates.
 *
 * @module @deepseek-ai/dsh-enhance/error
 */

/** Expected request or configuration failure with a directly renderable message. */
export class EnhanceError extends Error {}
