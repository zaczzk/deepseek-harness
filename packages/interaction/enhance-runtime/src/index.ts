/**
 * Host-side preview service behind the Enhance addon's Typert Remote face.
 * One `preview()` call resolves and renders one deterministic bundle through
 * `@deepseek-ai/dsh-enhance` against the rubric validated at plugin load;
 * `previewText()` streams the same render as progressive text chunks. A
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
import type { EnhancePreviewChunk, EnhancePreviewRequest, EnhancePreviewResult } from './types.ts'

export type * from './types.ts'

export const name = 'enhance'

/** Required rubric-file policy; this plugin adds no defaults. */
export interface Config {
  /**
   * Path to the workspace `.dsh/enhance.yml`. A relative path resolves
   * against the process working directory at plugin load.
   */
  readonly enhanceFile: string
  /**
   * Missing-file policy: `fail` aborts plugin load; `disable` mounts the
   * service with previews rejecting until the rubric exists.
   */
  readonly onMissing: 'fail' | 'disable'
}

/** Loader schema for the {@link Config} record. */
export const Config: z<Config> = z.object({
  enhanceFile: z.string(),
  onMissing: z.union(['fail', 'disable'] as const),
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
function loadEnhanceConfig(enhanceFile: string, onMissing: 'fail' | 'disable'): EnhanceConfig | undefined {
  try {
    return validateEnhanceConfig(parseYaml(readFileSync(enhanceFile, 'utf8')))
  } catch (error: unknown) {
    if (onMissing === 'disable' && isMissingFile(error)) return undefined
    /* v8 ignore next -- node:fs, yaml, and EnhanceError all throw Error instances */
    const reason = error instanceof Error ? error.message : String(error)
    throw new EnhanceError(`enhance-runtime: failed to load ${enhanceFile}: ${reason}`)
  }
}

/** Whether the failure is exactly a missing rubric file. */
function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/**
 * Deliver one rendered projection as progressive line deltas.
 *
 * @param text - complete rendered projection.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns one chunk per rendered line, ending quietly on cancellation.
 */
async function* streamText(text: string, signal: AbortSignal): AsyncIterable<EnhancePreviewChunk> {
  for (const line of text.split(/(?<=\n)/u)) {
    if (signal.aborted) return
    yield { text: line }
  }
}

/**
 * Deterministic preview service over the zero-dependency enhancement
 * pipeline. Owns rubric loading and runs no model call and no session writes,
 * so previews are transient and keylessly testable.
 */
export default class EnhanceRuntime extends TypertRemoteService {
  /** Validated rubric; undefined only under `onMissing: 'disable'`. */
  private readonly rubric: EnhanceConfig | undefined
  /** Configured rubric path, named by the disabled-mode error. */
  private readonly enhanceFile: string

  /**
   * Load the rubric and bind the `enhance` service key to Typert Gateway.
   * @param ctx - owning Cordis Context.
   * @param config - required rubric-file policy.
   * @throws {@link EnhanceError} when the rubric is missing under `onMissing: 'fail'` or is invalid.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'enhance')
    this.enhanceFile = config.enhanceFile
    this.rubric = loadEnhanceConfig(config.enhanceFile, config.onMissing)
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
    if (this.rubric === undefined) {
      throw new EnhanceError(`enhance-runtime: no rubric at ${this.enhanceFile}; create it and reload`)
    }
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

  /**
   * Stream the plain-text projection of one draft's deterministic rewrite as
   * progressive line chunks. Structured sections ride `preview`; this method
   * carries the text projection only and settles with no terminal item. Like
   * `preview`, it runs no model call and appends no session events.
   *
   * @param request - draft text with optional depth and direction.
   * @param signal - cancellation owned by the Remote stream carrier.
   * @returns one chunk per rendered line, ending quietly on cancellation.
   * @throws {@link EnhanceError} when the draft is blank or the depth is undeclared.
   */
  @Remote({ mode: 'stream' })
  previewText(request: EnhancePreviewRequest, signal: AbortSignal): AsyncIterable<EnhancePreviewChunk> {
    return streamText(this.preview(request).text, signal)
  }
}
