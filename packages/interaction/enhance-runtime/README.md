---
description: "The enhance preview service over the deterministic prompt-to-task pipeline: rubric loading, the preview Remote face, and the transient no-model preview contract."
kind: "package-reference"
---

# @deepseek-ai/dsh-enhance-runtime

English | [中文](README.zh.md)

## Summary

`dsh-enhance-runtime` answers one request with one structured draft rewrite: give `ctx.enhance.preview()` a draft and you get back the classifier facts, structured sections, and rendered text of its task form. The composer Enhance button and the `/enhance` command family reach it over the Typert Remote face, so browser code never imports the pipeline or the rubric. The rubric (your principles, golden examples, thresholds) loads from `.dsh/enhance.yml` at plugin load and fails loud when invalid. A preview runs no model call and writes no session events, so it costs nothing beyond one deterministic pass.

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

Mount it in a Host composition beside the command registry; the Remote face serves every client assembly automatically.

### When to choose it

Choose this service whenever a surface needs a deterministic draft rewrite — composer previews, command handlers, or later the model-refiner stage. Avoid it when you need the rewrite to reach a model: previews here are model-free, and the accepted text reaches a model only when the human sends it as an ordinary message.

### Minimal configuration

```yaml
- id: enhance-runtime
  name: '@deepseek-ai/dsh-enhance-runtime'
  config:
    enhanceFile: '.dsh/enhance.yml'
```

| Field | Default | Meaning |
|---|---|---|
| `enhanceFile` | `required` | Rubric file path; a relative path resolves against the process working directory at plugin load. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-enhance-runtime) is the exhaustive source for every accepted field.

### The preview request

One call classifies and structures one draft:

```ts
const result = await enhance.preview({ draft, depth: 'bundle', direction: 'enhance' })
```

Success returns the route prediction (`enhance`, `skip`, `split`, `fold`) with its matched rule, the resolved depth and language, the structured sections, and the rendered text. A blank draft or undeclared depth rejects with `EnhanceError` from `@deepseek-ai/dsh-enhance`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The service is load and dispatch only: `@deepseek-ai/dsh-enhance` owns every transformation.

Load reads `enhanceFile` synchronously, parses it as YAML, and validates it with `validateEnhanceConfig`; a missing file, invalid YAML, or violated rule throws `EnhanceError` naming the path and every violation, so a broken rubric fails the composition at load. Dispatch resolves the request through `resolveEnhance`, renders through `renderEnhance`, and projects through `renderBundleText`, all pure functions.

The `preview` method carries the `@Remote` marker, and the Typert build step generates the `./typert` and `./remote` faces: Host compositions discover the binding automatically, and client assemblies `$mount` the generated Remote contribution. Wire types live on `./types` so generated codecs reference them without rooting through the entry.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service entry: rubric load, the `preview` Remote method |
| [`src/types.ts`](src/types.ts) | Preview request and result wire vocabulary |

No runtime invariant companion is published: this service owns no diverging observation pair — the pure pipeline's tests cover the transformation, and the composition suites cover load and dispatch.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the service-level contract is not enough.

- [`dsh-enhance`](../../interaction/enhance/README.md) — the deterministic pipeline, rubric validation, and bundle vocabulary.
- [`dsh-command-enhance`](../../interaction/command-enhance/README.md) — the `/enhance` command over the same pipeline.
- [Commands package](../commands/README.md) — the registry and dispatch contract the surfaces share.

-----

<a id="model-experience"></a>
## Model Experience

None, as the service runs no model call and appends no session events; the rendered text becomes model-visible only when a person sends it as an ordinary message.

#### KV Cache effect

Zero direct token effect: the service touches no request, so it cannot invalidate any reusable prefix. The human who submits rendered text as user input owns the cache behavior of that submission.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the service is a poor fit; they are the current package constraints.

- **One rubric per process** — `enhanceFile` resolves at plugin load against the process working directory, so a multi-workspace host shares one rubric until per-workspace resolution lands.
- **Template stage only** — the model refiner and its failure ladder are a later stage over this pipeline; previews are structural until then.
- **`/enhance` keeps its own rubric load** — the command plugin loads the same file shape until a unification slice moves it onto this service.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative; shipped behavior lives in the sections above and the package code.

- **Refiner placement, settled shape** — the model refiner extends this service's preview pipeline as one optional stage after the template stage; see the Agent Note on the Remote preview and template-first pipeline.
- **Scoped Typert generation** — the whole-workspace tsdown pass is unstable on some hosts; `WorkspaceTypertGenerator.generate()` over an explicit package subset emits the same faces.

</details>
