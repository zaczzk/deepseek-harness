---
description: "Web Run comparison conversation view: picks two persisted Sessions from the session-query roster and folds the six per-run metrics (turns, tool calls, input/output tokens, wall-clock, failures) over their recorded logs."
kind: "package-reference"
---

# dsh-client-ui-run-comparison

English | [中文](README.zh.md)

## Summary

Use this package to compare two persisted runs of a session side by side without leaving the conversation. The `run-comparison` conversation view reads the session-query roster, lets you pick a baseline run (side A, defaulting to the current Session) and a comparison run (side B), and folds six per-run figures — distinct turns, tool calls, input tokens, output tokens, wall-clock time, and failures — from each run's recorded raw event log, rendered as a two-column table.

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

Mount the package in the Web client roster beside `ui-conversation`, the `session-query` client face, and the `session-query-controller` Remote that serves the roster. It registers one `conversation.view` entry (`run-comparison`, order 40) whose label rides the `runComparison` locale namespace. The tab reads through the `sessionQueries` Client service, so every list and log read resolves the addressed Host controller — no transport detail reaches the browser.

Side A defaults to the view's own Session when it qualifies (a persisted run in the browser may inspect its Workspace), so the common "compare this run against that one" case needs one pick. Both pickers scope to the Sessions the caller's Workspace may inspect, and a picker never offers the Session the other side currently holds, so the two sides can never land on one log. A non-persisted run is offered but disabled, with the reason shown at the picker's foot.

### Configuration

None. The `runComparison` namespace keys ship with the package; the session-query wire contract is defined by `@deepseek-ai/dsh-api-session-query-controller`.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each side's read goes through the injected face, which serializes requests in submission order so a settlement can never overwrite a newer request, and the store holds the roster and each side's read lifecycle plus the last successful fold. A failed read keeps the previous successful value and shows a Retry; re-reading re-issues the exact same read. `foldMetrics` reads each event's JSON-bounded `data` defensively and never throws on malformed events.

The absence rule differentiates counts from measured quantities: counts over recorded events are `0` when none gathered, while measured quantities (tokens, wall-clock) are `null` when their source was absent — a `null` renders the locale-owned "Unavailable" label, never a zero that would read as a measurement.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Plugin body: dictionaries, store, and the `conversation.view` registration |
| [`src/client/RunComparisonView.tsx`](src/client/RunComparisonView.tsx) | Pickers, status lines, and the two-column metric table |
| [`src/client/metrics.ts`](src/client/metrics.ts) | `foldMetrics`: the six per-run figures over one raw event log |
| [`src/client/face.ts`](src/client/face.ts) | Ordered roster and log reads through the session-query Client service |
| [`src/client/store.ts`](src/client/store.ts) | Per-run pick and log-read lifecycle state |
| — | No runtime invariant companion is published; every displayed value derives from the Remote reads at call time. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Session query API controller](../../api/session-query-controller/README.md) — the `sessionQueries` Host+Client service behind the roster and log reads.
- [Session query domain](../../session-query/README.md) — the roster records and read semantics the fold consumes.
- [Conversation reference](../../../docs/subsystems/conversation.md) — how conversation view tabs register and render.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package registers no tool, contributes no prompt section, and appends no session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Workspace-scoped roster** — pickers show only the Sessions of the Workspace that owns the current Session; runs outside that scope are not offered.
- **Two sides only** — the view compares exactly one baseline against one comparison; a three-or-more matrix is out of scope.
- **Fueled from recorded logs** — every figure derives from the recorded raw event log; metrics that are not logged (for example, a token count a provider never reported) read as Unavailable rather than zero.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The `foldMetrics` absence rule deliberately treats a missing usage record as `null` (a measurement) and a run with no tool calls as `0` (a count). Keep that split when extending the fold. The `/* v8 ignore */` on the metric table's `loading` arm and `metricValue` default exist because the prior guards render those paths unreachable in the component; they carry real reasons in the comments.

</details>