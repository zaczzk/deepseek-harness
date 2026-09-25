---
description: "Quiet session and project token-usage meter for the Web Session header, showing billed routes and provider-reported limit percentages."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage

English | [中文](README.zh.md)

## Summary

The usage meter is a small control in the Session header's utility row: a per-route bar with the compact session token total, opening a panel with the session and project totals, provider-reported weekly and monthly limit percentages, and the session's billed provider/model routes with the current model marked. It renders nothing until the session bills a token, and no limit row until a source reports a window. Every figure is read from host-computed projections (`tokenUsageByModel`, `tokenUsage`, `modelSelection`) and the shared session and workspace lists; the package owns no accounting and adds no model-visible surface.

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

Mount this plugin when the Web composition should show token consumption without opening a turn panel. It registers one `conversation.session.header.utilities` entry (`id: 'usage'`) through `slots.inject`, so it loads beside the header's other utilities and leaves with its own fiber.

### Reading the numbers

The session total sums the `tokenUsageByModel` route rows (assistant settlements plus compaction summarizer calls). The project total sums the same figures across every session of the workspace the current session belongs to, taking each other session's cached projection values from the session list. Limit rows are whole percentages of provider-reported windows, clamped in the bar only; a route with no claim is named by the shared `unknown` label. Latency figures average the current model's `modelLatency` samples over the last 15 minutes and hour — only calls that ran contribute, so an idle model reports no figure and dilutes nothing.

### Composition

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-host-token-plan-usage'
- name: '@deepseek-ai/dsh-client-ui-usage'
```

The meter needs the token-meter projections and the session, workspace, and locale seats; the host reader supplies the reported usage windows. It has no settings and no service of its own.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design behind the meter; the observable behavior is fully covered in [Use this package](#use-this-package).

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Browser plugin: dictionaries, the empty limit source, and the header registration |
| [`src/client/UsageIndicator.tsx`](src/client/UsageIndicator.tsx) | Presentation: header pill and click-open panel |
| [`src/client/usage.ts`](src/client/usage.ts) | Pure scope totals and limit percentages |
| [`src/client/limits.ts`](src/client/limits.ts) | Wire reader for the Host's usage route |
| [`src/client/format.ts`](src/client/format.ts) | Compact token formatting over the shared number templates |
| [`src/client/contract.ts`](src/client/contract.ts) | `UsageLimit` and the injected limit reader |

Totals are pure functions over framework-hook snapshots (`useMemo`); the component holds no subscription machinery. The panel is a portal anchored below the pill, dismissed by outside pointer or Escape.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Token meter subsystem](../../../docs/subsystems/token-meter.md) — the projections these figures ride.
- [Slots reference](../../../docs/subsystems/slots.md) — the header utility seat and `slots.inject`.
- [Web Client architecture](../../../docs/subsystems/web-client.md) — the standard seats the meter reads.

-----

<a id="model-experience"></a>
## Model Experience

None, as the meter is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define where the meter stops and future work begins. They are current package constraints, not a general usage-accounting comparison or a task backlog.

- **Limit rows need a reporting source** — the Week/Month rows render only from `UsageInjected.loadLimits`, which reads [`dsh-host-token-plan-usage`](../../host/token-plan-usage/README.md); that reader reports one monthly window and no week, so the Week row stays hidden on this provider.
- **The project total is a cached lower bound** — a session row without cached projection values (or absent from the session list) contributes nothing, and cached rows trail the live fold until their next checkpoint.
- **The session total names billed assistant and compaction traffic** — `tokenUsageByModel` folds assistant settlements and `compaction/summary` calls, so it exceeds `tokenUsage` by the summarizer's usage.

**Runtime invariant:** No companion is published. Every displayed figure derives from host-owned projections and lists, the meter holds no state of its own, and its single slot registration proves disposal through the HMR-safety spec.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is non-authoritative working context: notes for maintainers and open questions. Shipped behavior and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

- Latency windows average at display time over the durable sample timestamps, so the fold needs no clock and replay stays deterministic. A weekly window joins the panel when a provider reports one.

</details>
