---
description: "Host and Client session-query control: the exact logical-session reads, replays, filters, and traces of the session-query domain mirrored to the browser over the generated Remote namespace, owning no query state."
kind: "package-reference"
---
# Session Query Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-session-query-controller` owns the Host `ctx.sessionQueryController` service and the generated Client `ctx.remote.sessionQueries` namespace. Its four Remote methods are exact passthroughs of `ctx.sessionQuery` reads: `listSessions` yields the complete logical corpus newest-first with live/persisted flags, `readSession` replays one logical session's validated raw event log onto a bounded JSON wire envelope, `filterEvents` applies ANDed metadata and literal-text predicates to one session's first-party event documents, and `traceSession` returns one session's known ancestry and descendants. Each method translates the domain's typed `SessionQueryError.code` onto a `session-query/<kebab>` Remote code so a browser seat renders the same failure story the Host would. The controller is a thin seam over the domain package — it owns neither query state nor authorization, and the session-query domain remains the single owner of corpus reads, replay validation, and the caller-argument fence. The Client half installs `ctx.sessionQueries` (`ISessionQueries`), the RPC passthrough service whose list/read/filter/trace a comparison seat issues.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Host controller requires the session-query domain service `ctx.sessionQuery` and the Typert registry, and fails to load without them. `listSessions()` yields the complete logical corpus endpoint, newest-first, each record carrying its live/persisted flag; the roster is a request/response snapshot, so a UI re-reads it to refresh and no stream state lives on this side. `readSession({ sessionId })` replays one logical session's complete raw event log without making it live: each `SessionEvent`'s validated JSON payload lands under `data: JsonValue` on a bounded `SessionQueryWireLogSnapshot`, with `surfaceOp`, `sourceEventSeqs`, and `ignorable` carried opaquely when present — the same width `api/session-controller` applies to the same source log. `filterEvents({ sessionId, filters })` returns matching semantic documents in ascending `seq` order. `traceSession({ sessionId })` returns a complete lineage or the first parent that could not be resolved.

Every method rethrows a domain failure through the Remote error channel with its typed `code` preserved. A code beginning `SESSION_QUERY_` is kebab-cased onto `session-query/<name>` (for example `SESSION_QUERY_SESSION_NOT_FOUND` → `session-query/session-not-found`); any other failure lands on the unclassified `session-query/error` fallback. Details stay opaque — each Remote code carries the human diagnostic and the method that threw, never session content.

The Client entry installs `ctx.sessionQueries` (`ISessionQueries`), backed by `ClientSessionQueries`. `listSessions()`, `readSession(sessionId)`, `filterEvents(sessionId, filters)`, and `traceSession(sessionId)` each forward to the matching Remote method and return the Remote result, so a comparison seat owns its own read lifecycle and error presentation from the typed failure code. The plugin resolves the Gateway stream factory and the `sessionQueries` namespace while its own context is current, because callers issue reads on caller stacks whose dynamic context has not declared `remote.sessionQueries`.

### Config

None. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-api-session-query-controller) is the exhaustive source for accepted fields and their JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

None, as session-query reads are browser and Host control state; they register no prompt, tool, or session event. The model's own view of the same corpus stays with [`dsh-session-query`](../../session-query/session-query/README.md).

#### KV Cache effect

No direct effect; these reads never touch model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This controller carries no caller authorization: the domain's caller-argument fence is the only access rule, and every session id a connected browser supplies is read as-is.
- `readSession` projects one `SessionLogSnapshot` observation; a Host restart between a UI's list and read returns a fresh observation, not an incremental continuation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The controller is a stateless projection of `ctx.sessionQuery` reads; the session-query domain owns the corpus, replay, and the reader contract these streams forward.