// @vitest-environment jsdom
/** The Architecture view body: diagram, milestone status strip, and status lines. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResourceSnapshot, UseResource } from '@deepseek-ai/dsh-client-resources/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileStat } from '@deepseek-ai/dsh-api-workspace-files/types'
import { diagramFingerprint, formatRegisterRow } from '@deepseek-ai/dsh-util-project-register'
import { ArchitectureView, type ArchitectureViewProps } from '../src/client/ArchitectureView.tsx'
import { en } from '../src/client/locales.ts'
import type { ArchitectureInjected } from '../src/client/face.ts'
import { createArchitectureStore, type ArchitectureState } from '../src/client/store.ts'

const SESSION = 'session-arch' as SessionId
const DIAGRAM = 'graph TD;\n  A-->B'
const ARCHITECTURE_TEXT = `# Architecture\n\n\`\`\`mermaid\n${DIAGRAM}\n\`\`\`\n`
const MILESTONE = formatRegisterRow({
  id: 'M1', date: '2026-09-21', kind: 'milestone', title: 'Freeze',
  status: 'done', diagram: { flag: 'stale', fingerprint: diagramFingerprint(DIAGRAM) },
})

function resource(overrides: Partial<ResourceSnapshot<WorkspaceFileStat>>) {
  return (() => ({
    status: 'live',
    value: { absolutePath: '/ws/x.md', version: 'v1' },
    failure: undefined,
    ...overrides,
  })) as UseResource
}

interface BenchOptions {
  meta?: Partial<ResourceSnapshot<WorkspaceFileStat>>
  registerMeta?: Partial<ResourceSnapshot<WorkspaceFileStat>>
  seed?: (state: ArchitectureState) => void
  face?: Partial<ArchitectureInjected>
}

function props(b: ReturnType<typeof benchState>, options: BenchOptions): ArchitectureViewProps {
  const meta = resource(options.meta ?? {})
  const registerMeta = resource(options.registerMeta ?? {})
  return {
    sessionId: SESSION,
    useResource: (address: string) => (address.endsWith('DECISIONS.md') ? registerMeta(address) : meta(address)),
    useStore: <S,>(select: (state: ArchitectureState) => S): S => select(b.instance.getSnapshot()),
    actions: b.instance.actions,
    loadArchitecture: b.loadArchitecture,
    loadRegister: b.loadRegister,
    renderDiagram: b.renderDiagram,
    ...options.face,
    t: makeTranslate(en),
    inspectCall: undefined,
    viewRequest: null,
    openView: () => {},
    completeViewRequest: () => {},
  } as unknown as ArchitectureViewProps
}

function benchState(options: BenchOptions) {
  const store = createArchitectureStore()
  const instance = store.create('session-1')
  options.seed?.(instance.getSnapshot())
  return {
    instance,
    loadArchitecture: vi.fn<(version: string) => void>(),
    loadRegister: vi.fn<(version: string) => void>(),
    renderDiagram: vi.fn<(source: string) => void>(),
  }
}

function bench(options: BenchOptions = {}) {
  const state = benchState(options)
  const view = render(<ArchitectureView {...props(state, options)} />)
  return { ...view, ...state, rerenderWith: () => view.rerender(<ArchitectureView {...props(state, options)} />) }
}

afterEach(cleanup)

describe('ArchitectureView', () => {
  it('reads each document once per observed metadata version', () => {
    const b = bench()
    expect(b.loadArchitecture).toHaveBeenCalledWith('v1')
    expect(b.loadRegister).toHaveBeenCalledWith('v1')
    expect(b.getByText(en['diagram.absent'])).toBeTruthy()
  })

  it('renders the loaded diagram and the latest milestone strip', () => {
    const b = bench({
      seed: (state) => {
        state.architecture = { status: 'ready', text: ARCHITECTURE_TEXT, version: 'v1', observedVersion: 'v1' }
        state.register = { status: 'ready', text: `${MILESTONE}\n`, version: 'v1', observedVersion: 'v1' }
        state.render = { status: 'ready', source: DIAGRAM, svg: '<svg data-testid="diagram"></svg>' }
      },
    })
    expect(b.loadArchitecture).not.toHaveBeenCalled()
    expect(b.container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText(en['diagram.stale'])).toBeTruthy()
    expect(screen.getByText(en['diagram.stale.action'])).toBeTruthy()
    expect(screen.getByText('M1 · 2026-09-21')).toBeTruthy()
  })

  it('asks for a render when the diagram source is unrendered', () => {
    const b = bench({
      seed: (state) => {
        state.architecture = { status: 'ready', text: ARCHITECTURE_TEXT, version: 'v1', observedVersion: 'v1' }
      },
    })
    expect(b.renderDiagram).toHaveBeenCalledWith(DIAGRAM)
  })

  it('reports a missing architecture file with its action line', () => {
    const b = bench({
      meta: { status: 'failed', value: undefined },
      seed: (state) => {
        state.architecture = { status: 'failed', failureCode: 'workspace-file/not-found', observedVersion: 'v1' }
      },
    })
    expect(b.getByText(en['error.missing'])).toBeTruthy()
    expect(b.queryByText(en['diagram.stale.action'])).toBeNull()
  })

  it('offers a retry for a failed read', () => {
    const b = bench({
      meta: { status: 'failed', value: undefined },
      seed: (state) => {
        state.architecture = { status: 'failed', failureCode: 'gateway/internal', observedVersion: 'v2' }
      },
    })
    expect(b.getByText(en['error.read'])).toBeTruthy()
    fireEvent.click(b.getByText(en['retry']))
    expect(b.loadArchitecture).toHaveBeenCalledWith('v2')
  })

  it('retries a failed read with no observed version', () => {
    const b = bench({
      meta: { status: 'failed', value: undefined },
      seed: (state) => {
        state.architecture = { status: 'failed', failureCode: 'gateway/internal' }
      },
    })
    fireEvent.click(b.getByText(en['retry']))
    expect(b.loadArchitecture).toHaveBeenCalledWith('')
  })

  it('reports a document with no diagram', () => {
    const b = bench({
      seed: (state) => {
        state.architecture = { status: 'ready', text: '# Architecture\n', version: 'v1', observedVersion: 'v1' }
      },
    })
    expect(b.getByText(en['error.noDiagram'])).toBeTruthy()
  })

  it('reports a failed render', () => {
    const b = bench({
      seed: (state) => {
        state.architecture = { status: 'ready', text: ARCHITECTURE_TEXT, version: 'v1', observedVersion: 'v1' }
        state.render = { status: 'failed', source: DIAGRAM }
      },
    })
    expect(b.getByText(en['render.failed'])).toBeTruthy()
  })
})
