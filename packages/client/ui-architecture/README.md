---
description: "Web Architecture conversation view: the session workspace's current Mermaid architecture diagram with milestone diagram status."
kind: "package-reference"
---

# dsh-client-ui-architecture

English | [中文](README.zh.md)

## Summary

Use this package to see the session workspace's current architecture diagram without leaving the conversation. The `architecture` conversation view reads `ARCHITECTURE.md` over the `workspaceFiles` Remote, renders its first `mermaid` block with Mermaid, and shows the latest `DECISIONS.md` milestone's recorded diagram state beside the file name. A diagram a milestone recorded as stale keeps one action line over the canvas until its source changes.

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

Mount the package in the Web client roster beside `ui-conversation`, the `workspace-files` client face, and the resources plugin that serves the `file` provider. It registers one `conversation.view` entry (`architecture`, order 20) whose label rides the `architecture` locale namespace. The tab derives everything from the addressed Session: the Host resolves `ARCHITECTURE.md` and `DECISIONS.md` against that Session's workspace root, so no root travels to the browser.

The status chip reports the diagram's live state: `current`, `stale`, or `absent`. `stale` is the state the latest milestone row recorded as `stale` while the diagram source still fingerprints as it did then; editing the source clears it.

### Configuration

None. The workspace file names (`ARCHITECTURE.md`, `DECISIONS.md`) are protocol constants shared with the milestone recorder through `@deepseek-ai/dsh-util-project-register`.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The standard `useResource` hook gives each document's metadata — its version — through the `file` provider, and the tab's own store holds the text it reads through `workspaceFiles.readBytes` and the SVG Mermaid renders for the extracted diagram source. One read runs per observed metadata version, so a failed read stays failed until the file moves again, and reads and renders of one view settle in submission order. Mermaid's browser bundle arrives as one lazily imported self-contained client chunk; `tsdown.config.ts` binds its script-scope global during bundling.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Plugin body: dictionaries, store, and the `conversation.view` registration |
| [`src/client/ArchitectureView.tsx`](src/client/ArchitectureView.tsx) | Status strip, diagram canvas, and status lines |
| [`src/client/store.ts`](src/client/store.ts) | Per-Session document and render state |
| [`src/client/face.ts`](src/client/face.ts) | Ordered reads and renders into the store |
| [`src/client/render-diagram.ts`](src/client/render-diagram.ts) | Lazy Mermaid loading and SVG rendering |
| — | No runtime invariant companion is published; every displayed value derives from the Host's reads at call time. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Project register utilities](../../util/project-register/README.md) — the register grammar, diagram extraction, and fingerprints this view shares with the recorder.
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

- **One diagram per document** — only the first `mermaid` block renders; later blocks stay hidden.
- **Mermaid dialects follow the bundled renderer** — an exotic diagram type loads its chunk from the same bundle; a source Mermaid cannot parse shows the render failure line rather than source text.
- **No pan or zoom** — the SVG scales to the canvas width and scrolls vertically.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
