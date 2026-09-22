/**
 * The architecture tab's own state: the project documents it has read and the
 * diagram it has rendered. The `file` resource carries metadata only, so
 * content is this view's to fetch and keep; it outlives the body so a view
 * switched away from and back shows its diagram without re-reading.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Which project document a read action writes. */
export type ProjectDocKey = 'architecture' | 'register'

/** One project document's read state. */
export interface DocState {
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

/** The diagram render's state. */
export interface RenderState {
  /** Current render phase. */
  status: 'idle' | 'rendering' | 'ready' | 'failed'
  /** Diagram source the current render belongs to. */
  source?: string
  /** Rendered SVG markup. */
  svg?: string
}

/** The tab's complete state for one Session. */
export interface ArchitectureState {
  architecture: DocState
  register: DocState
  render: RenderState
}

type ArchitectureActions = {
  /** @param draft - state. @param key - document being read. @param observedVersion - metadata version at read start. */
  loading: (draft: ArchitectureState, key: ProjectDocKey, observedVersion: string) => void
  /** @param draft - state. @param key - document read. @param text - file text. @param version - file version read. */
  loaded: (draft: ArchitectureState, key: ProjectDocKey, text: string, version: string) => void
  /** @param draft - state. @param key - document whose read failed. @param code - Remote failure code. */
  failed: (draft: ArchitectureState, key: ProjectDocKey, code: string) => void
  /** @param draft - state. @param source - diagram source being rendered. */
  rendering: (draft: ArchitectureState, source: string) => void
  /** @param draft - state. @param source - rendered diagram source. @param svg - rendered SVG markup. */
  rendered: (draft: ArchitectureState, source: string, svg: string) => void
  /** @param draft - state. @param source - diagram source whose render failed. */
  renderFailed: (draft: ArchitectureState, source: string) => void
}

/** The architecture store handle shared by the tab registration. */
export type ArchitectureStore = EngineStoreHandle<ArchitectureState, ArchitectureActions>

/** The document one write targets. */
function docOf(draft: ArchitectureState, key: ProjectDocKey): DocState {
  return draft[key]
}

/**
 * Declare the architecture store: one instance per Session, created by the
 * framework from the registration's shared handle.
 * @returns the store handle declared on the view registration.
 */
export function createArchitectureStore(): ArchitectureStore {
  return defineStore({
    init: (): ArchitectureState => ({
      architecture: { status: 'idle' },
      register: { status: 'idle' },
      render: { status: 'idle' },
    }),
    actions: {
      loading: (d, key: ProjectDocKey, observedVersion: string) => {
        const doc = docOf(d, key)
        doc.status = 'loading'
        doc.observedVersion = observedVersion
        delete doc.failureCode
      },
      loaded: (d, key: ProjectDocKey, text: string, version: string) => {
        const doc = docOf(d, key)
        doc.status = 'ready'
        doc.text = text
        doc.version = version
        delete doc.failureCode
      },
      failed: (d, key: ProjectDocKey, code: string) => {
        const doc = docOf(d, key)
        doc.status = 'failed'
        doc.failureCode = code
      },
      rendering: (d, source: string) => {
        d.render = { status: 'rendering', source }
      },
      rendered: (d, source: string, svg: string) => {
        if (d.render.source !== source) return
        d.render = { status: 'ready', source, svg }
      },
      renderFailed: (d, source: string) => {
        if (d.render.source !== source) return
        d.render = { status: 'failed', source }
      },
    },
  })
}
