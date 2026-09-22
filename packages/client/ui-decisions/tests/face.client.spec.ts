/** The decisions face: ordered register reads into the store. */
import { describe, expect, it, vi } from 'vitest'
import type { ProjectTextResult } from '@deepseek-ai/dsh-util-project-register'
import { registerFace } from '../src/client/face.ts'
import { createRegisterStore } from '../src/client/store.ts'

function bench() {
  const store = createRegisterStore()
  const instance = store.create('session-1')
  return { instance, state: () => instance.getSnapshot(), actions: instance.actions }
}

function deferred<T>() {
  return Promise.withResolvers<T>()
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('registerFace', () => {
  it('records a successful read with its text and version', async () => {
    const b = bench()
    const read = vi.fn(async (): Promise<ProjectTextResult> => ({ ok: true, value: { text: '| D1 |', version: 'v1' } }))
    const face = registerFace(read)(b.actions)

    face.loadRegister('v1')
    expect(b.state().doc.status).toBe('loading')
    expect(b.state().doc.observedVersion).toBe('v1')

    await vi.waitFor(() => { expect(b.state().doc.status).toBe('ready') })
    expect(read).toHaveBeenCalledWith('DECISIONS.md')
    expect(b.state().doc).toMatchObject({ status: 'ready', text: '| D1 |', version: 'v1' })
  })

  it('records the failure code of a failed read', async () => {
    const b = bench()
    const read = vi.fn(async (): Promise<ProjectTextResult> => ({ ok: false, error: { code: 'workspace-file/not-found' } }))
    const face = registerFace(read)(b.actions)

    face.loadRegister('v3')

    await vi.waitFor(() => { expect(b.state().doc.status).toBe('failed') })
    expect(b.state().doc).toMatchObject({
      status: 'failed', failureCode: 'workspace-file/not-found', observedVersion: 'v3',
    })
  })

  it('reports a rejected read as a gateway failure', async () => {
    const b = bench()
    const face = registerFace(async () => { throw new Error('transport') })(b.actions)

    face.loadRegister('v1')

    await vi.waitFor(() => { expect(b.state().doc.status).toBe('failed') })
    expect(b.state().doc).toMatchObject({ status: 'failed', failureCode: 'gateway/internal' })
  })

  it('settles queued reads in submission order', async () => {
    const b = bench()
    const first = deferred<ProjectTextResult>()
    const second = deferred<ProjectTextResult>()
    const read = vi.fn<(path: string) => Promise<ProjectTextResult>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const face = registerFace(read)(b.actions)

    face.loadRegister('v1')
    face.loadRegister('v2')
    // Resolutions arrive out of submission order; the slow first read settles
    // after the fast second and must not overwrite it — the queue settles in
    // submission order regardless.
    second.resolve({ ok: true, value: { text: 'newer', version: 'v2' } })
    first.resolve({ ok: true, value: { text: 'older', version: 'v1' } })

    await vi.waitFor(() => { expect(b.state().doc.version).toBe('v2') })
    await flush()
    expect(b.state().doc).toMatchObject({ status: 'ready', text: 'newer', version: 'v2' })
  })
})
