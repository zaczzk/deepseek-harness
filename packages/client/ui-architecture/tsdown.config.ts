import type { TsdownPlugin, UserConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

/**
 * Mermaid's `mermaid.min.js` is a script-tag artifact: its esbuild tail reads
 * `globalThis.__esbuild_esm_mermaid_nm`, a property its own top-level `var`
 * only creates in a classic script scope. Bundled inside the client chunk
 * factory that variable is function-scoped, so the tail would throw before the
 * bundle installs `globalThis.mermaid`. This transform binds the same object to
 * both spellings at declaration time.
 */
const MERMAID_GLOBAL_BINDING = 'var __esbuild_esm_mermaid_nm;'

const mermaidGlobalShim: TsdownPlugin = {
  name: 'dsh-mermaid-global-shim',
  transform(code: string, id: string) {
    const normalized = id.split('\\').join('/')
    if (!normalized.endsWith('/mermaid/dist/mermaid.min.js')) return null
    return code.replace(
      MERMAID_GLOBAL_BINDING,
      'var __esbuild_esm_mermaid_nm = globalThis.__esbuild_esm_mermaid_nm = {};',
    )
  },
}

const base = clientBundle('@deepseek-ai/dsh-client-ui-architecture', ['lib/types/index.js'])

/** Client bundle with the Mermaid global shim applied to the client face. */
export default (inlineConfig: Pick<UserConfig, 'env'>): UserConfig[] =>
  base(inlineConfig).map((config): UserConfig => (
    config.name === '@deepseek-ai/dsh-client-ui-architecture/client'
      ? { ...config, plugins: [...(config.plugins ?? []), mermaidGlobalShim] }
      : config
  ))
