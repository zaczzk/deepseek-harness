/**
 * Mermaid rendering for the architecture diagram. The browser UMD bundle is
 * imported lazily into one self-contained client chunk; the package's tsdown
 * config repairs its script-scope global binding while bundling.
 */

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

let api: Promise<MermaidApi> | undefined
let renderId = 0

function mermaidApi(): Promise<MermaidApi> {
  api ??= import('mermaid/dist/mermaid.min.js').then(() => {
    const instance = (globalThis as MermaidGlobal).mermaid
    if (instance === undefined) {
      throw new Error('ui-architecture: the mermaid bundle did not install globalThis.mermaid')
    }
    instance.initialize({ startOnLoad: false, securityLevel: 'strict' })
    return instance
  })
  return api
}

/**
 * Render one Mermaid diagram source to SVG markup through the shared Mermaid
 * instance.
 * @param source - the diagram source.
 * @returns the SVG markup.
 * @throws when the Mermaid bundle fails to load or the source does not parse.
 */
export function renderMermaidSvg(source: string): Promise<string> {
  renderId += 1
  return mermaidApi()
    .then(mermaid => mermaid.render(`dsh-architecture-${renderId}`, source))
    .then(result => result.svg)
}
