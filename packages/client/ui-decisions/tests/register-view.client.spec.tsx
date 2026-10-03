// @vitest-environment jsdom
/** The Decisions view body: the register table and its status lines. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResourceSnapshot, UseResource } from '@deepseek-ai/dsh-client-resources/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { MilestoneCostProjection } from '@deepseek-ai/dsh-decision-cost/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileStat } from '@deepseek-ai/dsh-api-workspace-files/types'
import {
  diagramFingerprint, formatRegisterRow, type RegisterRow,
} from '@deepseek-ai/dsh-util-project-register'
import { DecisionsView, type DecisionsViewProps } from '../src/client/DecisionsView.tsx'
import { en } from '../src/client/locales.ts'
import type { RegisterInjected } from '../src/client/face.ts'
import { createRegisterStore, type RegisterState } from '../src/client/store.ts'

const SESSION = 'session-decisions' as SessionId
const DIAGRAM = 'graph TD;\n  A-->B'
const DECISION: RegisterRow = {
  id: 'D1', date: '2026-09-20', kind: 'decision', title: 'Adopt a decision register',
  status: 'accepted', diagram: null,
}
const MILESTONE: RegisterRow = {
  id: 'M1', date: '2026-09-21', kind: 'milestone', title: 'Freeze',
  status: 'done', diagram: { flag: 'stale', fingerprint: diagramFingerprint(DIAGRAM) },
}
const REGISTER_TEXT = `${formatRegisterRow(DECISION)}\n${formatRegisterRow(MILESTONE)}\n`

function resource(overrides: Partial<ResourceSnapshot<WorkspaceFileStat>>): UseResource {
  return ((_address: string) => ({
    status: 'live',
    value: { absolutePath: '/ws/DECISIONS.md', version: 'v1' },
    failure: undefined,
    ...overrides,
  })) as UseResource
}

type StoreInstance = ReturnType<ReturnType<typeof createRegisterStore>['create']>

interface BenchOptions {
  meta?: Partial<ResourceSnapshot<WorkspaceFileStat>>
  seed?: (instance: StoreInstance) => void
  face?: Partial<RegisterInjected>
  projection?: MilestoneCostProjection
  readState?: 'idle' | 'loading' | 'ready' | 'error' | undefined
}

function benchState(options: BenchOptions) {
  const store = createRegisterStore()
  const instance = store.create('session-1')
  options.seed?.(instance)
  return {
    instance,
    loadRegister: vi.fn<(version: string) => void>(),
  }
}

function props(b: ReturnType<typeof benchState>, options: BenchOptions): DecisionsViewProps {
  return {
    sessionId: SESSION,
    useResource: resource(options.meta ?? {}),
    useStore: <S,>(select: (state: RegisterState) => S): S => select(b.instance.getSnapshot()),
    useProjection: () => options.projection,
    useSessions: (select: unknown) =>
      (select as (list: object) => unknown)(
        { projectionsBySession: { [SESSION]: { state: options.readState } } } as object,
      ),
    actions: b.instance.actions,
    loadRegister: b.loadRegister,
    retryCost: () => {},
    ...options.face,
    t: makeTranslate(en),
    inspectCall: undefined,
    viewRequest: null,
    openView: () => {},
    completeViewRequest: () => {},
  } as unknown as DecisionsViewProps
}

function bench(options: BenchOptions = {}) {
  const state = benchState(options)
  const view = render(<DecisionsView {...props(state, options)} />)
  return {
    ...view, ...state,
    rerenderWith: (next: BenchOptions = {}) =>
      view.rerender(<DecisionsView {...props(state, { ...options, ...next })} />),
  }
}

function seeded(instance: StoreInstance): void {
  instance.actions.loading('v1')
  instance.actions.loaded(REGISTER_TEXT, 'v1')
}

afterEach(cleanup)

/** Clipboard writes the next copy attempt resolves with, or undefined to reject. */
let clipboardResult: boolean | undefined

function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn(() => clipboardResult === true
    ? Promise.resolve()
    : Promise.reject(new Error('denied')))
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })
  return { writeText }
}

beforeEach(() => { clipboardResult = true })
afterEach(() => {
  Reflect.deleteProperty(globalThis.navigator, 'clipboard')
})

describe('DecisionsView', () => {
  it('copies the register document and reverts the label', async () => {
    vi.useFakeTimers()
    try {
      const { writeText } = stubClipboard()
      const b = bench({ seed: seeded })
      const button = b.container.querySelector('[data-decisions-copy]') as HTMLButtonElement

      expect(button.textContent).toBe(en['action.copy'])
      fireEvent.click(button)

      await vi.waitFor(() => { expect(button.textContent).toBe(en['action.copied']) })
      expect(writeText).toHaveBeenCalledWith(REGISTER_TEXT)

      await vi.advanceTimersByTimeAsync(2_000)
      expect(button.textContent).toBe(en['action.copy'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a denied clipboard write', async () => {
    clipboardResult = false
    stubClipboard()
    const b = bench({ seed: seeded })
    const button = b.container.querySelector('[data-decisions-copy]') as HTMLButtonElement

    fireEvent.click(button)

    await vi.waitFor(() => { expect(button.textContent).toBe(en['action.copyDenied']) })
  })

  it('offers no copy control before a register is loaded', () => {
    const b = bench()

    expect(b.container.querySelector('[data-decisions-copy]')).toBeNull()
  })

  it('reads the register once per observed metadata version', () => {
    const b = bench()
    expect(b.loadRegister).toHaveBeenCalledTimes(1)
    expect(b.loadRegister).toHaveBeenCalledWith('v1')
    expect(screen.getByText(en.loading)).toBeTruthy()

    b.rerenderWith()

    expect(b.loadRegister).toHaveBeenCalledTimes(1)
  })

  it('renders rows newest first with localized kind, status, and diagram labels', () => {
    const b = bench({ seed: seeded })

    expect(b.loadRegister).not.toHaveBeenCalled()
    const rows = b.container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('M1')
    expect(rows[0]!.textContent).toContain('Freeze')
    expect(rows[1]!.textContent).toContain('D1')
    expect(rows[0]!.textContent).toContain(en['kind.milestone'])
    expect(rows[0]!.textContent).toContain(en['status.done'])
    expect(rows[1]!.textContent).toContain(en['kind.decision'])
    expect(rows[1]!.textContent).toContain(en['status.accepted'])
    expect(rows[1]!.textContent).toContain(en['diagram.none'])
    for (const header of ['column.id', 'column.date', 'column.kind', 'column.title', 'column.status', 'column.diagram'] as const) {
      expect(screen.getByText(en[header])).toBeTruthy()
    }
  })

  it('marks the latest milestone row and shows its stale diagram chip', () => {
    const b = bench({ seed: seeded })

    const latest = b.container.querySelector('tr[data-decisions-latest]')
    expect(latest?.textContent).toContain('M1')
    expect(latest?.textContent).toContain(en['diagram.stale'])
    expect(screen.getByText(en['diagram.stale'])).toBeTruthy()
  })

  it('reports a missing register file with one line', () => {
    const b = bench({
      meta: { status: 'failed', value: undefined },
      seed: (instance: StoreInstance) => {
        instance.actions.loading('v1')
        instance.actions.failed('workspace-file/not-found')
      },
    })
    expect(b.container.textContent).toBe(en['error.missing'])
  })

  it('offers a retry for a failed read with the observed version', () => {
    const b = bench({
      meta: { status: 'failed', value: undefined },
      seed: (instance: StoreInstance) => {
        instance.actions.loading('v2')
        instance.actions.failed('gateway/internal')
      },
    })
    expect(b.getByText(en['error.read'])).toBeTruthy()

    fireEvent.click(b.getByText(en.retry))

    expect(b.loadRegister).toHaveBeenCalledTimes(1)
    expect(b.loadRegister).toHaveBeenCalledWith('v2')
  })

  it('retries a failed read with no observed version', () => {
    const b = bench({
      meta: { status: 'failed', value: undefined },
      seed: (instance: StoreInstance) => {
        instance.actions.failed('gateway/internal')
      },
    })

    fireEvent.click(b.getByText(en.retry))

    expect(b.loadRegister).toHaveBeenCalledWith('')
  })

  it('reports a ready register with no rows', () => {
    const b = bench({
      seed: (instance: StoreInstance) => {
        instance.actions.loading('v1')
        instance.actions.loaded('# Decisions\n', 'v1')
      },
    })
    expect(b.container.querySelector('[data-decisions-state="empty"]')?.textContent).toBe(en.empty)
    // The document still holds prose worth copying even without a parsed row.
    expect(b.container.querySelector('[data-decisions-copy]')).toBeTruthy()
  })

  it('does not re-read a failed register until the file moves', () => {
    const b = bench({
      meta: { status: 'failed', value: undefined },
      seed: (instance: StoreInstance) => {
        instance.actions.loading('v1')
        instance.actions.failed('gateway/internal')
      },
    })
    expect(b.loadRegister).not.toHaveBeenCalled()

    b.rerenderWith({ meta: { value: { absolutePath: '/ws/DECISIONS.md', version: 'v2' } } })

    expect(b.loadRegister).toHaveBeenCalledWith('v2')
  })

  it('shows a resolved milestone figure with its derived-estimate label', () => {
    const b = bench({ seed: seeded, projection: { M1: 120 } as MilestoneCostProjection })

    const cell = b.container.querySelector('[data-decisions-cost="120"]')!
    expect(cell.textContent).toContain('120')
    expect(cell.textContent).toContain(en['cost.estimate'])
  })

  it('labels a milestone cost pending while its projection has not arrived', () => {
    const b = bench({ seed: seeded })

    expect(b.container.querySelector('[data-decisions-cost="pending"]')).toBeTruthy()
  })

  it('labels a milestone cost unavailable when its fold value is absent', () => {
    const b = bench({ seed: seeded, projection: {} as MilestoneCostProjection })

    expect(b.container.querySelector('[data-decisions-cost="unavailable"]')).toBeTruthy()
  })

  it('labels a milestone cost unavailable when its fold value is null', () => {
    const b = bench({ seed: seeded, projection: { M1: null } as MilestoneCostProjection })

    expect(b.container.querySelector('[data-decisions-cost="unavailable"]')).toBeTruthy()
  })

  it('reports a failed cost read and retries it once through the face', () => {
    const retryCost = vi.fn()
    const b = bench({ seed: seeded, readState: 'error', face: { retryCost } })

    expect(b.container.querySelector('[data-decisions-cost="error"]')).toBeTruthy()
    // A present milestone figure is not claimed while the read is failed.
    expect(b.container.querySelector('[data-decisions-cost="unavailable"]')).toBeNull()
    const strip = b.container.querySelector('[data-decisions-cost-failed]')!
    fireEvent.click(strip.querySelector('[data-decisions-cost-retry]') as HTMLButtonElement)

    expect(retryCost).toHaveBeenCalledTimes(1)
  })
})
