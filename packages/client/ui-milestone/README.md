---
description: "Milestone transcript node for the Web GUI: renders one committed project-milestone session event as a keyed conversation.chat.node row; for users and maintainers of the milestone transcript projection."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-milestone

English | [中文](README.zh.md)

## Summary

The milestone transcript node renders each committed `project/milestone` session event (a register row with its `M<n>` id, title, and diagram evidence) as one keyed `conversation.chat.node` row in the active Session's transcript. It keys on item 8's durable event rather than `todo/write`, so it needs no client copy of the host's `milestoneMarker` Config; a milestone minted by another Session's register never enters this transcript and renders no placeholder here — the register row (item 9's surface) is where cross-Session milestones show the figure unavailable instead.

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

Mount this plugin alongside `ui-conversation`, `ui-chat`, and the project-register domain package. It registers one `ConversationNodeDefinition` (kind `milestone`) and one keyed `conversation.chat.node` renderer, plus the `milestone` locale namespace. Each committed milestone renders as a title line (`node.title`, interpolating the event's `id` and `title` verbatim) with the diagram mark beside it: the mark's visible text resolves through the keyed `mark.*` vocabulary (`mark.updated`, `mark.stale`, `mark.absent`) for a present `DiagramMark`, or `mark.none` when the row's `diagram` is `null`. The accessible name is `node.mark` and `node.markTooltip` is the tooltip and aria description — for the non-null case only; a `null` diagram carries no tooltip.

### Failures

The projection renders only from this Session's own committed milestone events. A milestone whose event was appended to a different Session never appears here and shows no placeholder; the register row is the surface that labels such a figure unavailable.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The default-exported `milestoneDefinition` is a `ConversationNodeDefinition<MilestoneState>` whose `match(event)` returns `{ id, role: 'start' }` when `event.type === 'project/milestone'` and `null` otherwise. `start` reads `id`, `title`, `diagram` and the event's `seq`; `update` is identity (one event, one Node, one row) and `buildViewNode` returns `null` for an absent state or a Chat Node keyed by the milestone id with `anchorSeq: seq - 0.1`. The `MilestoneView` component is memoized; it interpolates the title through `t('node.title', { id, title })` and resolves the mark label and tooltip through the same `milestone` namespace, so every rendered string is a keyed dictionary value. Registration rides the plugin fiber, so unloading the plugin removes the Definition, the keyed renderer, and the dictionary (HMR safety).

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the milestone node is not enough. They move from the transcript row to the project-register domain and the slots it fills.

- [dsh-project-register](../../workspace/project-register/README.md) — the domain that owns the `project/milestone` event and the register row.
- [ui-conversation](../ui-conversation/README.md) — declares the Conversation Definition registry and owns the assembly.
- [ui-chat](../ui-chat/README.md) — declares the keyed `conversation.chat.node` slot this package fills.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

None. This package only renders a session event already emitted by the project-register domain; it adds no model-visible input, prompt, or tool surface.

#### KV Cache effect

None — the node reads only committed, durable session events and adds no cache-affecting operation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the current milestone node. They are current package constraints, not a project-register comparison or a task backlog.

- **Session-local source only** — the row renders only from this Session's own committed milestone events; a milestone minted by a different Session's register never appears here by design (the register row is that surface).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. There is a single keyed `conversation.chat.node` registration whose disposal is proven by the HMR-safety spec — the projection is a pure Conversation Definition over committed session events, so no separate invariant surface observes a relationship that could diverge.