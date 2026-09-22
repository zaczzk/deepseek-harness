/**
 * Node half of `@deepseek-ai/dsh-client-ui-enhance`: the browser bundle lives
 * in `./client`. No Host-side behavior is registered here.
 *
 * @module @deepseek-ai/dsh-client-ui-enhance
 */

/** Plugin name for Loader composition; the client half carries all behavior. */
export const name = 'client-ui-enhance'

/**
 * Empty Host entry: this package's behavior is browser-only.
 * @returns nothing.
 */
export function apply(): void {}
