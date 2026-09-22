/** The architecture face: ordered reads and renders into the store. */
import { describe, expect, it, vi } from 'vitest'
import type { ProjectTextResult } from '@deepseek-ai/dsh-util-project-register'
import { architectureFace } from '../src/client/face.ts'
import { createArchitectureStore } from '../src/client/store.ts'

function bench() {
  const store = createArchitectureStore()
  const instance = store.create('session-1')
  return { instance, state: () => instance.getSnapshot(), actions: instance.actions }
}

function deferred<T>() {
  return Promise.withResolvers<T>()
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('architectureFace', () => {
  it('records a successful read with its text and version', async () => {
    const b = bench()
    const read = vi.fn(async (): Promise<ProjectTextResult> => ({ ok: true, value: { text: '# d', version: 'v1' } }))
    const face = architectureFace(read, async () => '<svg/>')(b.actions)

    face.loadArchitecture('v1')
    expect(b.state().architecture.status).toBe('loading')
    expect(b.state().architecture.observedVersion).toBe('v1')

    await vi.waitFor(() => { expect(b.state().architecture.status).toBe('ready') })
    expect(read).toHaveBeenCalledWith('ARCHITECTURE.md')
    expect(b.state().architecture).toMatchObject({ status: 'ready', text: '# d', version: 'v1' })
  })

  it('records the failure code of a failed read and reads the register too', async () => {
    const b = bench()
    const read = vi.fn(async (): Promise<ProjectTextResult> => ({ ok: false, error: { code: 'workspace-file/not-found' } }))
    const face = architectureFace(read, async () => '<svg/>')(b.actions)

    face.loadRegister('v3')

    await vi.waitFor(() => { expect(b.state().register.status).toBe('failed') })
    expect(read).toHaveBeenCalledWith('DECISIONS.md')
    expect(b.state().register).toMatchObject({ status: 'failed', failureCode: 'workspace-file/not-found', observedVersion: 'v3' })
  })

  it('reports a rejected read as a gateway failure', async () => {
    const b = bench()
    const face = architectureFace(async () => { throw new Error('transport') }, async () => '<svg/>')(b.actions)

    face.loadArchitecture('v1')

    await vi.waitFor(() => { expect(b.state().architecture.status).toBe('failed') })
    expect(b.state().architecture).toMatchObject({ status: 'failed', failureCode: 'gateway/internal' })
  })

  it('settles queued work in submission order', async () => {
    const b = bench()
    const first = deferred<ProjectTextResult>()
    const second = deferred<ProjectTextResult>()
    const read = vi.fn<(path: string) => Promise<ProjectTextResult>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const face = architectureFace(read, async () => '<svg/>')(b.actions)

    face.loadArchitecture('v1')
    face.loadArchitecture('v2')
    // Resolutions arrive out of submission order; the queue still settles in it.
    second.resolve({ ok: true, value: { text: 'newer', version: 'v2' } })
    first.resolve({ ok: true, value: { text: 'older', version: 'v1' } })

    await vi.waitFor(() => { expect(b.state().architecture.version).toBe('v2') })
    await flush()
    expect(b.state().architecture).toMatchObject({ status: 'ready', text: 'newer', version: 'v2' })
  })

  it('records rendered SVG and a failed render', async () => {
    const b = bench()
    const face = architectureFace(
      async (): Promise<ProjectTextResult> => ({ ok: true, value: { text: '', version: 'v1' } }),
      async (source) => {
        if (source === 'bad') throw new Error('parse')
        return '<svg/>'
      },
    )(b.actions)

    face.renderDiagram('graph TD;')

    await vi.waitFor(() => { expect(b.state().render.status).toBe('ready') })
    expect(b.state().render).toMatchObject({ status: 'ready', source: 'graph TD;', svg: '<svg/>' })

    face.renderDiagram('bad')

    await vi.waitFor(() => { expect(b.state().render.status).toBe('failed') })
    expect(b.state().render).toMatchObject({ status: 'failed', source: 'bad' })
  })

  it('keeps a settlement for a superseded render out of the store', async () => {
    const b = bench()
    const face = architectureFace(
      async (): Promise<ProjectTextResult> => ({ ok: true, value: { text: '', version: 'v1' } }),
      async () => '<svg/>',
    )(b.actions)

    face.renderDiagram('one')
    b.actions.rendering('two')
    await flush()
    b.actions.renderFailed('one')

    expect(b.state().render).toMatchObject({ status: 'rendering', source: 'two' })
  })
})
