import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { RemoteError, type RemoteFailure, type RemoteResult, type RemoteStreamHandle } from '@deepseek-ai/dsh-typert-protocol'
import { streamHandle } from '@deepseek-ai/dsh-remote-mock'
import { ClientWorkspaceModel, type WorkspaceRemote } from '../src/client/index.ts'
import { WorkspaceArchiveError, WorkspaceController } from '../src/client/index.ts'
import type {
  WorkspaceArchiveValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceFleetHaltRequest,
  WorkspaceFleetHaltValue,
  WorkspaceFollowFrame,
  WorkspaceId,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspacePinSessionRequest,
  WorkspacePinValue,
  WorkspaceRenameRequest,
  WorkspaceUnarchiveSessionRequest,
  WorkspaceUnpinSessionRequest,
  WorkspaceValue,
  WorkspaceView,
} from '../src/types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const sid = (id: string): SessionId => id as SessionId

function workspace(id: string): WorkspaceView {
  return {
    workspaceId: id as WorkspaceId,
    path: `/w/${id}`,
    title: id,
    sessionIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function remoteOk<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function workspaceError(error: RemoteFailure): RemoteResult<never> {
  return { ok: false, error }
}

class FakeWorkspaceRemote implements WorkspaceRemote {
  readonly initializeDefault = vi.fn<WorkspaceRemote['initializeDefault']>(async () => remoteOk({ workspace: workspace('default') }))
  readonly calls: Array<{ readonly method: string; readonly request: unknown }> = []
  onCreate: (request: WorkspaceCreateRequest) => Promise<RemoteResult<WorkspaceCreateValue>> = () =>
    Promise.resolve(remoteOk({ workspace: workspace('created'), created: true }))
  onRename: (request: WorkspaceRenameRequest) => Promise<RemoteResult<WorkspaceValue>> = () =>
    Promise.resolve(remoteOk({ workspace: workspace(String(request.workspaceId)) }))
  onDelete: () => Promise<RemoteResult<WorkspaceDeleteValue>> = () => Promise.resolve(remoteOk({ deleted: true }))
  onInsertBefore: () => Promise<RemoteResult<WorkspaceOrderValue>> = () => Promise.resolve(remoteOk({ workspaceIds: [] }))
  onInsertSessionBefore: () => Promise<RemoteResult<WorkspaceValue>> = () =>
    Promise.resolve(remoteOk({ workspace: workspace('moved') }))
  onArchiveSession: () => Promise<RemoteResult<WorkspaceArchiveValue>> = () =>
    Promise.resolve(remoteOk({ archivedSessionIds: [] }))
  onFleetHalt: () => Promise<RemoteResult<WorkspaceFleetHaltValue>> = () =>
    Promise.resolve(remoteOk({ archivedSessionIds: [] }))
  onUnarchiveSession: () => Promise<RemoteResult<WorkspaceArchiveValue>> = () =>
    Promise.resolve(remoteOk({ archivedSessionIds: [] }))
  onPinSession: () => Promise<RemoteResult<WorkspacePinValue>> = () =>
    Promise.resolve(remoteOk({ pinnedSessionIds: [] }))
  onUnpinSession: () => Promise<RemoteResult<WorkspacePinValue>> = () =>
    Promise.resolve(remoteOk({ pinnedSessionIds: [] }))

  private record(method: string, request: unknown): void {
    this.calls.push({ method, request })
  }

  create(request: WorkspaceCreateRequest): Promise<RemoteResult<WorkspaceCreateValue>> {
    this.record('create', request)
    return this.onCreate(request)
  }

  rename(request: WorkspaceRenameRequest): Promise<RemoteResult<WorkspaceValue>> {
    this.record('rename', request)
    return this.onRename(request)
  }

  delete(request: WorkspaceDeleteRequest): Promise<RemoteResult<WorkspaceDeleteValue>> {
    this.record('delete', request)
    return this.onDelete(request)
  }

  insertBefore(request: WorkspaceInsertBeforeRequest): Promise<RemoteResult<WorkspaceOrderValue>> {
    this.record('insertBefore', request)
    return this.onInsertBefore(request)
  }

  insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<RemoteResult<WorkspaceValue>> {
    this.record('insertSessionBefore', request)
    return this.onInsertSessionBefore(request)
  }

  archiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<RemoteResult<WorkspaceArchiveValue>> {
    this.record('archiveSession', request)
    return this.onArchiveSession(request)
  }

  fleetHalt(request: WorkspaceFleetHaltRequest): Promise<RemoteResult<WorkspaceFleetHaltValue>> {
    this.record('fleetHalt', request)
    return this.onFleetHalt(request)
  }

  unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<RemoteResult<WorkspaceArchiveValue>> {
    this.record('unarchiveSession', request)
    return this.onUnarchiveSession(request)
  }

  pinSession(request: WorkspacePinSessionRequest): Promise<RemoteResult<WorkspacePinValue>> {
    this.record('pinSession', request)
    return this.onPinSession(request)
  }

  unpinSession(request: WorkspaceUnpinSessionRequest): Promise<RemoteResult<WorkspacePinValue>> {
    this.record('unpinSession', request)
    return this.onUnpinSession(request)
  }

  follow(_signal?: AbortSignal): RemoteStreamHandle<WorkspaceFollowFrame, never> {
    return streamHandle<WorkspaceFollowFrame>((async function* () {})())
  }
}

function controllerFor(remote = new FakeWorkspaceRemote()): WorkspaceController {
  const model = new ClientWorkspaceModel(remote)
  model.replaceBaseline({ items: [], archivedSessionIds: [], pinnedSessionIds: [] })
  return new WorkspaceController(new Context(), model)
}

describe('WorkspaceController client commands', () => {
  it('halts every archivable Session and returns the Host archive set', async () => {
    const remote = new FakeWorkspaceRemote()
    remote.onFleetHalt = () => Promise.resolve(remoteOk({ archivedSessionIds: [sid('a'), sid('b')] }))
    const controller = controllerFor(remote)

    await expect(controller.fleetHalt()).resolves.toEqual([sid('a'), sid('b')])
    expect(remote.calls).toContainEqual({ method: 'fleetHalt', request: {} })

    await expect(controller.fleetHalt({ stopActivity: true })).resolves.toEqual([sid('a'), sid('b')])
    expect(remote.calls).toContainEqual({ method: 'fleetHalt', request: { stopActivity: true } })
  })

  it('maps a refusing fleet halt to the archive failure the surface can name', async () => {
    const remote = new FakeWorkspaceRemote()
    remote.onFleetHalt = () => Promise.resolve(workspaceError(
      new RemoteError('workspace/session-active', 'session is active', {
        sessionId: sid('session'),
        activity: [{ kind: 'probe' }],
      }),
    ))
    const controller = controllerFor(remote)

    const halt = controller.fleetHalt()
    await expect(halt).rejects.toBeInstanceOf(WorkspaceArchiveError)
    await expect(halt).rejects.toMatchObject({
      name: 'WorkspaceArchiveError',
      rpcError: { code: 'workspace/session-active' },
    })
  })
})
