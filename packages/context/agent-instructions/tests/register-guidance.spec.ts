import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { FileSystem, FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs'
import type { FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsWriteIntent, FsWriteOutcome } from '@deepseek-ai/dsh-fs'
import {
  discoverBaselineInstructionFiles,
  loadBaselineInstructions,
} from '@deepseek-ai/dsh-agent-instructions'
import { renderRegisterGuidance, REGISTER_GUIDANCE_DISPLAY } from '../src/register.ts'
import { resolveConfig, workspaceBaselineIdentity } from '../src/config.ts'
import { REGISTER_FILE } from '@deepseek-ai/dsh-util-project-register'

async function tempRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ai-register-'))
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

function registerTable(rows: readonly string[]): string {
  return ['# Decision Register', '', '| ID | Date | Kind | Title | Status | Diagram |', '|----|------|------|-------|--------|---------|', ...rows, ''].join('\n')
}

class RecordingFileSystem extends FileSystem {
  override watch(): never { throw new Error('Fixture does not support watching') }
  entries = new Map<string, { type: FsInfo['type']; content?: string; version?: FsVersion }>()
  throwOnResolve = new Set<string>()

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    opts?.signal?.throwIfAborted()
    const absolute = resolve(opts?.cwd ?? '/', path)
    if (this.throwOnResolve.has(absolute)) throw new Error(`resolve failed: ${absolute}`)
    return { targetKey: FsTargetKey(absolute), displayPath: absolute }
  }

  override processPath(target: FsTarget): string { return String(target.targetKey) }
  override fileUrl(target: FsTarget): string { return `file://${target.targetKey}` }
  override contains(parent: FsTarget, child: FsTarget): boolean {
    const rel = relative(String(parent.targetKey), String(child.targetKey))
    return rel === '' || (!rel.startsWith('..') && !/^[A-Za-z]:[\\/]/.test(rel) && !rel.startsWith('/'))
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    signal?.throwIfAborted()
    const entry = this.entries.get(String(target.targetKey))
    if (entry === undefined) return undefined
    const version = entry.version ?? FsVersion(`v:${target.targetKey}:${entry.type}:${entry.content ?? ''}`)
    const info: FsInfo = { version, type: entry.type }
    if (entry.content !== undefined) info.size = Buffer.byteLength(entry.content, 'utf8')
    return info
  }

  override async lstat(_path: string, _opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    signal?.throwIfAborted()
    return undefined
  }

  override async readBytes(_target: FsTarget, _signal: AbortSignal | undefined, _maxBytes: number): Promise<Uint8Array> {
    throw new Error('not needed')
  }

  override async readByteRange(_target: FsTarget, _range: { offset: number; length: number }, _signal?: AbortSignal): Promise<Uint8Array> {
    throw new Error('not needed')
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    signal?.throwIfAborted()
    const content = this.entries.get(String(target.targetKey))?.content ?? ''
    return (async function* () { yield content })()
  }

  override async listDir(_target: FsTarget): Promise<FsDirEntry[]> { return [] }
  override async writeText(_target: FsTarget, _content: string, _expected?: FsWriteIntent): Promise<FsWriteOutcome> {
    return { operation: 'update', version: FsVersion('unused'), before: '', after: _content }
  }
  override async editText(_target: FsTarget, _edit: FsEditRequest): Promise<FsEditOutcome> {
    return { version: FsVersion('unused'), before: '', after: '' }
  }
}

describe('register guidance rendering', () => {
  it('exports the register display name', () => {
    expect(REGISTER_GUIDANCE_DISPLAY).toBe(REGISTER_FILE)
    expect(REGISTER_FILE).toBe('DECISIONS.md')
  })

  it('renders an empty block for an unreadable or rowless register', () => {
    expect(renderRegisterGuidance(undefined, 'irrelevant')).toBe('')
    expect(renderRegisterGuidance('', undefined)).toBe('')
    expect(renderRegisterGuidance(registerTable([]), undefined)).toBe('')
  })

  it('renders table rows and the latest milestone diagram freshness', () => {
    const register = registerTable([
      '| D1 | 2026-10-01 | decision | Ship grid | accepted | — |',
      '| M1 | 2026-10-02 | milestone | Dial platform | done | updated@abc12345 |',
      '| M2 | 2026-10-03 | milestone | Paper fence | done | updated@abc12345 |',
    ])
    const text = renderRegisterGuidance(register, '```mermaid\ngraph TD\\nA[one]\\n```')
    expect(text).toContain('| D1 | 2026-10-01 | decision | Ship grid | accepted | — |')
    expect(text).toContain('| M2 | 2026-10-03 | milestone | Paper fence | done | updated@abc12345 |')
    expect(text).toContain('Latest milestone M2')
  })

  it('omits the freshness line when no milestone row exists', () => {
    const register = registerTable(['| D1 | 2026-10-01 | decision | Ship grid | accepted | — |'])
    const text = renderRegisterGuidance(register, undefined)
    expect(text).toContain('| D1 | 2026-10-01 | decision | Ship grid | accepted | — |')
    expect(text).not.toContain('Latest milestone')
    expect(text).not.toContain('diagram')
  })
})

describe('register guidance config', () => {
  it('defaults registerFileCandidates to the shipped register file and folds it into identity', () => {
    const resolved = resolveConfig({ maxBytes: 8192 })
    expect(resolved.registerFileCandidates).toEqual(['DECISIONS.md'])
    const identity = workspaceBaselineIdentity(resolved, '/repo/pkg', '/repo')
    expect(identity).toContain('"registerFileCandidates":["DECISIONS.md"]')
  })

  it('honors an empty registerFileCandidates to disable register guidance', () => {
    const resolved = resolveConfig({ maxBytes: 8192, registerFileCandidates: [] })
    expect(resolved.registerFileCandidates).toEqual([])
  })

  it('honors a custom register candidate', () => {
    const resolved = resolveConfig({ maxBytes: 8192, registerFileCandidates: ['ROADMAP.md'] })
    expect(resolved.registerFileCandidates).toEqual(['ROADMAP.md'])
  })
})

describe('register guidance discovery and load', () => {
  it('discovers a present register candidate among the project chain', async () => {
    const root = await tempRepo()
    const home = await tempRepo()
    try {
      await write(join(root, '.git'), '')
      await write(join(root, 'DECISIONS.md'), registerTable(['| M1 | 2026-10-02 | milestone | Dial | done | updated@abc12345 |']))
      await write(join(root, 'ARCHITECTURE.md'), '```mermaid\ngraph TD\\nA[one]\\n```')

      const files = await discoverBaselineInstructionFiles({ cwd: root, dshHome: home })
      const register = files.find(file => file.displayPath === 'DECISIONS.md')
      expect(register).toBeDefined()
      expect(register?.absolutePath).toBe(join(root, 'DECISIONS.md'))
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('skips a rowless register candidate entirely at load', async () => {
    const root = await tempRepo()
    const home = await tempRepo()
    try {
      await write(join(root, '.git'), '')
      await write(join(root, 'AGENTS.md'), 'root rules')
      // A present but rowless register renders no ranked block, so the
      // candidate contributes nothing — not even its "Instructions from:" header —
      // while ordinary instruction files still load.
      await write(join(root, 'DECISIONS.md'), '# Decision Register\n\nNo rows yet.\n')

      const rendered = await loadBaselineInstructions({ cwd: root, dshHome: home, maxBytes: 65536 })
      expect(rendered).toBeDefined()
      expect(rendered!.text).toContain('root rules')
      expect(rendered!.text).not.toContain('Instructions from: DECISIONS.md')
      expect(rendered!.text).not.toContain('Latest milestone')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('renders register rows into the baseline, budgeted by maxBytes', async () => {
    const root = await tempRepo()
    const home = await tempRepo()
    try {
      await write(join(root, '.git'), '')
      await write(join(root, 'AGENTS.md'), 'root rules')
      await write(join(root, 'DECISIONS.md'), registerTable([
        '| D1 | 2026-10-01 | decision | Ship grid | accepted | — |',
        '| M1 | 2026-10-02 | milestone | Dial platform | done | updated@abc12345 |',
      ]))
      await write(join(root, 'ARCHITECTURE.md'), '```mermaid\ngraph TD\\nA[one]\\n```')

      const rendered = await loadBaselineInstructions({ cwd: root, dshHome: home, maxBytes: 65536 })
      expect(rendered).toBeDefined()
      expect(rendered!.text).toContain('Instructions from: DECISIONS.md')
      expect(rendered!.text).toContain('| D1 | 2026-10-01 | decision | Ship grid | accepted | — |')
      expect(rendered!.text).toContain('Latest milestone M1')
      expect(rendered!.text).not.toContain('# Decision Register')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('disables register discovery with an empty candidate list', async () => {
    const root = await tempRepo()
    const home = await tempRepo()
    try {
      await write(join(root, '.git'), '')
      await write(join(root, 'DECISIONS.md'), registerTable(['| M1 | 2026-10-02 | milestone | Dial | done | updated@abc12345 |']))

      const files = await discoverBaselineInstructionFiles({
        cwd: root,
        dshHome: home,
        registerFileCandidates: [],
      })
      expect(files.find(file => file.displayPath === 'DECISIONS.md')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('discovers a present register candidate on the host filesystem', async () => {
    const root = await tempRepo()
    const home = await tempRepo()
    try {
      await write(join(root, '.git'), '')
      await write(join(root, 'DECISIONS.md'), registerTable(['| M1 | 2026-10-02 | milestone | Dial | done | updated@abc12345 |']))

      const files = await discoverBaselineInstructionFiles({ cwd: root, dshHome: home })
      // Architecture resolution is part of load, not discovery; discovery still finds the register.
      expect(files.find(file => file.displayPath === 'DECISIONS.md')).toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  })

  it('loads with provider and renders rows with a changed diagram freshness', async () => {
    const ctx = new Context()
    await ctx.plugin(RecordingFileSystem)
    const fs = ctx.fs as RecordingFileSystem
    const root = resolve(tmpdir(), 'ai-register-provider')
    fs.entries.set(FsTargetKey(join(root, '.git')), { type: 'dir' })
    fs.entries.set(FsTargetKey(join(root, 'DECISIONS.md')), {
      type: 'file',
      content: registerTable(['| M1 | 2026-10-02 | milestone | Dial | done | updated@abc12345 |']),
    })
    fs.entries.set(FsTargetKey(join(root, 'ARCHITECTURE.md')), { type: 'file', content: '```mermaid\ngraph TD\nB[two]\n```' })

    try {
      const rendered = await loadBaselineInstructions(
        { cwd: root, dshHome: join(root, 'dsh'), maxBytes: 65536 },
        fs,
      )
      expect(rendered).toBeDefined()
      expect(rendered!.text).toContain('Instructions from: DECISIONS.md')
      expect(rendered!.text).toContain('Latest milestone M1')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
