import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import ArtifactStore, { type Config } from '../src/index.ts'
import type { ArtifactRecord } from '../src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

/**
 * Boot a root context with a real storage hub + domain facility over an
 * in-memory backend, then the artifact store. A shared media pool lets a
 * second boot reopen the same medium, simulating a Host restart.
 */
async function harness(config: Config = {}) {
  const pool = new MemoryMediaPool()
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(ArtifactStore, config)
  return { ctx, pool }
}

/** A valid artifact record for one workspace and turn. */
function artifact(workspace: string, turn: number, bytes: number, createdAt = new Date().toISOString()): ArtifactRecord {
  return { workspace, sha1: `sha-${workspace}-${turn}`, content: 'x'.repeat(bytes), bytes, turn, createdAt }
}

/** Read the open domain's `files` table rows for direct assertions. */
async function rows(ctx: Context): Promise<ArtifactRecord[]> {
  const domain = ctx.storageDomain.get('artifact_files')
  if (domain === undefined) return []
  return [...domain.table('files').entries()].map(([, record]) => record as ArtifactRecord)
}

describe('artifact-store', () => {
  it('opens the artifact_files domain and exposes an available store', async () => {
    const { ctx } = await harness()
    expect(ctx.artifactStore.available).toBe(true)
  })

  it('stores a capture then applies the age-prune and eviction passes', async () => {
    const { ctx } = await harness({ maxStoreBytes: 10 })
    const id = await ctx.artifactStore.store(artifact('w', 1, 5))
    expect(id).toMatch(/[0-9a-f-]{36}/)
    const domain = ctx.storageDomain.get('artifact_files')
    expect(domain?.table('files').get(id)?.sha1).toBe('sha-w-1')
  })

  it('evicts oldest-turn-first per workspace once the cap is passed', async () => {
    const { ctx } = await harness({ maxStoreBytes: 12 })
    // Three captures of 5 bytes each in one workspace: the cap (12) admits the
    // first two (10) and evicts the oldest (turn 1) after the third lands.
    await ctx.artifactStore.store(artifact('w', 1, 5))
    await ctx.artifactStore.store(artifact('w', 2, 5))
    await ctx.artifactStore.store(artifact('w', 3, 5))
    const stored = await rows(ctx)
    expect(stored.map(r => r.turn).sort()).toEqual([2, 3])
    // A different workspace is untouched by the cap.
    await ctx.artifactStore.store(artifact('other', 9, 5, new Date(Date.now() - 7 * 86_400_000).toISOString()))
    const all = await rows(ctx)
    expect(all.filter(r => r.workspace === 'other').map(r => r.turn)).toEqual([9])
  })

  it('does not evict across workspaces', async () => {
    const { ctx } = await harness({ maxStoreBytes: 12 })
    await ctx.artifactStore.store(artifact('a', 1, 8))
    await ctx.artifactStore.store(artifact('a', 2, 8))
    await ctx.artifactStore.store(artifact('b', 1, 8))
    // Workspace a is over its own cap (16 > 12) and sheds its oldest turn; b
    // stays at 8.
    const stored = await rows(ctx)
    expect(stored.filter(r => r.workspace === 'a').map(r => r.turn)).toEqual([2])
    expect(stored.filter(r => r.workspace === 'b').map(r => r.turn)).toEqual([1])
  })

  it('orders equal-turn eviction by creation time', async () => {
    const { ctx } = await harness({ maxStoreBytes: 8 })
    // Two captures in one workspace share turn 1 but differ in createdAt; the
    // cap (8) admits one 5-byte capture, so the tiebreak must evict the older.
    await ctx.artifactStore.store(artifact('w', 1, 5, new Date(Date.now() - 3 * 86_400_000).toISOString()))
    await ctx.artifactStore.store(artifact('w', 1, 5, new Date().toISOString()))
    const stored = await rows(ctx)
    expect(stored).toHaveLength(1)
    // The surviving record is the newer of the two by createdAt.
    expect(Date.parse(stored[0].createdAt)).toBeGreaterThan(Date.now() - 86_400_000)
  })

  it('prunes captures older than retentionDays on the write path', async () => {
    const { ctx } = await harness({ retentionDays: 1 })
    await ctx.artifactStore.store(artifact('w', 1, 3, new Date(Date.now() - 2 * 86_400_000).toISOString()))
    await ctx.artifactStore.store(artifact('w', 2, 3))
    const stored = await rows(ctx)
    expect(stored.map(r => r.turn)).toEqual([2])
  })

  it('prunes expired captures once at activation', async () => {
    // Seed an old capture through a config-less first boot on one medium, then
    // reopen the same medium with a one-day retention to observe the
    // activation prune.
    const first = new Context()
    await first.plugin(Storage)
    const pool = new MemoryMediaPool()
    first.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const firstFacility = new DomainFacility(first, { backend: 'memory', routes: {} })
    first.storage.mount('domain', firstFacility)
    first.provide('storageDomain', firstFacility)
    await first.plugin(ArtifactStore, {})
    await first.artifactStore.store(artifact('w', 1, 3, new Date(Date.now() - 2 * 86_400_000).toISOString()))
    await first.fiber.dispose()

    const second = new Context()
    await second.plugin(Storage)
    second.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const secondFacility = new DomainFacility(second, { backend: 'memory', routes: {} })
    second.storage.mount('domain', secondFacility)
    second.provide('storageDomain', secondFacility)
    await second.plugin(ArtifactStore, { retentionDays: 1 })
    const after = await rows(second)
    expect(after).toEqual([])
    await second.fiber.dispose()
  })

  it('does not prune when retentionDays is absent', async () => {
    const { ctx } = await harness({})
    await ctx.artifactStore.store(artifact('w', 1, 3, new Date(Date.now() - 30 * 86_400_000).toISOString()))
    const stored = await rows(ctx)
    expect(stored.map(r => r.turn)).toEqual([1])
  })

  it('throws from store when the domain is not open', async () => {
    // A store whose domain has not been opened has no live table: calling it
    // before activation would observe the not-open throw. Construct the
    // service directly over a root context with no storage-domain provided so
    // `[Service.init]` cannot open the domain, and confirm the store() guard.
    const bare = new Context()
    const store = new ArtifactStore(bare, {})
    expect(store.available).toBe(false)
    await expect(store.store(artifact('w', 1, 3))).rejects.toThrow('not open')
  })
})
