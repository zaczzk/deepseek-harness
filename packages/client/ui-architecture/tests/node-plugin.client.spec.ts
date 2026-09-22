/** Node half of the browser-only architecture plugin. */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-architecture node half', () => {
  it('contributes nothing to the host tree', () => {
    expect(apply()).toBeUndefined()
  })
})
