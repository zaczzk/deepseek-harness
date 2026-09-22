---
description: "Deterministic prompt-to-task structuring for the /enhance command: validated rubric configuration, request resolution, and template bundle rendering with no model call."
kind: "package-library"
---

# @deepseek-ai/dsh-enhance

English | [中文](README.zh.md)

## Summary

With `dsh-enhance` you turn a rough draft into a structured task bundle — objective, constraints, acceptance criteria, and optional goal and todo drafts — in one deterministic pass with no model call. `dsh-command-enhance` uses it to power `/enhance`, and any Host or Client plugin can call the same functions to render or preview bundles. Start from `resolveEnhance` and `renderEnhance`. Everything derives from a validated `.dsh/enhance.yml` rubric, so your principles appear verbatim in every bundle and keyless tests can assert exact output.

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

### When to use it

Reach for this library when a caller needs draft text restructured against stored principles with reproducible output: the `/enhance` command, a composer preview, or a keyless test double for a later model stage. Do not use it when the task needs invented acceptance criteria or repository context — this package only structures what the draft and the rubric carry.

### Entry point

```ts
import { renderBundleText, renderEnhance, resolveEnhance, validateEnhanceConfig } from '@deepseek-ai/dsh-enhance'

const config = validateEnhanceConfig({
  principles: [{ id: 'modularity', text: 'Prefer modular components.' }],
  skipPatterns: [],
  limits: { minDraftCharacters: 10, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 2 },
  depths: { task: ['objective', 'acceptance'] },
  defaultDepth: 'task',
  outputLanguage: 'auto',
})
const request = { draft: 'Add a settings page with save and cancel buttons.' }
const spec = resolveEnhance(request, config)
const text = renderBundleText(renderEnhance(request, spec, config))
```

Success produces a frozen `EnhanceBundle` and its plain-text projection; `text` starts with `Objective:` and lists one `- [ ]` acceptance checkbox per draft sentence. `validateEnhanceConfig` throws `EnhanceError` listing every violated rubric rule at once, and `resolveEnhance` throws `EnhanceError` for blank drafts and undeclared depths; no other failure becomes an `EnhanceError`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One explicit resolution step feeds one template renderer; every function is pure and the package carries no runtime dependencies.

Pipeline: `validateEnhanceConfig` parses the rubric at the configuration boundary, collecting all violations into one `EnhanceError`, and compiles the skip patterns with the `u` flag. `resolveEnhance` classifies the draft with local signals only (first matching skip pattern, then the three length thresholds) and resolves the depth's sections, the direction, and the body language. `renderEnhance` derives the sections in canonical order, and `renderBundleText` projects them with localized `en`/`zh` headings.

| File | Role |
|---|---|
| [`src/types.ts`](src/types.ts) | Request, spec, bundle, and rubric configuration vocabulary |
| [`src/config.ts`](src/config.ts) | Rubric validation and `validateSections`, the bundle validation boundary |
| [`src/resolve.ts`](src/resolve.ts) | `resolve(request): Spec` — route, depth, sections, direction, body language |
| [`src/template.ts`](src/template.ts) | Template bundle rendering and its plain-text projection |

The section vocabulary is closed: `objective`, `context`, `constraints`, `acceptance`, `verification`, `doneLooksLike`, `goal`, `todos`. Constraint lines use the citation grammar `[principle:<id>] <text>` over configured principle ids; `validateSections` rejects uncited lines and blank items, `dropUncitedLines` drops uncited lines from refinement output, and every configured example passes that same boundary at load.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the library-level contract is not enough.

- [`dsh-command-enhance`](../command-enhance/README.md) — the `/enhance` command that mounts this pipeline for chat UIs.
- [Commands package](../commands/README.md) — the registry and dispatch contract behind slash commands.
- [Commands subsystem reference](../../../docs/subsystems/commands.md) — command vocabulary, lifecycle events, and service behavior.

-----

<a id="model-experience"></a>
## Model Experience

None, as this library runs no model request and assembles no model context; a rendered bundle becomes model-visible only when a person submits the text as ordinary input.

#### KV Cache effect

Zero direct token effect: the package touches no request, so it cannot invalidate any reusable prefix. The consumer that submits a rendered bundle as user input owns the cache behavior of that submission.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the library is a poor fit; they are the current package constraints.

- **Structural criteria only** — acceptance criteria and todo seeds are sentence splits of the objective; the template invents no acceptance content, so task-specific criteria need a model refiner stage.
- **Closed section vocabulary** — the eight section ids are fixed; a custom section fails `validateSections` at the validation boundary.
- **No repository context** — a bundle carries only the draft and the rubric; working-tree or history context needs a separate provider stage.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative; shipped behavior lives in the sections above and the package code.

- **Model refiner stage, undecided shape** — an optional refinement pass over template output is a later change; its schema validation and repair rules land with it.
- **Per-workspace rubric resolution, undecided** — callers supply the rubric values; deriving them from a workspace service is an open direction.

</details>
