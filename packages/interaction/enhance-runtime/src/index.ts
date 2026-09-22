/**
 * Host-side preview service behind the Enhance addon's Typert Remote face.
 * One `preview()` call resolves and renders one deterministic bundle through
 * `@deepseek-ai/dsh-enhance` against the rubric validated at plugin load. A
 * preview runs no model call and appends no session events: the accepted text
 * becomes model-visible only when the human sends it as an ordinary message.
 *
 * @module @deepseek-ai/dsh-enhance-runtime
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parse as parseYaml } from 'yaml'
import {
  EnhanceError,
  renderBundleText,
  renderEnhance,
  resolveEnhance,
  validateEnhanceConfig,
} from '@deepseek-ai/dsh-enhance'
import type {
  EnhanceConfig,
  EnhanceRequest,
} from '@deepseek-ai/dsh-enhance'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { EnhancePreviewRequest, EnhancePreviewResult } from './types.ts'

export type * from './types.ts'

export const name = 'enhance'

/** Required rubric-file policy; this plugin adds no defaults. */
export interface Config {
  /**
   * Path to the workspace `.dsh/enhance.yml`. A relative path resolves
   * against the process working directory at plugin load.
   */
  readonly enhanceFile: string
}

/** Loader schema for the {@link Config} record. */
export const Config: z<Config> = z.object({
  enhanceFile: z.string(),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    enhance: EnhanceRuntime
  }
}

/**
 * Load and validate the rubric at plugin load; a missing file, invalid YAML,
 * or violated rule fails loud with the file path and every violation.
 *
 * @param enhanceFile - configured rubric-file path.
 * @returns the validated rubric configuration.
 * @throws {@link EnhanceError} when the file cannot be read, parsed, or validated.
 */
function loadEnhanceConfig(enhanceFile: string): EnhanceConfig {
  try {
    return validateEnhanceConfig(parseYaml(readFileSync(enhanceFile, 'utf8')))
  } catch (error: unknown) {
    /* v8 ignore next -- node:fs, yaml, and EnhanceError all throw Error instances */
    const reason = error instanceof Error ? error.message : String(error)
    throw new EnhanceError(`enhance-runtime: failed to load ${enhanceFile}: ${reason}`)
  }
}

/**
 * Deterministic preview service over the zero-dependency enhancement
 * pipeline. Owns rubric loading and runs no model call and no session writes,
 * so previews are transient and keylessly testable.
 */
export default class EnhanceRuntime extends TypertRemoteService {
  /** Validated rubric configuration loaded once at plugin load. */
  private readonly rubric: EnhanceConfig

  /**
   * Load the rubric and bind the `enhance` service key to Typert Gateway.
   * @param ctx - owning Cordis Context.
   * @param config - required rubric-file policy.
   * @throws {@link EnhanceError} when the rubric file is missing or invalid.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'enhance')
    this.rubric = loadEnhanceConfig(config.enhanceFile)
  }

  /**
   * Resolve and render one draft through the deterministic template stage.
   *
   * @param request - draft text with optional depth and direction.
   * @returns classifier facts, structured sections, and rendered text.
   * @throws {@link EnhanceError} when the draft is blank or the depth is undeclared.
   */
  @Remote
  preview(request: EnhancePreviewRequest): EnhancePreviewResult {
    const resolved: EnhanceRequest = {
      draft: request.draft,
      ...request.depth === undefined ? {} : { depth: request.depth },
      ...request.direction === undefined ? {} : { direction: request.direction },
    }
    const spec = resolveEnhance(resolved, this.rubric)
    const bundle = renderEnhance(resolved, spec, this.rubric)
    return Object.freeze({
      route: spec.route,
      matchedRule: spec.matchedRule,
      depth: spec.depth,
      direction: spec.direction,
      outputLanguage: spec.outputLanguage,
      sections: bundle.sections,
      text: renderBundleText(bundle),
    })
  }
}
