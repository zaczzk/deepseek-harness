import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { EnhanceError } from '@deepseek-ai/dsh-enhance'
import EnhanceRuntime, { type EnhancePreviewChunk } from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  void context
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Valid rubric document written to the harness's enhance.yml. */
const ENHANCE_YAML = [
  'principles:',
  '  - id: modularity',
  '    text: Prefer modular components.',
  'skipPatterns:',
  '  - "^ping$"',
  'limits:',
  '  minDraftCharacters: 10',
  '  foldBelowCharacters: 30',
  '  splitAboveCharacters: 200',
  '  maxExamples: 2',
  'depths:',
  '  task: [objective, acceptance]',
  '  spec: [objective, context, constraints, acceptance, verification]',
  '  bundle: [objective, context, constraints, acceptance, verification, doneLooksLike, goal, todos]',
  'defaultDepth: spec',
  'outputLanguage: auto',
  '',
].join('\n')

/** Write the rubric file and mount the preview service. */
async function harness(enhanceYaml: string = ENHANCE_YAML): Promise<{ ctx: Context; enhance: EnhanceRuntime }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-enhance-runtime-'))
  const enhanceFile = join(root, 'enhance.yml')
  await writeFile(enhanceFile, enhanceYaml)
  const ctx = new Context()
  context = ctx
  await ctx.plugin(EnhanceRuntime, { enhanceFile })
  return { ctx, enhance: ctx.enhance }
}

/** Observe plugin-mount failure without formatting a Cordis proxy in a diff. */
async function mountOutcome(enhanceFile: string): Promise<string> {
  const ctx = new Context()
  context = ctx
  return ctx.plugin(EnhanceRuntime, { enhanceFile })
    .then(() => 'mounted', (error: unknown) => (error instanceof Error ? error.message : String(error)))
}

describe('@deepseek-ai/dsh-enhance-runtime rubric loading', () => {
  it('fails loud on a missing rubric file', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-enhance-runtime-'))
    expect(await mountOutcome(join(root, 'absent.yml'))).toMatch(/failed to load .*absent\.yml/u)
  })

  it('fails loud on invalid YAML and on violated rules', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-enhance-runtime-'))
    const enhanceFile = join(root, 'enhance.yml')
    await writeFile(enhanceFile, 'principles: [')
    expect(await mountOutcome(enhanceFile)).toMatch(/failed to load/u)
    await writeFile(enhanceFile, 'principles: []\ndefaultDepth: spec\n')
    expect(await mountOutcome(enhanceFile)).toMatch(/principles: must be a non-empty array/u)
  })
})

describe('enhance.preview', () => {
  it('returns classifier facts, sections, and rendered text in one call', async () => {
    const { enhance } = await harness()
    const result = enhance.preview({ draft: 'Add a settings page with save and cancel buttons.' })
    expect(result.route).toBe('enhance')
    expect(result.matchedRule).toBe('default')
    expect(result.depth).toBe('spec')
    expect(result.direction).toBe('enhance')
    expect(result.outputLanguage).toBe('en')
    expect(result.sections.objective).toBe('Add a settings page with save and cancel buttons.')
    expect(result.sections.constraints).toEqual(['[principle:modularity] Prefer modular components.'])
    expect(result.text).toContain('Objective:\nAdd a settings page with save and cancel buttons.')
    expect(result.text).toContain('- [principle:modularity] Prefer modular components.')
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('honors depth and direction overrides and reports the matched rule', async () => {
    const { enhance } = await harness()
    const bundle = enhance.preview({ draft: 'Add a settings page with save and cancel buttons.', depth: 'bundle' })
    expect(bundle.sections.goal).toBeDefined()
    expect(bundle.sections.doneLooksLike).toBeDefined()
    const compact = enhance.preview({
      draft: 'Add a settings page with save and cancel buttons.',
      depth: 'bundle',
      direction: 'compact',
    })
    expect(compact.direction).toBe('compact')
    expect(compact.sections.goal).toBeUndefined()
    expect(enhance.preview({ draft: 'ping' }).matchedRule).toBe('skip-pattern:^ping$')
  })

  it('propagates expected request failures and unexpected ones alike', async () => {
    const { enhance } = await harness()
    expect(() => enhance.preview({ draft: '   ' })).toThrow(EnhanceError)
    expect(() => enhance.preview({ draft: 'build the thing', depth: 'outline' })).toThrow(/unknown depth "outline"/u)
  })
})

describe('enhance.previewText', () => {
  it('streams the rendered text as progressive line chunks that settle complete', async () => {
    const { enhance } = await harness()
    const request = { draft: 'Add a settings page with save and cancel buttons.' }
    const chunks: EnhancePreviewChunk[] = []
    for await (const chunk of enhance.previewText(request, new AbortController().signal)) {
      chunks.push(chunk)
    }
    const rendered = enhance.preview(request).text
    expect(chunks.length).toBe(rendered.split('\n').length)
    expect(chunks.map(chunk => chunk.text).join('')).toBe(rendered)
    expect(chunks.every(chunk => Object.keys(chunk).join() === 'text')).toBe(true)
  })

  it('ends quietly on cancellation with the remaining lines undelivered', async () => {
    const { enhance } = await harness()
    const controller = new AbortController()
    const seen: string[] = []
    for await (const chunk of enhance.previewText(
      { draft: 'Add a settings page with save and cancel buttons.' },
      controller.signal,
    )) {
      seen.push(chunk.text)
      controller.abort()
    }
    expect(seen).toHaveLength(1)
  })

  it('delivers nothing when cancelled before the first pull', async () => {
    const { enhance } = await harness()
    const controller = new AbortController()
    controller.abort()
    const seen: string[] = []
    for await (const chunk of enhance.previewText(
      { draft: 'Add a settings page with save and cancel buttons.' },
      controller.signal,
    )) {
      seen.push(chunk.text)
    }
    expect(seen).toEqual([])
  })

  it('fails with EnhanceError like preview on a blank draft', async () => {
    const { enhance } = await harness()
    expect(() => enhance.previewText({ draft: '   ' }, new AbortController().signal)).toThrow(EnhanceError)
  })
})
