/**
 * Web run-comparison plugin, node half.
 *
 * The run-comparison conversation view is browser-only: it reads the
 * session-query roster over the `sessionQueries` Remote, picks two persisted
 * Sessions, and folds the six per-run metrics over their recorded logs in the
 * page.
 */

/** Host plugin body — every contribution lives in the browser half. */
export function apply(): void {}