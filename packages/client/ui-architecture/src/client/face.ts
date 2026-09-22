/**
 * The architecture tab's asynchronous half: reading project documents and
 * rendering the diagram into the store. The view never awaits anything; it
 * asks for a document or a render and this face performs it and writes the
 * outcome through the store's own actions — the Slot-standard `inject` form,
 * so the write set stays the store's. Requests run in submission order, so a
 * settlement can never overwrite a newer request.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import {
  ARCHITECTURE_FILE, REGISTER_FILE,
  type ProjectTextResult,
} from '@deepseek-ai/dsh-util-project-register'
import type { ArchitectureStore, ProjectDocKey } from './store.ts'

/** Reads one project document as complete text by workspace path. */
export type ReadProjectDoc = (path: string) => Promise<ProjectTextResult>

/** Renders one Mermaid diagram source to SVG markup. */
export type RenderDiagram = (source: string) => Promise<string>

/** The architecture tab's injected business face, as the view receives it. */
export interface ArchitectureInjected {
  /**
   * Read `ARCHITECTURE.md` into the store.
   * @param observedVersion - metadata version observed at read start.
   */
  readonly loadArchitecture: (observedVersion: string) => void
  /**
   * Read `DECISIONS.md` into the store.
   * @param observedVersion - metadata version observed at read start.
   */
  readonly loadRegister: (observedVersion: string) => void
  /**
   * Render one diagram source into the store.
   * @param source - the diagram source to render.
   */
  readonly renderDiagram: (source: string) => void
}

/**
 * Bind the tab's face to one document reader and one diagram renderer.
 * @param read - reads one project document by workspace path.
 * @param render - renders one diagram source.
 * @returns the Slot `inject` factory body: bound actions in, face out.
 */
export function architectureFace(
  read: ReadProjectDoc,
  render: RenderDiagram,
): (actions: BoundActions<ArchitectureStore>) => ArchitectureInjected {
  return (actions): ArchitectureInjected => {
    let queue: Promise<void> = Promise.resolve()
    const enqueue = (task: () => Promise<void>): void => {
      queue = queue.then(task)
    }
    const load = (key: ProjectDocKey, path: string, observedVersion: string): void => {
      actions.loading(key, observedVersion)
      enqueue(async () => {
        let result: ProjectTextResult
        try {
          result = await read(path)
        } catch {
          // The Remote face does not reject; a rejection is a transport fault
          // reported through the store's failed read state.
          result = { ok: false, error: { code: 'gateway/internal' } }
        }
        if (result.ok) actions.loaded(key, result.value.text, result.value.version)
        else actions.failed(key, result.error.code)
      })
    }
    return {
      loadArchitecture: (observedVersion) => { load('architecture', ARCHITECTURE_FILE, observedVersion) },
      loadRegister: (observedVersion) => { load('register', REGISTER_FILE, observedVersion) },
      renderDiagram: (source) => {
        actions.rendering(source)
        enqueue(async () => {
          try {
            actions.rendered(source, await render(source))
          } catch {
            // A source Mermaid cannot parse is reported through the store's
            // failed render state instead of propagating to the view.
            actions.renderFailed(source)
          }
        })
      },
    }
  }
}
