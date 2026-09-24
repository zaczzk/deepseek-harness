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

/** Structured goal draft proposed by the preview's goal-bundle depth. */
export interface EnhanceGoalDraft {
  /** Objective text proposed for the goal domain. */
  readonly objective: string
  /** Completion criteria proposed for the goal domain. */
  readonly completionCriteria: readonly string[]
}

/** Available architecture streams. */
export type EnhanceStreamMode = 'prototype' | 'solo' | 'shared'

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
  /** Whether Accept also creates the previewed goal through the goal seam. */
  readonly emitGoal: boolean
  /** Active architecture stream framework. */
  readonly streamMode: EnhanceStreamMode
}

/** Host-reaching collaborators, built in `apply`'s ctx closure. */
export interface EnhanceDeps {
  /** Open the streamed text projection of one draft. */
  stream: (draft: string, depth?: string) => EnhanceStream
  /** Read the composer draft text and revision at one moment. */
  readDraft: () => EnhanceDraft
  /** Subscribe to composer draft-state changes; returns the unsubscriber. */
  watchDraft: (onChange: () => void) => () => void
  /** Resolve the structured goal draft of one draft, when its depth carries one. */
  goalDraft?: (draft: string) => Promise<EnhanceGoalDraft | undefined>
  /** Create one goal through the documented human-authoritative goal seam. */
  createGoal?: (goal: EnhanceGoalDraft) => Promise<void>
  /** Replace the whole draft in one atomic write. */
  setDraft: (text: string) => void
  /** Return keyboard focus to the composer. */
  focus: () => void
}

/** The closed state: no popover, no stream, no text, no goal emission. */
const CLOSED: EnhanceState = Object.freeze({
  open: false,
  status: 'idle',
  original: '',
  text: '',
  emitGoal: false,
  streamMode: 'solo',
})

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

  /** Active architecture stream framework, preserved across requests. */
  private streamMode: EnhanceStreamMode = 'solo'

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

  /**
   * Switch the active architectural framework stream.
   * Re-requests the stream if the preview is currently open.
   */
  setStreamMode(mode: EnhanceStreamMode): void {
    if (this.streamMode === mode) return
    this.streamMode = mode
    const snapshot = this.state.getSnapshot()
    if (snapshot.open) {
      this.request()
    } else {
      this.state.set({ ...snapshot, streamMode: mode })
    }
  }

  /** Open the popover and stream one ghost rewrite of the current draft. */
  request(): void {
    const attempt = this.discard()
    const draft = this.deps.readDraft()
    this.state.set({
      open: true,
      status: 'pending',
      original: draft.text,
      text: '',
      emitGoal: false,
      streamMode: this.streamMode,
    })
    const live: LiveAttempt = {
      attempt,
      original: draft.text,
      rev: draft.rev,
      stream: this.deps.stream(draft.text, this.streamMode),
      unwatch: this.deps.watchDraft(() => { this.keystroke(draft.rev) }),
      text: '',
    }
    this.live = live
    void this.consume(live)
  }

  /** Toggle whether Accept also creates the previewed goal. */
  toggleGoal(): void {
    const snapshot = this.state.getSnapshot()
    if (snapshot.status !== 'ready') return
    this.state.set({ ...snapshot, emitGoal: !snapshot.emitGoal })
  }

  /**
   * Accept the settled text with the single atomic draft replace, optionally
   * creating the previewed goal first through the goal seam. A goal-create
   * failure settles the error tier with the preview retained: the draft is
   * never touched and Accept can retry.
   */
  accept(): void {
    const snapshot = this.state.getSnapshot()
    if (snapshot.status !== 'ready') return
    const attempt = this.attempt
    void this.emitGoalIfNeeded(snapshot).then((created) => {
      if (attempt !== this.attempt || !created) return
      this.discard()
      this.deps.setDraft(snapshot.text)
      this.deps.focus()
    }, () => {
      if (attempt !== this.attempt) return
      this.closeStream()
      this.state.set({ ...snapshot, status: 'error' })
    })
  }

  /**
   * Resolve and create the previewed goal when emission is on.
   * @param snapshot - the settled preview carrying the diffed draft identity.
   * @returns whether the draft may now be replaced.
   */
  private async emitGoalIfNeeded(snapshot: EnhanceState): Promise<boolean> {
    if (!snapshot.emitGoal || this.deps.createGoal === undefined || this.deps.goalDraft === undefined) return true
    const goal = await this.deps.goalDraft(snapshot.original)
    if (goal === undefined) return true
    await this.deps.createGoal(goal)
    return true
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
    this.state.set({ ...CLOSED, streamMode: this.streamMode })
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
        this.state.set({
          open: true,
          status: 'streaming',
          original: live.original,
          text: live.text,
          emitGoal: false,
          streamMode: this.streamMode,
        })
      }
    } catch {
      // A failed stream lands no text: the error tier shows its single line.
      if (live.attempt !== this.attempt) return
      this.closeStream()
      this.state.set({
        open: true,
        status: 'error',
        original: live.original,
        text: '',
        emitGoal: false,
        streamMode: this.streamMode,
      })
      return
    }
    if (live.attempt !== this.attempt) return
    this.closeStream()
    this.state.set({
      open: true,
      status: 'ready',
      original: live.original,
      text: live.text,
      emitGoal: false,
      streamMode: this.streamMode,
    })
  }

  /** Abort instantly on the first draft-revision change while streaming. */
  private keystroke(rev: number): void {
    if (this.deps.readDraft().rev === rev) return
    this.discard()
  }
}
