/**
 * Human-facing `/enhance` command: turns a composer draft into a structured
 * task, goal, and todo bundle through the deterministic template pipeline of
 * `@deepseek-ai/dsh-enhance`. The command runs no model call and sends
 * nothing to the model; its result is user-visible text only.
 *
 * @module @deepseek-ai/dsh-command-enhance
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parse as parseYaml } from 'yaml'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import {
  EnhanceError,
  renderBundleText,
  renderEnhance,
  resolveEnhance,
  validateEnhanceConfig,
} from '@deepseek-ai/dsh-enhance'
import type { EnhanceConfig, EnhanceRequest, EnhanceSpec } from '@deepseek-ai/dsh-enhance'

export const name = 'command-enhance'
export const inject = ['commands']

/** Required rubric-file policy; this plugin adds no defaults. */
export interface Config {
  /**
   * Path to the workspace `.dsh/enhance.yml`. A relative path resolves
   * against the process working directory at plugin load.
   */
  readonly enhanceFile: string
  /**
   * Missing-file policy: `fail` aborts plugin load; `disable` registers the
   * command with its result reporting until the rubric exists.
   */
  readonly onMissing: 'fail' | 'disable'
}

/** Loader schema for the {@link Config} record. */
export const Config: z<Config> = z.object({
  enhanceFile: z.string(),
  onMissing: z.union(['fail', 'disable'] as const),
})

/**
 * Load and validate the rubric file at plugin load; a missing file, invalid
 * YAML, or violated rule fails loud with the file path and every violation.
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
    throw new EnhanceError(`enhance: failed to load ${enhanceFile}: ${reason}`)
  }
}

/** Whether the failure is exactly a missing rubric file. */
function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/** Parsed `/enhance` input: an optional depth override and the draft. */
interface EnhanceInput {
  readonly depth?: string
  readonly draft: string
}

/**
 * Parse one `/enhance` line. A leading bracketed token selects a depth only
 * when it names a declared depth; otherwise the whole line is the draft, so
 * a draft like `[WIP] fix the build` is never misread as a depth.
 *
 * @param rawInput - exact text following the command name.
 * @param config - validated rubric configuration declaring depths.
 * @returns the parsed input, or `undefined` when no draft text is present.
 */
function parseInput(rawInput: string, config: EnhanceConfig): EnhanceInput | undefined {
  const trimmed = rawInput.trim()
  if (trimmed.length === 0) return undefined
  const match = /^\[([^\]]+)\]\s+/u.exec(trimmed)
  if (match !== null) {
    const depth = match[1]
    /* v8 ignore next 2 -- the first capture is required whenever the regular expression matches */
    if (depth === undefined) return { draft: trimmed }
    if (Object.hasOwn(config.depths, depth)) {
      return { depth, draft: trimmed.slice(match[0].length).trim() }
    }
  }
  return { draft: trimmed }
}

/** One short advisory line for a non-default route prediction. */
function routeAdvice(spec: EnhanceSpec): string {
  const advice = spec.route === 'skip'
    ? 'this draft may already be clear; review the structured form below'
    : spec.route === 'fold'
      ? 'consider folding this into the current goal instead of starting new work'
      : 'consider splitting this draft into separate tasks'
  return `Route: ${spec.route} (${spec.matchedRule}) — ${advice}.`
}

/** Execute one parsed human command through the deterministic pipeline. */
function executeEnhance(enhanceFile: string, config: EnhanceConfig | undefined, invocation: CommandInvocation): CommandResult {
  if (config === undefined) {
    return { kind: 'error', text: `enhance: no rubric at ${enhanceFile}; create it and reload` }
  }
  const parsed = parseInput(invocation.rawInput, config)
  if (parsed === undefined) {
    return { kind: 'error', text: `Usage: /enhance [<depth>] <draft> (depths: ${Object.keys(config.depths).join(', ')})` }
  }
  const request: EnhanceRequest = {
    draft: parsed.draft,
    ...parsed.depth === undefined ? {} : { depth: parsed.depth },
  }
  const spec = resolveEnhance(request, config)
  const body = renderBundleText(renderEnhance(request, spec, config))
  return { kind: 'success', text: spec.route === 'enhance' ? body : `${routeAdvice(spec)}\n\n${body}` }
}

/**
 * Register the `/enhance` command for every composed command adapter.
 *
 * @param ctx - context exposing the command registry.
 * @param config - required rubric-file policy.
 * @throws {@link EnhanceError} when the rubric file is missing or invalid.
 */
export function apply(ctx: Context, config: Config): void {
  const enhanceConfig = loadEnhanceConfig(config.enhanceFile, config.onMissing)
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-command-enhance'),
    name: 'enhance',
    description: 'Structure a draft into a task, goal, and todo list',
    input: { hint: '[<depth>] <draft>' },
    handler: invocation => executeEnhance(config.enhanceFile, enhanceConfig, invocation),
  })
}
