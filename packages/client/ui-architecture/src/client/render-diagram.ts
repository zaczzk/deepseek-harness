/**
 * Mermaid rendering for the architecture diagram. The browser UMD bundle is
 * inlined as a side-effect import into the single self-contained client
 * bundle; the package's tsdown config repairs its script-scope global binding
 * while bundling.
 */
// Side-effect import: the UMD installs `globalThis.mermaid`.
import 'mermaid/dist/mermaid.min.js'

/** The Mermaid operations this package uses. */
interface MermaidApi {
  /**
   * @param options - rendering configuration for every later render.
   */
  initialize(options: { startOnLoad: boolean; securityLevel: 'strict' }): void
  /**
   * @param id - unique SVG container identity.
   * @param text - Mermaid diagram source.
   * @returns the rendered SVG markup.
   */
  render(id: string, text: string): Promise<{ svg: string }>
}

interface MermaidGlobal {
  mermaid?: MermaidApi
}

let api: MermaidApi | undefined
let renderId = 0

function mermaidApi(): MermaidApi {
  if (api !== undefined) return api
  const instance = (globalThis as MermaidGlobal).mermaid
  if (instance === undefined) {
    throw new Error('ui-architecture: the mermaid bundle did not install globalThis.mermaid')
  }
  instance.initialize({ startOnLoad: false, securityLevel: 'strict' })
  api = instance
  return api
}

/**
 * Render one Mermaid diagram source to SVG markup through the shared Mermaid
 * instance.
 * @param source - the diagram source.
 * @returns the SVG markup.
 * @throws when the Mermaid bundle did not load or the source does not parse.
 */
export async function renderMermaidSvg(source: string): Promise<string> {
  renderId += 1
  const result = await mermaidApi().render(`dsh-architecture-${renderId}`, source)
  return result.svg
}
