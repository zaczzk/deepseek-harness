/** Reducing a Mermaid render failure to the one line the canvas shows. */
import { describe, expect, it } from 'vitest'
import { MERMAID_FAILURE_LIMIT, mermaidFailureText } from '../src/client/failure-text.ts'

describe('mermaidFailureText', () => {
  it('keeps the first line as the actionable position', () => {
    const message = 'Parse error on line 4:\ngraph TD\n  A-->\n^^^^^\nExpecting node'

    expect(mermaidFailureText(new Error(message))).toBe('Parse error on line 4:')
  })

  it('collapses runs of whitespace so a caret span stays one line', () => {
    expect(mermaidFailureText(new Error('  Parse   error   on  line 2:'))).toBe('Parse error on line 2:')
  })

  it('bounds a long message with an ellipsis', () => {
    const text = mermaidFailureText(new Error('x'.repeat(MERMAID_FAILURE_LIMIT + 50)))

    expect(text).toBe(`${'x'.repeat(MERMAID_FAILURE_LIMIT)}…`)
  })

  it('stays empty for a message that is blank or not an Error', () => {
    expect(mermaidFailureText(new Error(''))).toBe('')
    expect(mermaidFailureText(new Error('\n\n  '))).toBe('')
    expect(mermaidFailureText('rejected with a string')).toBe('')
    expect(mermaidFailureText(undefined)).toBe('')
  })
})
