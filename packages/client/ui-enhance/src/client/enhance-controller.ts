/**
 * Per-composer Enhance controller: one handle shared by the button and
 * preview registrations in `apply`, holding the transient preview state and
 * the only verbs that reach the enhance Remote and the session input facade.
 * The draft is never written except by `accept`, which performs the single
 * atomic `setDraft` replace; `dismiss` touches nothing.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { EnhancePreviewResult } from '@deepseek-ai/dsh-enhance-runtime'

/** Published preview state of one composer's Enhance flow. */
export interface EnhanceState {
  /** Whether the preview popover is open. */
  readonly open: boolean
  /** Lifecycle tier of the current preview. */
  readonly status: 'idle' | 'pending' | 'ready' | 'error'
  /** Draft captured at request time, diffed against the preview. */
  readonly original: string
  /** Structured preview result while ready. */
  readonly preview: EnhancePreviewResult | null
}

/** Host-reaching collaborators, built in `apply`'s ctx closure. */
export interface EnhanceDeps {
  /** Resolve one deterministic preview through the enhance Remote. */
  preview: (draft: string) => Promise<EnhancePreviewResult>
  /** Read the current draft text. */
  readDraft: () => string
  /** Replace the whole draft in one atomic write. */
  setDraft: (text: string) => void
  /** Return keyboard focus to the composer. */
  focus: () => void
}

/** Transient Enhance flow controller for one composer. */
export class EnhanceController {
  /** Identity-stable state store observed by both registrations. */
  readonly state: SnapshotStore<EnhanceState>

  /** Host-reaching collaborators. */
  private readonly deps: EnhanceDeps

  /** Monotonic token so a stale response never lands over a newer request. */
  private attempt = 0

  /**
   * Create one controller over its host collaborators.
   * @param deps - Remote preview, draft read, atomic draft write, and focus restore.
   */
  constructor(deps: EnhanceDeps) {
    this.deps = deps
    this.state = createSnapshotStore<EnhanceState>({ open: false, status: 'idle', original: '', preview: null })
  }

  /** Open the popover and request one preview of the current draft. */
  request(): void {
    this.attempt += 1
    const attempt = this.attempt
    const original = this.deps.readDraft()
    this.state.set({ open: true, status: 'pending', original, preview: null })
    void this.deps.preview(original).then((preview) => {
      if (attempt !== this.attempt) return
      this.state.set({ open: true, status: 'ready', original, preview })
    }, () => {
      if (attempt !== this.attempt) return
      this.state.set({ open: true, status: 'error', original, preview: null })
    })
  }

  /** Accept the previewed text with the single atomic draft replace. */
  accept(): void {
    const { preview } = this.state.getSnapshot()
    this.attempt += 1
    this.state.set({ open: false, status: 'idle', original: '', preview: null })
    if (preview === null) return
    this.deps.setDraft(preview.text)
    this.deps.focus()
  }

  /** Dismiss the popover without touching the draft. */
  dismiss(): void {
    this.attempt += 1
    this.state.set({ open: false, status: 'idle', original: '', preview: null })
    this.deps.focus()
  }
}
