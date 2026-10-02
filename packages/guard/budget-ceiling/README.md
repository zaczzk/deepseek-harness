---
description: "Monotonic per-Session budget ceiling enforced at the owner deny: refuses tool calls once a Session's consumed usage tokens pass the configured ceiling, for users and maintainers choosing, configuring, or debugging the gate."
kind: "package-reference"
---

# @deepseek-ai/dsh-budget-ceiling

English | [中文](README.zh.md)

## Summary

This package adds a hard per-session spending guard. Once a Session's consumed provider usage tokens (input, output, cache, and reasoning) reach a configured ceiling, the next tool call for that Session is refused with a stable, model-visible deny string. The ceiling is a single optional `budgetCeiling` config value: absent, the guard stays inert and the package boots harmlessly in every base-backed profile. The counter is replayed from the Session's durable log, so it never fails open across a Host restart.

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

Mount this plugin when a deployment must cap what one Session may spend on provider usage before it runs unchecked. The package ships in the `dsh` base bundle inert (no ceiling configured); an overlay arms it with a ceiling.

### When to choose it

Choose it when long-running autonomous sessions must stop once their consumption passes a budget — a cost ceiling, not a recharge. Avoid it when a Session must always continue regardless of spend, when you need a live standing readout of consumption or headroom (this guard shows nothing until a refusal), or when you want a **per-model** or **per-request** limit rather than a per-Session total.

### Arming the ceiling

Add the plugin row (the base bundle already lists it) and set the ceiling in consumed tokens:

```yaml
- id: budget-ceiling
  name: '@deepseek-ai/dsh-budget-ceiling'
  config:
    budgetCeiling: 1000000
```

| Field | Default | Meaning |
|---|---|---|
| `budgetCeiling` | absent (no ceiling) | Reject a tool call once its Session's consumed usage tokens reach this count |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-budget-ceiling) documents every accepted value. No ceiling and no other config is required — a headless deployment that never asks for one keeps the guard off.

### What you get

With an armed ceiling, the first tool call made after the Session's durable consumption reaches the count is refused. The refused call's model-visible result carries the stable `BUDGET_CEILING_DENY` code, the configured ceiling, and the consumed figure, so the model and the user see exactly why the call was refused and how much headroom existed. A denial is final; no later call re-folds to allow it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the guard folds consumption and where the deny is decided; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **Enforce at the owner deny.** The guard registers through `ctx.tools.guard()` — the monotonic synchronous owner deny evaluated after the extensible `tools/pre-execute` waterfall. Returning a string denies the call, and no later listener can turn a denial back into permission.
- **Fold the durable log on read.** The counter is rebuilt from the Session's durable log, never from live events alone. A Session first seen at the guard is replayed from seq 0; every later call replays only the un-consumed range, so the ceiling binds across a cold reopen or Host restart.
- **One value, one decision.** The package owns its counter and its decision; it reads no projection registry and calls no Remote. `token-meter`'s occupancy stays a reference figure, while this is the figure a decision is made from.
- **Optional-without-default.** The ceiling is an optional config field; absent, the guard registers nothing and the package boots inert, so the base bundle never fails to load for a deployment that asked for no ceiling.

### The fold

Consumption is the sum of the five provider usage buckets carried by `assistant/message` events — input, output, cache-read, cache-write, and reasoning — with the absent cache and reasoning buckets counted as zero. `foldEvent` skips every non-`assistant/message` event and every message without a usage record.

Each Session's replay cursor lives in a `WeakMap<Session, ReplayState>`, so an entry is created only for Sessions the guard has actually folded and is collected when the Session object is. `ctx.on('session/event')` refreshes a Session's counter eagerly, but only for Sessions the guard has already seen; the durable catch-up on read remains the source of truth and creates no state for Sessions nothing has read.

### The guard

The registered `ToolGuard` receives the identity-protected call. A call with **no** agent (a direct `ctx.tools.execute()` caller) has no Session, so no session-scoped ceiling applies and it is left unchanged. With an agent, the guard folds that agent's Session and denies when its consumed tokens meet or pass the ceiling, returning the stable deny string; otherwise it returns `undefined` and the call proceeds.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, `name`/`inject`, the durable fold, and the `ctx.tools.guard()` registration |
| — | No runtime invariant companion is published; the counter is private to one guard closure and exposes no package-owned event or snapshot an independent companion can observe. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Tools subsystem reference](../../../docs/subsystems/tools.md) — the tools waterfall and the `ctx.tools.guard()` owner deny this package registers on.
- [token-meter package](../../llm/token-meter/README.md) — the separately owned, reference-only occupancy figure this package does not read.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-budget-ceiling) — the `budgetCeiling` field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

### Denial message

#### What the model sees

When a Session reaches its ceiling, the refused tool call's result is the following stable string (the `Error: ` envelope is the tool runtime's own):

```markdown
Error: BUDGET_CEILING_DENY: session has consumed {consumed} usage tokens, at or above the configured ceiling of {ceiling}.
```

`{consumed}` is the Session's durable consumption at the moment of refusal; `{ceiling}` is the configured value. No other model-visible text is added, and no tool schema changes.

#### Token effect

Zero tokens until a refusal. Each refusal is one short retained result for that tool call.

#### KV Cache effect

Append-only; the refusal is a single new tool result and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the ceiling is a poor fit. They are current package constraints, not a task backlog.

- **Untranslated, English-only deny string.** Because it is a host-authored, model-visible tool result and model/wire data stays verbatim, the deny string is deliberately untranslated and reads in the harness's English even in a Chinese UI.
- **Refusal-only surface.** There is no standing readout of consumption or headroom before a refusal; the refusal is the only moment this feature surfaces.
- **Per-Session ceiling, not per-model or per-request.** The ceiling is a flat per-Session total made from provider usage; it cannot express a per-request or per-model limit.
- **`token-meter` occupancy unchanged.** This package does not alter `token-meter`; that package's occupancy remains a reference figure.
- **Counts provider usage, not spend.** The ceiling counts tokens, not cost; a conversion to a currency budget would be a separate decision.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the enhancement spec that defined it.

The counter mirrors `token-meter`'s `_sync` catch-up-on-read fold rather than its projection registry, because the registry stays a reader channel and this figure is the one a decision is made from.

</details>
