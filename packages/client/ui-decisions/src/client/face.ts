/**
 * The decisions tab's asynchronous half: reading `DECISIONS.md` into the
 * store. The view never awaits anything; it asks for the register and this
 * face reads it and writes the outcome through the store's own actions — the
 * Slot-standard `inject` form, so the write set stays the store's. Requests
 * run in submission order, so a settlement can never overwrite a newer
 * request.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import { REGISTER_FILE, type ProjectTextResult } from '@deepseek-ai/dsh-util-project-register'
import type { RegisterStore } from './store.ts'

/** Reads one project document as complete text by workspace path. */
export type ReadProjectDoc = (path: string) => Promise<ProjectTextResult>

/** The decisions tab's injected business face, as the view receives it. */
export interface RegisterInjected {
  /**
   * Read `DECISIONS.md` into the store.
   * @param observedVersion - metadata version observed at read start.
   */
  readonly loadRegister: (observedVersion: string) => void
}

/**
 * Bind the tab's face to one document reader.
 * @param read - reads one project document by workspace path.
 * @returns the Slot `inject` factory body: bound actions in, face out.
 */
export function registerFace(
  read: ReadProjectDoc,
): (actions: BoundActions<RegisterStore>) => RegisterInjected {
  return (actions): RegisterInjected => {
    let queue: Promise<void> = Promise.resolve()
    return {
      loadRegister: (observedVersion) => {
        actions.loading(observedVersion)
        queue = queue.then(async () => {
          let result: ProjectTextResult
          try {
            result = await read(REGISTER_FILE)
          } catch {
            // The Remote face does not reject; a rejection is a transport
            // fault reported through the store's failed read state.
            result = { ok: false, error: { code: 'gateway/internal' } }
          }
          if (result.ok) actions.loaded(result.value.text, result.value.version)
          else actions.failed(result.error.code)
        })
      },
    }
  }
}
