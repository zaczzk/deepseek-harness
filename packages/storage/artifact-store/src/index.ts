/**
 * Durable whole-file artifact store (`ctx.artifactStore`): promotes
 * workspace-changes' SHA-1-addressed per-turn captures into a
 * storage-domain-backed table so a conversation reopened after a Host restart
 * finds its earlier artifact cards. Retention is bounded by the two validated
 * `Config` fields: `maxStoreBytes` (per workspace, oldest-turn-first eviction on
 * the write path) and `retentionDays` (age-based pruning, run on every write
 * and once at activation). No interval timer and no watcher — the trigger is
 * the store's own write path and its activation.
 *
 * @module @deepseek-ai/dsh-artifact-store
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { artifactId, artifactDomainSpec, type ArtifactId, type ArtifactRecord } from './spec.ts'

export type { ArtifactId, ArtifactRecord } from './spec.ts'
export { artifactId, artifactDomainSpec, artifactRecord } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable per-turn whole-file artifact store, scoped by workspace. */
    artifactStore: ArtifactStore
  }
}

/** Validated retention bounds. Absent fields leave the corresponding pass disabled. */
export interface Config {
  /**
   * Per-workspace cap on stored artifact bytes. When a write passes the
   * workspace's stored total past it, the oldest-turn-first captures of that
   * workspace are evicted until the total is back at or under the cap. Absent
   * means no cap — captures live until `retentionDays` prunes them.
   */
  maxStoreBytes?: number
  /**
   * Age in days after which a capture is pruned, applied on every write and
   * once at activation. Absent means no age pruning.
   */
  retentionDays?: number
}

/**
 * The artifact store service: `ctx.artifactStore`. Opens the `artifact_files`
 * domain over the injected storage-domain facility and exposes the durable
 * whole-file capture writes the workspace-changes recorder promotes, scoped by
 * workspace. Reads and writes go through the single opened table; retention
 * and eviction run on the write path and once at activation.
 */
export class ArtifactStore extends Service {
  static inject = ['storageDomain']

  static Config: z<Config> = z.object({
    maxStoreBytes: z.number(),
    retentionDays: z.number(),
  })

  private files?: KvTable<ArtifactId, ArtifactRecord>

  /**
   * @param ctx - Host context carrying the storage-domain facility.
   * @param config - validated {@link Config} retention bounds.
   */
  constructor(
    ctx: Context,
    private readonly config: Config,
  ) {
    super(ctx, 'artifactStore')
  }

  /** Whether the domain is open (false until storage-domain initializes the store). */
  get available(): boolean {
    return this.files !== undefined
  }

  /** Open the domain, prune by age once, and take ownership of its close. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(artifactDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'artifactStore.domainClose')
    this.files = domain.table('files')
    await this.pruneByAge()
  }

  /**
   * Promote one captured file side into the durable store, then apply the
   * retention bounds: age-prune, then per-workspace cap eviction oldest turn
   * first. `bytes` and `sha1` are caller-provided figures the store does not
   * recompute.
   * @param record - the durable artifact fields to store.
   * @returns the branded id of the stored artifact.
   */
  async store(record: ArtifactRecord): Promise<ArtifactId> {
    const files = this.files
    if (files === undefined) throw new Error('artifactStore store is not open')
    const id = artifactId.parse(randomUUID())
    await files.put(id, { ...record })
    await this.pruneByAge()
    await this.evict(record.workspace)
    return id
  }

  /**
   * Prune every capture older than `retentionDays`, measured from its
   * `createdAt`. Runs on every store and once at activation; absent
   * `retentionDays` prunes nothing.
   * @returns resolution after the pruned records are removed.
   */
  private async pruneByAge(): Promise<void> {
    const files = this.files
    const retentionDays = this.config.retentionDays
    if (files === undefined || retentionDays === undefined) return
    const cutoff = Date.now() - retentionDays * 86_400_000
    for (const [id, record] of files.entries()) {
      const created = Date.parse(record.createdAt)
      if (!Number.isNaN(created) && created <= cutoff) await files.delete(id)
    }
  }

  /**
   * Evict the oldest-turn-first captures of one workspace until its stored
   * total is at or under `maxStoreBytes`. Runs on every store; absent
   * `maxStoreBytes` evicts nothing.
   * @param workspace - the workspace root to account.
   * @returns resolution after the evicted records are removed.
   */
  private async evict(workspace: string): Promise<void> {
    const files = this.files
    const cap = this.config.maxStoreBytes
    if (files === undefined || cap === undefined) return
    const owned = [...files.entries()]
      .filter(([, record]) => record.workspace === workspace)
      .sort((a, b) => a[1].turn - b[1].turn || a[1].createdAt.localeCompare(b[1].createdAt))
    let total = owned.reduce((sum, entry) => sum + entry[1].bytes, 0)
    for (const [id, record] of owned) {
      if (total <= cap) break
      await files.delete(id)
      total -= record.bytes
    }
  }
}

export default ArtifactStore
