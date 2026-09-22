---
description: "The composer Enhance control: a quiet button and an anchored rewrite preview with accept/undo over the enhance Remote seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-enhance

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-enhance` adds an Enhance control to the composer: press it and an anchored popover shows your draft restructured into a task — objective, constraints, acceptance criteria — as changed-line hunks you can review. Accept writes the rewrite in one atomic replace; Dismiss, Escape, or any interruption leaves your draft byte-identical. All copy is locale-owned (en/zh), the control is one quiet icon, and the preview runs over the host-side enhance Remote — no model call, no cost.

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

The plugin mounts as one `dsh.client` row in the Web application's browser roster; the button appears in the composer control row and the popover in the composer overlay anchor.

### When to choose it

Choose this plugin to give people an inline rewrite of their unsent drafts. Avoid it in automation-only compositions: it is browser presentation over the enhance Remote and has no headless surface.

### Using the control

| Action | Result |
|---|---|
| Press the Enhance button | The popover opens and one preview of the current draft is requested. |
| Accept | The draft is replaced in one atomic write and focus returns to the composer. |
| Dismiss / Escape / outside interaction | The popover closes and the draft is untouched, byte for byte. |

Pending and failure states carry no prose: the busy tier shows one icon, and the failure tier shows one short actionable line.

### Minimal configuration

```yaml
- id: ui-enhance
  name: '@deepseek-ai/dsh-client-ui-enhance'
```

The row requires the enhance Remote (`dsh-enhance-runtime`) and the conversation input facade in the same composition.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One per-composer controller is shared by two slot registrations, and it is the only reach beyond this package.

`apply` registers the button into `conversation.input.right` and the preview popover into `conversation.input.overlay` through `ctx.slots.inject`, each injecting the same `EnhanceController` handle for the session. The controller holds transient state (an identity-stable snapshot store), a stale-attempt token so a late response never lands over a newer one, and the four verbs: `request` reads the draft through `conversation.input.for(actx).state` and calls the enhance Remote; `accept` performs the single atomic `conversation.input.for(actx).setDraft(text)` replace; `dismiss` writes nothing. `focus()` restores the composer caret after either exit.

The popover renders changed-line hunks from the maintained `diff` library against the draft captured at request time. Both views are package-internal; tests import them directly.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Assembly: locale registration, the two slot registrations, controller wiring |
| [`src/client/enhance-controller.ts`](src/client/enhance-controller.ts) | Transient preview state and the atomic-accept / byte-identical-dismiss verbs |
| [`src/client/EnhanceButtonView.tsx`](src/client/EnhanceButtonView.tsx) | The quiet composer control |
| [`src/client/EnhancePreviewView.tsx`](src/client/EnhancePreviewView.tsx) | The anchored changed-line preview popover |

No runtime invariant companion is published: this plugin owns presentation state only, and its behavior crosses packages exclusively through injected Cordis services and slots.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the plugin-level contract is not enough.

- [`dsh-enhance-runtime`](../../interaction/enhance-runtime/README.md) — the preview Remote face and the transient preview contract.
- [Conversation reference](../../../docs/subsystems/conversation.md) — composer slot vocabulary and the input facade.
- [Web Client architecture](../../../docs/subsystems/web-client.md) — the slot and props discipline this plugin follows.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser plugin constructs no model request and contributes no model context; the accepted draft becomes model-visible only when the person sends it as an ordinary message.

#### KV Cache effect

Zero direct token effect: the plugin touches no request, so it cannot invalidate any reusable prefix. The human who sends the accepted draft owns the cache behavior of that submission.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the plugin is a poor fit; they are the current package constraints.

- **Changed-lines diff only** — the side-by-side responsive split arrives with the composer-UX refinement slice; this slice renders one changed-line column.
- **No hotkey yet** — the composer exposes no keyboard extension seam, so the control is pointer-driven until one exists.
- **Preview, then accept** — ghost streaming, the variant ring, and the depth menu arrive with the streaming and variant slices.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative; shipped behavior lives in the sections above and the package code.

- **Controller-per-composer** — one shared handle across both registrations satisfies the live-data rule without a declared store; a per-session store split is warranted only if two composers ever render concurrently.

</details>
