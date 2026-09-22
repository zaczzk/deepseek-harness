/** Envelope declaration and log admission of the ignorable Enhance attempt event. */
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  EnhanceAttemptId,
  Session,
  SessionId,
  type EnhanceAttemptEventData,
  type IgnorableEventType,
  type IgnorableIntent,
  type SessionEvent,
} from '@deepseek-ai/dsh-session'

const data: EnhanceAttemptEventData = {
  attemptId: EnhanceAttemptId('attempt-1'),
  system: 'Rewrite the draft bundle toward the draft intent.',
  framedInput: 'Generate the enhanced bundle from this JSON:\n{"text":"draft"}',
  route: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
  rubricConfigHash: 'sha256:11111111',
  contextSliceHash: null,
  maxTokens: 2048,
  disposition: 'refined',
}

describe('enhance/attempt envelope declaration', () => {
  it('requires the envelope marker on the write intent of ignorable event types', () => {
    expectTypeOf<IgnorableEventType>().toEqualTypeOf<'enhance/attempt'>()
    expectTypeOf<IgnorableIntent['ignorable']>().toEqualTypeOf<true>()
    expectTypeOf<SessionEvent<'enhance/attempt'>['data']>().toEqualTypeOf<EnhanceAttemptEventData>()
    expectTypeOf<SessionEvent<'enhance/attempt'>['surfaceOp']>().toEqualTypeOf<undefined>()
  })

  it('records the required marker on append and keeps the record log-only', () => {
    const session = Session.create(SessionId('enhance-append'))
    // @ts-expect-error -- ignorable event types must carry their envelope marker.
    void session.append('enhance/attempt', data)
    const event = session.append('enhance/attempt', data, { ignorable: true })
    expect(event.ignorable).toBe(true)
    expect(event.data).toEqual(data)
    expect(session.surface.nodes).toEqual([])
    expect(session.deriveMessages()).toEqual([])
  })

  it('admits a seed only with its required marker', () => {
    const marked: unknown = { type: 'enhance/attempt', seq: 0, time: 1, data, ignorable: true }
    const session = Session.create(SessionId('enhance-seed'), [marked as SessionEvent])
    expect(session.snapshotEvents()[0]).toEqual(marked)

    const missing: unknown = { type: 'enhance/attempt', seq: 0, time: 1, data }
    expect(() => Session.create(SessionId('enhance-seed-missing'), [missing as SessionEvent]))
      .toThrow(/must carry ignorable: true/)
    const falseMarker: unknown = { type: 'enhance/attempt', seq: 0, time: 1, data, ignorable: false }
    expect(() => Session.create(SessionId('enhance-seed-false'), [falseMarker as SessionEvent]))
      .toThrow(/invalid event envelope/)
  })
})
