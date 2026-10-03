---
description: "Durable whole-file artifact store (ctx.artifactStore) for hosts and maintainers choosing retention of workspace-changes' SHA-1-addressed per-turn captures."
kind: "package-reference"
---

# @deepseek-ai/dsh-artifact-store

English | [中文](README.zh.md)

## Summary

Use this package to promote workspace-changes' SHA-1-addressed whole-file captures into a durable store scoped per workspace, so a conversation reopened after a Host restart finds its earlier artifact cards. The store opens the `artifact_files` domain over `ctx.storageDomain` and exposes `ctx.artifactStore` to its writer. Retention is bounded by two validated `Config` fields — `maxStoreBytes` (per-workspace, oldest-turn-first eviction on the write path) and `retentionDays` (age-based pruning, run on every write and once at activation). There is no interval timer and no watcher; the trigger is the store's own write path and its activation. This host-side state adds no tools, prompts, or session events, so it remains invisible to the model and agent loop.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Use this package when a Host feature keeps durable whole-file copies that must survive a restart and stay bounded. The owning package opens the domain once and keeps the single handle; the workspace-changes recorder is the first writer and activates through the store service rather than a construction-order accident.

### When to use it

Choose it for whole-file artifact retention that must outlive the Session's temporary directory. Avoid it for data that belongs in a session event log — the session persistence seam owns that surface.

### Opening and storing

The store service opens the `artifact_files` domain through the injected storage-domain facility. Its `store` method promotes one captured side and then applies the retention bounds:

```text
await ctx.artifactStore.store({
  workspace: '/work/demo',       // canonical workspace root; retention and eviction scope
  sha1: 'abc…',                  // the SHA-1 content address workspace-changes already derives
  content: 'file bytes',         // binary content is re-encoded to round-trip a JSON medium
  bytes: 1234,                   // decoded byte length, the figure eviction accounts
  turn: 7,                       // oldest-turn-first eviction orders by it
  createdAt: new Date().toISOString(),
})
```

A conversation reopened after a Host restart reads its earlier artifact records from the same medium.

### Retention bounds

`maxStoreBytes` caps each workspace's stored total; a write that passes a workspace past its cap evicts that workspace's oldest-turn-first captures until the total is back at or under the cap. `retentionDays` prunes every capture older than the bound, measured from its `createdAt`; the pass runs on every store and once at activation. Absent fields leave the corresponding pass disabled. The whole-file copy cap is `workspace-changes`' existing `maxFileBytes` — one size rule across capture and store — and files above it degrade to declarations rather than failing a turn.

| Field | Default | Meaning |
|---|---|---|
| `maxStoreBytes` | absent | Per-workspace stored-byte cap; oldest-turn-first eviction on the write path |
| `retentionDays` | absent | Age bound; records older than it prune on every write and once at activation |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-artifact-store) is the exhaustive source for every accepted field and its JSDoc.

### Dependencies

The package is `defineDomain`-backed on `storage/storage-domain`: it takes the three source-mapped steps of its own edge onto that owner — the `@deepseek-ai/dsh-storage-domain` manifest row, the `../../storage/storage-domain` tsconfig reference, and the lockfile importer — and its writer's activation is declared through `static inject = ['storageDomain']` (precedent `workspace/workspace/src/index.ts:171`).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The store is a Cordis `Service` (`ctx.artifactStore`) with a single opened `artifact_files` domain table over the injected `storageDomain` facility.

### Design concept

- **Retention lives on the write path.** `store` writes, then runs the age-prune pass, then the per-workspace cap eviction — no interval timer and no watcher, so every stored turn also sweeps ages and sizes.
- **Eviction is oldest-turn-first, per workspace.** Records of one workspace are ordered by turn, then by `createdAt` for equal turns, and the oldest are evicted until the workspace's stored total is back at or under its cap. Different workspaces never cross-account.
- **Bounds are validated, absent means disabled.** `maxStoreBytes` and `retentionDays` are schemastery-typed `Config` fields; an absent field leaves the corresponding pass disabled.
- **The store does not recompute `bytes` or `sha1`.** They are caller-provided figures the domain persists as given; the writer derives them.

### Open sequence

`[Service.init]` opens the domain through `ctx.storageDomain.open(artifactDomainSpec)`, takes ownership of its close through a `ctx.effect` disposer, binds the `files` table, and runs the age-prune pass once at activation.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `ArtifactStore` service, `ctx.artifactStore`, `Config`, retention passes |
| [`src/spec.ts`](src/spec.ts) | Domain declaration: `artifactDomainSpec`, the `artifact_files` table, `artifactRecord` and `ArtifactId` types |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when this package's view is not enough: the subsystem reference is the authoritative contract, and the first consumer records the promotion pattern.

- [Storage subsystem](../../../docs/subsystems/storage.md) — the domain contract, backend contract, change events, and generated API.
- [Storage package map](../README.md) — the family's packages and their repository position.
- [Workspace-changes package](../deliverables/workspace-changes/README.md) — the first writer, whose per-turn captures this store promotes.

-----

<a id="model-experience"></a>
## Model Experience

### Durable artifact retention

#### What the model sees

Nothing. The package registers no tools, injects no prompts, and appends no session events; it stores whole-file captures behind `ctx.artifactStore` and returns a branded id per stored record. The restored artifact surfaces reach a model only through a consumer's own documented surface.

#### Token effect

Zero: no text from this package enters any model request.

#### KV Cache effect

Independent: domain reads and writes never touch request prefixes, so nothing here can invalidate provider cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the artifact store is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

- **Single-process change visibility** — the domain's `domain/changed` event is in-process; a second host process observes no changes until the cross-process revision pattern lands ([Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md)).
- **No automatic data migration** — a domain whose stored version differs from its spec rejects at open (`version-mismatch`); changing a schema requires migrating the stored data by hand ([storage-domain contract](../../../docs/subsystems/storage.md)).
- **Binary content is re-encoded** — `content` carries UTF-8 text or binary bytes re-encoded to round-trip a JSON-backing medium; `bytes` holds the decoded byte length, which is what eviction accounts against the cap.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>