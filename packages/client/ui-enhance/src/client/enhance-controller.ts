/**
 * Per-composer Enhance controller: one handle shared by the button and
 * preview registrations in `apply`, holding the transient streaming state and
 * the only verbs that reach the enhance Remote and the session input facade.
 * The draft is never written except by `accept`, which performs the single
 * atomic `setDraft` replace of the complete settled text. Every other exit —
 * `dismiss`, Escape, an outside pointer, a keystroke in the draft, or a
 * superseding request — aborts the stream and discards the overlay leaving
 * the draft byte-identical.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { EnhancePreviewChunk } from '@deepseek-ai/dsh-enhance-runtime'

/** Composer draft facts read from the input facade at one moment. */
export interface EnhanceDraft {
  /** Clipboard-projection draft text. */
  readonly text: string
  /** Monotonic editor revision; a change while streaming aborts the stream. */
  readonly rev: number
}

/** Cancellation-aware downlink of one streamed preview (the Remote stream handle face). */
export interface EnhanceStream extends AsyncIterable<EnhancePreviewChunk> {
  /** Cancel the logical stream and end the downlink quietly. */
  dispose(): void
}

/** Published preview state of one composer's Enhance flow. */
export interface EnhanceState {
  /** Whether the preview popover is open. */
  readonly open: boolean
  /** Lifecycle tier of the current stream. */
  readonly status: 'idle' | 'pending' | 'streaming' | 'ready' | 'error'
  /** Draft captured at request time, diffed against the settled text. */
  readonly original: string
  /** Streamed text painted so far; the complete rewrite once ready. */
  readonly text: string
}

/** Host-reaching collaborators, built in `apply`'s ctx closure. */
export interface EnhanceDeps {
  /** Open the streamed text projection of one draft. */
  stream: (draft: string) => EnhanceStream
  /** Read the composer draft text and revision at one moment. */
  readDraft: () => EnhanceDraft
  /** Subscribe to composer draft-state changes; returns the unsubscriber. */
  watchDraft: (onChange: () => void) => () => void
  /** Replace the whole draft in one atomic write. */
  setDraft: (text: string) => void
  /** Return keyboard focus to the composer. */
  focus: () => void
}

/** The closed state: no popover, no stream, no text. */
const CLOSED: EnhanceState = Object.freeze({ open: false, status: 'idle', original: '', text: '' })

/** One in-flight streamed attempt before it settles or is discarded. */
interface LiveAttempt {
  /** Stale-attempt token; a superseded attempt never lands. */
  readonly attempt: number
  /** Draft text the stream rewrites and the diff base at ready. */
  readonly original: string
  /** Draft revision captured at request time; a change aborts. */
  readonly rev: number
  /** Open stream handle; disposed on every exit. */
  readonly stream: EnhanceStream
  /** Drop the draft-change watcher. */
  readonly unwatch: () => void
  /** Text accumulated from landed chunks. */
  text: string
}

/** Transient Enhance flow controller for one composer. */
export class EnhanceController {
  /** Identity-stable state store observed by both registrations. */
  readonly state: SnapshotStore<EnhanceState>

  /** Host-reaching collaborators. */
  private readonly deps: EnhanceDeps

  /** Monotonic token so a stale attempt never lands over a newer one. */
  private attempt = 0

  /** The in-flight stream, dropped at every settle or discard. */
  private live: LiveAttempt | null = null

  /**
   * Create one controller over its host collaborators.
   * @param deps - stream open, draft read/watch, atomic draft write, and focus restore.
   */
  constructor(deps: EnhanceDeps) {
    this.deps = deps
    // raf flush: one frame's worth of streamed chunks paints as one update.
    this.state = createSnapshotStore<EnhanceState>(CLOSED, { flush: 'raf' })
  }

  /** Open the popover and stream one ghost rewrite of the current draft. */
  request(): void {
    const attempt = this.discard()
    const draft = this.deps.readDraft()
    this.state.set({ open: true, status: 'pending', original: draft.text, text: '' })
    const live: LiveAttempt = {
      attempt,
      original: draft.text,
      rev: draft.rev,
      stream: this.deps.stream(draft.text),
      unwatch: this.deps.watchDraft(() => { this.keystroke(draft.rev) }),
      text: '',
    }
    this.live = live
    void this.consume(live)
  }

  /** Accept the settled text with the single atomic draft replace. */
  accept(): void {
    const { status, text } = this.state.getSnapshot()
    this.discard()
    if (status !== 'ready') return
    this.deps.setDraft(text)
    this.deps.focus()
  }

  /** Abort the stream and dismiss the popover without touching the draft. */
  dismiss(): void {
    this.discard()
    this.deps.focus()
  }

  /**
   * Abort the in-flight attempt, drop its stream and watcher, and close the
   * popover without touching the draft.
   * @returns the fresh stale-attempt token owned by the next request.
   */
  private discard(): number {
    this.attempt += 1
    this.closeStream()
    this.state.set(CLOSED)
    return this.attempt
  }

  /** Dispose the live stream and drop its draft watcher. */
  private closeStream(): void {
    const live = this.live
    if (live === null) return
    this.live = null
    live.unwatch()
    live.stream.dispose()
  }

  /** Land chunks as one growing ghost, then settle complete or fail. */
  private async consume(live: LiveAttempt): Promise<void> {
    try {
      for await (const chunk of live.stream) {
        if (live.attempt !== this.attempt) return
        live.text += chunk.text
        this.state.set({ open: true, status: 'streaming', original: live.original, text: live.text })
      }
    } catch {
      // A failed stream lands no text: the error tier shows its single line.
      if (live.attempt !== this.attempt) return
      this.closeStream()
      this.state.set({ open: true, status: 'error', original: live.original, text: '' })
      return
    }
    if (live.attempt !== this.attempt) return
    this.closeStream()
    this.state.set({ open: true, status: 'ready', original: live.original, text: live.text })
  }

  /** Abort instantly on the first draft-revision change while streaming. */
  private keystroke(rev: number): void {
    if (this.deps.readDraft().rev === rev) return
    this.discard()
  }
}
