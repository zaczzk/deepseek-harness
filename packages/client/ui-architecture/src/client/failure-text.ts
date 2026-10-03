/**
 * Reducing a Mermaid render failure to the one line the canvas can show. Kept
 * apart from the renderer so the asynchronous face, which never renders, can
 * reduce a failure without pulling the renderer and its Mermaid bundle in.
 */

/**
 * Longest failure line shown beside the tab's failure sentence. Mermaid reports
 * the offending source and a caret span over several lines; the first line
 * names the error and its position, which is what points at the edit.
 */
export const MERMAID_FAILURE_LIMIT = 200

/**
 * Reduce a render failure to the single actionable line the canvas shows.
 * @param error - the thrown value; anything without a message reduces to an
 * empty string, which the view treats as an absent detail.
 * @returns the first line, whitespace-collapsed and bounded, with an ellipsis
 * when the bound cut it.
 */
export function mermaidFailureText(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const newline = message.indexOf('\n')
  const first = newline === -1 ? message : message.slice(0, newline)
  const line = first.replace(/\s+/g, ' ').trim()
  return line.length <= MERMAID_FAILURE_LIMIT
    ? line
    : `${line.slice(0, MERMAID_FAILURE_LIMIT)}…`
}
