/**
 * Durable whole-file artifact record: one captured file side promoted from
 * workspace-changes' SHA-1-addressed per-turn captures into a storage-domain
 * table. The record carries the file's content (UTF-8 text, or the binary
 * bytes re-encoded so they round-trip a JSON medium), its byte length, the
 * turn it was captured for, and the workspace root it belongs to, so retention
 * and eviction are scoped per workspace and ordered by turn.
 * @module @deepseek-ai/dsh-artifact-store/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

/**
 * Identifies one stored whole-file artifact. Branded so opaque ids are not
 * mistaken for paths or hashes at typed boundaries.
 */
export type ArtifactId = string & { readonly __brand: 'dsh-artifact-id' }

/** Id schema at the durable boundary; branding has no runtime representation. */
export const artifactId = z.string().transform((value): ArtifactId => value as ArtifactId)

/**
 * Durable shape of one captured file side. `content` is the file's bytes —
 * binary content is re-encoded so it survives a JSON-backing medium
 * round-trip. `bytes` is the decoded byte length, the figure eviction
 * accounts against the workspace's store cap. `createdAt` is an ISO-8601
 * string used by the retention-age pruning pass.
 */
export const artifactRecord = z.object({
  /** Canonical workspace root the capture belongs to; per-workspace retention and eviction scope. */
  workspace: z.string(),
  /** The SHA-1 content address of `content`, the address workspace-changes already derives. */
  sha1: z.string(),
  /** The captured file's bytes; binary content is re-encoded to round-trip a JSON medium. */
  content: z.string(),
  /** Decoded byte length of `content`, the figure eviction accounts against the store cap. */
  bytes: z.number(),
  /** Top-level turn the capture was taken for; oldest-turn-first eviction orders by it. */
  turn: z.number(),
  /** ISO-8601 creation instant; the retention pass prunes records older than `retentionDays`. */
  createdAt: z.string(),
})

/** One stored whole-file artifact, inferred from {@link artifactRecord}. */
export type ArtifactRecord = z.infer<typeof artifactRecord>

/**
 * The artifact-store domain spec: one `files` table keyed by
 * {@link ArtifactId}. The store opens this through `ctx.storageDomain`.
 */
export const artifactDomainSpec = defineDomain({
  name: 'artifact_files',
  version: 1,
  tables: { files: domainTable<ArtifactId, ArtifactRecord>(artifactRecord) },
})
