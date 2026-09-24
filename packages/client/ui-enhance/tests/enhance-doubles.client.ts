/**
 * Collaborator doubles shared by the ui-enhance specs: one controllable
 * streamed downlink per opened stream, a live draft with revision-accurate
 * keystroke notifications, and recorded atomic draft writes and focus
 * restores.
 */
import type { EnhanceDeps, EnhanceStream } from '../src/client/enhance-controller.ts'
import type { EnhancePreviewChunk } from '@deepseek-ai/dsh-enhance-runtime'

/** One pushed chunk, one failure, or the quiet end of a stream double. */
type Step = { readonly text: string } | { readonly reason: Error } | { readonly end: true }

/** Controllable stream double driving chunk, failure, and end delivery. */
export interface StreamDouble {
  /** The handle handed to the controller. */
  readonly stream: EnhanceStream
  /**
   * Queue one text chunk, delivered to a waiting pull or the next one.
   * @param text - chunk text.
   */
  push(text: string): void
  /**
   * Fail the stream at the next pull.
   * @param reason - failure carried to the consumer.
   */
  fail(reason: Error): void
  /** End the stream quietly at the next pull. */
  end(): void
  /** @returns how many times the controller disposed the handle. */
  disposals(): number
}

/**
 * Build one controllable stream double.
 * @returns the handle plus its delivery controls.
 */
export function streamDouble(): StreamDouble {
  const queued: Step[] = []
  const waiters: Array<(step: Step) => void> = []
  let finished = false
  let disposals = 0
  const deliver = (step: Step): void => {
    const waiter = waiters.shift()
    if (waiter === undefined) queued.push(step)
    else waiter(step)
  }
  const stream: EnhanceStream = {
    dispose: () => {
      disposals += 1
      if (finished) return
      finished = true
      deliver({ end: true })
    },
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise<IteratorResult<EnhancePreviewChunk>>((resolve, reject) => {
        const take = (step: Step): void => {
          if ('text' in step) resolve({ done: false, value: { text: step.text } })
          else if ('reason' in step) reject(step.reason)
          else resolve({ done: true, value: undefined })
        }
        const step = queued.shift()
        if (step !== undefined) {
          take(step)
          return
        }
        if (finished) {
          resolve({ done: true, value: undefined })
          return
        }
        waiters.push(take)
      }),
      return: () => {
        finished = true
        return Promise.resolve({ done: true as const, value: undefined })
      },
    }),
  }
  return {
    stream,
    push: (text) => { deliver({ text }) },
    fail: (reason) => {
      finished = true
      deliver({ reason })
    },
    end: () => {
      finished = true
      deliver({ end: true })
    },
    disposals: () => disposals,
  }
}

/** Stream request call facts recorded by EnhanceDoubles. */
export interface StreamCall {
  /** Draft text passed to stream. */
  readonly draft: string
  /** Depth/streamMode passed to stream. */
  readonly depth?: string | undefined
}

/** Recorded collaborators and live controls of one {@link enhanceDoubles} bench. */
export interface EnhanceDoubles {
  /** The dependency face under test. */
  readonly deps: EnhanceDeps
  /** Recorded atomic draft writes, in request order. */
  readonly writes: string[]
  /** Streams opened through `deps.stream`, in request order. */
  readonly streams: StreamDouble[]
  /** Recorded stream call arguments. */
  readonly streamCalls: StreamCall[]
  /** @returns how many times focus was restored to the composer. */
  focusCount(): number
  /** Deliver one draft keystroke: revision bump plus its notification. */
  keystroke(): void
  /** Deliver one draft-state notification without a revision move. */
  nudge(): void
  /** @returns how many draft watchers were dropped. */
  unwatches(): number
  /** @returns the draft text the doubles currently hold. */
  draft(): string
}

/**
 * Build one controller-dependency bench over collaborator doubles.
 * @param initial - initial draft text; the revision starts at 1.
 * @returns the dependency face and its recorded controls.
 */
export function enhanceDoubles(initial: string): EnhanceDoubles {
  const writes: string[] = []
  const streams: StreamDouble[] = []
  const streamCalls: StreamCall[] = []
  const watchers = new Set<() => void>()
  const draft = { text: initial, rev: 1 }
  let focusCount = 0
  let unwatchCount = 0
  return {
    deps: {
      stream: (text: string, depth?: string) => {
        streamCalls.push({ draft: text, depth })
        const double = streamDouble()
        streams.push(double)
        return double.stream
      },
      readDraft: () => ({ text: draft.text, rev: draft.rev }),
      watchDraft: (onChange) => {
        watchers.add(onChange)
        return () => {
          unwatchCount += 1
          watchers.delete(onChange)
        }
      },
      setDraft: (text) => {
        writes.push(text)
        draft.text = text
      },
      focus: () => { focusCount += 1 },
    },
    writes,
    streams,
    streamCalls,
    focusCount: () => focusCount,
    keystroke: () => {
      draft.rev += 1
      for (const watcher of [...watchers]) watcher()
    },
    nudge: () => { for (const watcher of [...watchers]) watcher() },
    unwatches: () => unwatchCount,
    draft: () => draft.text,
  }
}
