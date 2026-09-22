/**
 * The decisions tab's own state: the `DECISIONS.md` register text it has
 * read. The `file` resource carries metadata only, so content is this view's
 * to fetch and keep; it outlives the body so a view switched away from and
 * back shows its table without re-reading.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** One register document's read state. */
export interface RegisterDocState {
  /** Current read phase. */
  status: 'idle' | 'loading' | 'ready' | 'failed'
  /** File text held from the last successful read. */
  text?: string
  /** File version the held text belongs to. */
  version?: string
  /** Metadata version the current read generation started from. */
  observedVersion?: string
  /** Remote failure code of the last failed read. */
  failureCode?: string
}

/** The tab's complete state for one Session. */
export interface RegisterState {
  doc: RegisterDocState
}

type RegisterActions = {
  /** @param draft - state. @param observedVersion - metadata version at read start. */
  loading: (draft: RegisterState, observedVersion: string) => void
  /** @param draft - state. @param text - file text. @param version - file version read. */
  loaded: (draft: RegisterState, text: string, version: string) => void
  /** @param draft - state. @param code - Remote failure code. */
  failed: (draft: RegisterState, code: string) => void
}

/** The decisions store handle shared by the tab registration. */
export type RegisterStore = EngineStoreHandle<RegisterState, RegisterActions>

/**
 * Declare the decisions store: one instance per Session, created by the
 * framework from the registration's shared handle.
 * @returns the store handle declared on the view registration.
 */
export function createRegisterStore(): RegisterStore {
  return defineStore({
    init: (): RegisterState => ({ doc: { status: 'idle' } }),
    actions: {
      loading: (d, observedVersion: string) => {
        d.doc.status = 'loading'
        d.doc.observedVersion = observedVersion
        delete d.doc.failureCode
      },
      loaded: (d, text: string, version: string) => {
        d.doc.status = 'ready'
        d.doc.text = text
        d.doc.version = version
        delete d.doc.failureCode
      },
      failed: (d, code: string) => {
        d.doc.status = 'failed'
        d.doc.failureCode = code
      },
    },
  })
}
