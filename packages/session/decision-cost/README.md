---
description: "A per-session projection folding a Session's own register milestone rows and their committed token usage into per-milestone derived costs, for clients and maintainers composing, debugging, or extending the milestoneCost value."
kind: "package-reference"
---

# @deepseek-ai/dsh-decision-cost

English | [中文](README.zh.md)

## Summary

This package publishes the `milestoneCost` Session projection: for each register milestone row this Session's own `project/milestone` events mint, the committed token usage of the turns from that milestone's event sequence to the next milestone's — or to the session end. A milestone whose interval records no usage carries `null` rather than a zero, so a render never claims a cost the fold cannot support. Use it when a Workspace register must show a derived cost per decision row without inventing pricing.

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

Mount the plugin beside the session store and the projection registry when a register surface should render a derived cost per milestone row. The unit registers only when the projection registry is present.

### Composition

```ts
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as DecisionCost from '@deepseek-ai/dsh-decision-cost'

const ctx = new Context()
await ctx.plugin(SessionStore)
await ctx.plugin(SessionProjectionRegistry)
await ctx.plugin(DecisionCost)
```

### Reading the value

The `milestoneCost` value is a `Readonly<Record<MilestoneRowId, number | null>>`. It arrives over the shared projection carriers — `ctx.sessionProjections.snapshot(session).values.milestoneCost`, the change feed, and the client read path (`session.projections` / `projectionsBySession`) — the same carriers every wire-block projection uses. Row-wise, a seat reads it as `useProjection('milestoneCost', value => value?.[rowId])`.

Key semantics are precise:

- A row **absent** from the map is, by construction, a row this Session does not own — a sibling register's milestone. Renders show `cost.unavailable`, never `'—'` and never zero.
- A key **present with a number** is the committed-token figure for that milestone's interval.
- A key **present with `null`** is a real value: the milestone's interval recorded no usage, so no figure is available.
- A **decision row** (`D<n>`) appears in no session event and is never in the map; the seat's row-class discriminator renders it `'—'`.

### Dependency edges (named)

The package folds item-8 `project/milestone` events from `@deepseek-ai/dsh-project-register` (which supplies `MilestoneRowId` and the `SessionEventMap` augmentation) and the same usage records token-meter folds, so it carries a devDependency and tsconfig reference onto `@deepseek-ai/dsh-project-register` and `@deepseek-ai/dsh-token-meter` respectively.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/projection.ts` exports the `milestoneCostProjectionDefinition` — a pure, synchronous, JSON-state fold in the session-projection contract. The fold tracks, per event, a running committed token total (the sum of a carried `TokenUsage`'s billed buckets) and, per milestone boundary, the total committed just before that milestone opened its interval. A milestone's figure is the delta between its own boundary and the next milestone's (or, for the open interval, the live total), so usage is attributed to the interval it falls in, exactly as the join rule states. An `assistant/message` that carries no `usage` record leaves the fold and the running total untouched; a `project/milestone` event closes its predecessor's interval and opens a fresh one.

The fold writes every own-milestone key eagerly as a `number` or a `null` before the view is readable, so an absent key always means a row this Session does not own.

-----

<a id="further-exploration"></a>
## Further Exploration

- [session-projection](../session-projection/README.md) — the seam the package registers through.
- [project-register](../../workspace/project-register/README.md) — the `project/milestone` event and `MilestoneRowId`.
- [token-meter](../../llm/token-meter/README.md) — the same usage stream and its `TokenUsage` record.
- [ui-decisions](../../client/ui-decisions/README.md) — the register seat the Cost cell renders in.

-----

<a id="model-experience"></a>
## Model Experience

No model input or output changes. The fold reads only the durable event log; none of its values enter a model request. The figure is a token count derived from committed usage — a displayed estimate, never a price — and is deliberately not surfaced to the model.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The figure is a **token count**, not a currency amount; token-meter deliberately declines exact pricing, so no conversion to cost is attempted.
- Usage is attributed by committed turns; a turn still streaming has not yet reported, so the latest milestone's figure grows as turns commit and is never a final claim while the session is live.
- The projection reads this Session's own milestones only. A sibling register's milestone rows carry no figure (they are absent from the map and render `cost.unavailable`).

-----

<a id="dev-note"></a>
## Dev Note

Target audience: maintainers extending the projection. The unit is a plain JSON state fold; neither `apply` nor `view` is async, and the state must stay JSON-cacheable (no `Date`, no `Map`, no class instances). Bump `stateVersion` whenever the serialized state fields or fold semantics change so persisted `(sessionId, key, ver, seq, val)` cache rows from an older unit are discarded, never forward-applied. The `view` must reuse the same reference when the value is unchanged (`Object.is` gates the change feed); the fold already returns the same state reference for every event it ignores.