import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import * as enhanceRuntime from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
})

describe('enhance preview real Loader composition through cordis.yml', () => {
  it('boots cordis.yml and previews a draft without model calls or session events', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-enhance-runtime-loader-'))
    vi.stubEnv('DSH_HOME', root)
    const enhanceFile = join(root, 'enhance.yml').replaceAll('\\', '/')
    await writeFile(join(root, 'enhance.yml'), [
      'principles:',
      '  - id: modularity',
      '    text: Prefer modular components.',
      'skipPatterns: []',
      'limits:',
      '  minDraftCharacters: 10',
      '  foldBelowCharacters: 30',
      '  splitAboveCharacters: 200',
      '  maxExamples: 2',
      'depths:',
      '  spec: [objective, context, constraints, acceptance, verification]',
      'defaultDepth: spec',
      'outputLanguage: auto',
      '',
    ].join('\n'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-enhance-runtime'",
      '  config:',
      `    enhanceFile: '${enhanceFile}'`,
      '    onMissing: \'fail\'',
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-enhance-runtime', enhanceRuntime],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const session = context.sessions.create(SessionId('enhance-runtime-loader'))
    expect(context.enhance).toBeDefined()

    const preview = context.enhance.preview({ draft: 'Add a settings page with save and cancel buttons.' })
    expect(preview.text).toBe([
      'Objective:',
      'Add a settings page with save and cancel buttons.',
      '',
      'Constraints:',
      '- [principle:modularity] Prefer modular components.',
      '',
      'Acceptance criteria:',
      '- [ ] Add a settings page with save and cancel buttons.',
      '',
      'Verification:',
      '- Confirm every acceptance criterion is satisfied before reporting completion.',
    ].join('\n'))

    const streamed: string[] = []
    for await (const chunk of context.enhance.previewText(
      { draft: 'Add a settings page with save and cancel buttons.' },
      new AbortController().signal,
    )) {
      streamed.push(chunk.text)
    }
    expect(streamed.join('')).toBe(preview.text)

    // The preview is transient: nothing reached the model and the log is untouched.
    expect(session.deriveMessages()).toEqual([])
    expect(session.snapshotEvents()).toEqual([])
    expect(session.surface.nodes).toEqual([])
  })
})
