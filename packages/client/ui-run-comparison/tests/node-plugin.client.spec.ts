// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { apply as nodeApply } from '../src/index.ts'

describe('ui-run-comparison node half', () => {
  it('host plugin body is a no-op (the run comparison renders only in the browser)', () => {
    // The view reads the session-query roster over the Client Remote and folds
    // metrics in the page; nothing runs in the host process.
    const ctx = {} as never
    expect(() => nodeApply(ctx)).not.toThrow()
  })
})