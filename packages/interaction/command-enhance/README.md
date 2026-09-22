---
description: "The /enhance command for interactive compositions: how to mount it, what the rubric file configures, and what the structured output contains."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-enhance

English | [中文](README.zh.md)

## Summary

`dsh-command-enhance` adds an `/enhance` command to chat UIs: give it a draft and you receive a structured task — objective, constraints drawn from your principles, acceptance criteria, and at bundle depth goal and todo drafts — without a model call or any model-visible output. The rubric lives in a `.dsh/enhance.yml` file you version with your repository, so every bundle cites your own principles verbatim. A one-line route advisory flags drafts that may already be clear or that deserve splitting. Mount the command registry and this plugin; edit the rubric file only between reloads.

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

Type `/enhance` with a draft when you want a robust task form before sending anything to the agent.

### When to choose it

Choose this plugin when a composition has `ctx.commands` and the people using it want draft structuring against stored principles with no model cost. Avoid it when you need invented acceptance criteria, repository context, or inline composer rewriting — those need the later refinement and composer stages.

### Using the command

| Input | Result |
|---|---|
| `/enhance <draft>` | The structured bundle at the configured default depth. |
| `/enhance [task] <draft>` | The same draft at depth `task` (only the sections that depth declares). |
| `/enhance [wip] fix the build` | `[wip]` stays draft text: a bracketed token selects a depth only when it names a declared depth. |
| `/enhance` with no draft | `Usage: /enhance [<depth>] <draft> (depths: task, spec, bundle)` — the depth list follows your rubric file. |

Every body heading follows the draft's language (`en` or `zh`); chrome messages stay English like every other command. A non-default route prediction prefixes exactly one advisory line, for example `Route: fold (fold-below-characters) — consider folding this into the current goal instead of starting new work.` Each depth's body ends its `verification` section with the package-owned line `Confirm every acceptance criterion is satisfied before reporting completion.` (Chinese builds render `报告完成前确认每条验收标准均已满足。`).

### Minimal configuration

Mount the command registry and this plugin:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-enhance
  name: '@deepseek-ai/dsh-command-enhance'
  config:
    enhanceFile: '.dsh/enhance.yml'
```

| Field | Default | Meaning |
|---|---|---|
| `enhanceFile` | `required` | Path to the rubric file; a relative path resolves against the process working directory at plugin load. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-command-enhance) is the exhaustive source for every accepted field. The rubric file itself validates at load and fails loud with every violated rule; this starter form covers every field:

```yaml
principles:
  - id: modularity
    text: Prefer modular components over monoliths.
  - id: minimal-tech-debt
    text: Prefer maintained dependencies over hand-rolling.
skipPatterns:
  - '^ping$'
limits:
  minDraftCharacters: 10
  foldBelowCharacters: 30
  splitAboveCharacters: 200
  maxExamples: 2
depths:
  task: [objective, acceptance]
  spec: [objective, context, constraints, acceptance, verification]
  bundle: [objective, context, constraints, acceptance, verification, goal, todos]
defaultDepth: spec
outputLanguage: auto
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin is load and dispatch only; `@deepseek-ai/dsh-enhance` owns every transformation.

Load: `apply` reads `enhanceFile` synchronously, parses it as YAML, and validates it with `validateEnhanceConfig`; a missing file, invalid YAML, or violated rule throws `EnhanceError` naming the path and every violation, so a broken rubric fails the composition at load.

Dispatch: the handler parses an optional leading bracketed depth, resolves the request, renders the bundle, and returns it as `CommandResult` text. A bracketed token selects a depth only when it names a declared depth, so drafts like `[WIP] fix the build` are never misread. The handler runs no model call and sends nothing to the model; the executor records the ordinary log-only `command/run` / `command/done` pair.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: rubric load, `/enhance` registration, grammar, route advisory |

No runtime invariant companion is published: this adapter owns no state or event stream, and the command registry owns registration and dispatch lifecycle.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the command-level contract is not enough.

- [`dsh-enhance`](../enhance/README.md) — the deterministic pipeline and rubric validation behind the command.
- [Commands package](../commands/README.md) — the registry and dispatch contract behind chat commands.
- [Commands subsystem reference](../../../docs/subsystems/commands.md) — command vocabulary, lifecycle events, and service behavior.

-----

<a id="model-experience"></a>
## Model Experience

None, as the command runs no model call and contributes no model context; the structured text becomes model-visible only when a person submits it as ordinary input, and the command lifecycle stays log-only.

#### KV Cache effect

Zero direct token effect: the command touches no request, so it cannot invalidate any reusable prefix. The human who submits a rendered bundle as user input owns the cache behavior of that submission.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the command is a poor fit; they are the current package constraints.

- **One rubric per process** — `enhanceFile` resolves at plugin load against the process working directory, so a multi-workspace host shares one rubric until per-workspace resolution lands.
- **Text output only** — the command cannot create goals, todos, or composer drafts; you apply the structured text yourself through the ordinary human-authoritative paths.
- **Reload required for rubric edits** — the rubric file is read once at plugin load; reload the composition after editing it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative; shipped behavior lives in the sections above and the package code.

- **Composer integration, later stage** — an inline Enhance control with accept/undo diff reuses this pipeline through the composer extension seams; its design lands with that change.
- **Goal and todo emission, later stage** — emitting bundle drafts through the goal and todo seams stays human-authoritative; the emission design lands with that change.

</details>
