---
description: "Web Decisions conversation view: the session workspace's DECISIONS.md major-decision register with milestone diagram status."
kind: "package-reference"
---

# dsh-client-ui-decisions

English | [中文](README.zh.md)

## Summary

Use this package to see the session workspace's major-decision register without leaving the conversation. The `decisions` conversation view reads `DECISIONS.md` over the `workspaceFiles` Remote and renders its decision-register table newest first, one row per decision or milestone, with each milestone's recorded diagram state in the Diagram column and the latest milestone marked.

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

Mount the package in the Web client roster beside `ui-conversation`, the `workspace-files` client face, and the resources plugin that serves the `file` provider. It registers one `conversation.view` entry (`decisions`, order 30) whose label rides the `decisions` locale namespace. The tab derives everything from the addressed Session: the Host resolves `DECISIONS.md` against that Session's workspace root, so no root travels to the browser.

Rows read newest first (reverse file order). The Diagram column shows the mark a milestone row recorded — `updated`, `stale`, or `absent` — while decision rows show `—`. The latest milestone row is marked so its recorded diagram state is the one scanned first.

### Configuration

None. The workspace file name (`DECISIONS.md`) is a protocol constant shared with the milestone recorder through `@deepseek-ai/dsh-util-project-register`.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The standard `useResource` hook gives the register's metadata — its version — through the `file` provider, and the tab's own store holds the text it reads through `workspaceFiles.readBytes`. One read runs per observed metadata version, so a failed read stays failed until the file moves again, and reads of one view settle in submission order. `parseRegister` skips malformed table lines instead of rejecting the document, so one broken row cannot hide the rest.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Plugin body: dictionaries, store, and the `conversation.view` registration |
| [`src/client/DecisionsView.tsx`](src/client/DecisionsView.tsx) | Register table and status lines |
| [`src/client/store.ts`](src/client/store.ts) | Per-Session register read state |
| [`src/client/face.ts`](src/client/face.ts) | Ordered register reads into the store |
| — | No runtime invariant companion is published; every displayed value derives from the Host's reads at call time. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Project register utilities](../../util/project-register/README.md) — the register grammar and diagram evidence this view shares with the recorder.
- [Workspace file service](../../api/workspace-files/README.md) — the bounded reads and change feeds behind `useResource<'file'>`.
- [Conversation reference](../../docs/subsystems/conversation.md) — how conversation view tabs register and render.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package registers no tool, contributes no prompt section, and appends no session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One register per workspace** — only the workspace-root `DECISIONS.md` is read; a register kept elsewhere is not shown.
- **Register prose stays in the file** — the tab renders the decision-register table; the rationale prose `DECISIONS.md` carries beneath the table is not projected.
- **File order only** — rows display newest first by file position; the table does not sort by date or status.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
