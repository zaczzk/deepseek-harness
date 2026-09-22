---
description: "Record every major milestone as a DECISIONS.md register row carrying the architecture diagram's updated, stale, or absent flag, from newly completed milestone todos and completed goals; marker configuration, recording rules, and failure behavior."
kind: "package-reference"
---

# dsh-project-register

English | [中文](README.zh.md)

## Summary

This plugin enforces "the architecture diagram is updated at every major milestone" by writing every milestone down. Each newly completed milestone todo — an item whose content starts with the configured marker — and each completed goal appends one `milestone` row to the project's `DECISIONS.md` with today's date and `done` status. The row's Diagram cell records the `ARCHITECTURE.md` Mermaid diagram at that moment: `updated` when its fingerprint differs from the one the previous milestone recorded, `stale` when it is unchanged since then, `absent` when no diagram exists. Recording is advisory: it warns and drops the milestone on any failure, and never blocks the work it observes.

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

Mount it in any Host composition carrying the `fs` capability:

```yaml
- name: '@deepseek-ai/dsh-project-register'
  config:
    milestoneMarker: 'milestone:'
```

| Field | Default | Meaning |
|---|---|---|
| `milestoneMarker` | `milestone:` | A todo item whose content starts with this marker is a milestone; its title is the content with the marker removed |

Every top-level Session with a working directory records; subagent-origin Sessions, delegated Sessions, and Sessions without a working directory do not. A `todo/write` event records the milestones newly completed since the previously observed list: an item counts when its trimmed content starts with `milestoneMarker` case-insensitively and its status is `completed`, and only when the previously observed list did not already complete it. A `goal/changed` completion records that goal's objective as a milestone.

Each recorded milestone appends one row to `DECISIONS.md` in the Session's working directory — a document without a register table gets the standard heading and table — and stamps its Diagram cell from the first closed ` ```mermaid ` block of `ARCHITECTURE.md` in the same directory: `absent` when the file or the block is missing, otherwise `<flag>@<fingerprint>` with `updated` when the fingerprint differs from the previous milestone row's recorded fingerprint and `stale` when it matches. The row identity is the next unused `M<n>`, never reissuing an existing one. Two milestones for one working directory never interleave writes, and a read or write failure logs a `project-register:` warning and drops that milestone instead of blocking the recorded work.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Milestone recognition is pure and runs synchronously in the event listeners. Each `todo/write` event is diffed against the previously observed whole-list snapshot kept per Session: an item already completed there never records again, and an item absent there counts as not completed. Goal completions supply their objective directly. Recognized titles queue onto one promise chain per working directory, so a working directory's register receives strictly serialized read-append-write cycles; each cycle re-reads `ARCHITECTURE.md` and `DECISIONS.md` at call time, so the recorded flag reflects the files as they are when the milestone lands, not when it was detected. The previous milestone row's Diagram fingerprint decides `stale` versus `updated`, and `nextRegisterId` scans the raw table so an existing identity is never reissued. The listeners are effect-owned and the plugin keeps no other state than the per-Session todo snapshots and the append chains, which settle on their own.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin wiring: event listeners, session eligibility, the per-working-directory append chain, and the filesystem reads |
| [`src/record.ts`](src/record.ts) | Pure milestone logic: newly completed milestone detection, diagram flags, dates, and register-row minting |

**Runtime invariant:** No runtime invariant companion is published. Every recorded row derives from the session events and the filesystem reads at call time, so no independent observation can diverge from the register.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Project register grammar](../../util/project-register/README.md) — the `DECISIONS.md` table grammar, Mermaid extraction, and fingerprints this plugin writes through.
- [Goal service](../../goal/goal/README.md) — the goal lifecycle whose completion records a milestone.
- [Todo tool](../../todo/tool-todo/README.md) — the todo list whose marker items become milestones.

<a id="model-experience"></a>
## Model Experience

None, as this package registers no tool, contributes no prompt section, and appends no session event; it only appends rows to the workspace `DECISIONS.md`.

#### KV Cache effect

None. Nothing here enters a model request, so provider cache reuse is unaffected.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- A resumed Session's first observed todo list records nothing: a milestone records only on an observed transition, so a milestone completed before this Host process observed the Session is never recorded.
- Only the first closed non-empty ` ```mermaid ` block of `ARCHITECTURE.md` counts as the diagram; later blocks are invisible to the recorded flag.
- A write failure drops the milestone with a `project-register:` warning and no retry, so `DECISIONS.md` gains no row for it.
- A repeated completed item is recognized by its trimmed content: a reworded todo that completes again records a second milestone row.
- The diagram fingerprint detects content change only, never identity.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
