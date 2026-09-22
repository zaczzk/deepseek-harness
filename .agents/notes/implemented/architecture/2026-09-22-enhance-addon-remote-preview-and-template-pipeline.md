# Agent Note: Enhance addon Remote preview and template-first pipeline

Status: implemented

English | [中文](2026-09-22-enhance-addon-remote-preview-and-template-pipeline.zh.md)

## Problem

A composer pre-send prompt rewrite needs the pure structuring pipeline and the user's rubric (principles, golden examples) together. Dynamic client bundles reject undeclared workspace value imports and `dsh.client.external` is not a feature-plugin dependency mechanism, so the client cannot import the pipeline; moving the rubric into the browser would put user configuration in an artifact instead of a versioned file. A model-refiner-first pipeline cannot be tested keyless and fails open on model errors. The composer-block registry raises inert-reason blocks that make the composer unusable, which a clarify flow must not do. Accepting an enhanced draft also raises the question of who is authoritative to create the accompanying goal.

## Decision

`@deepseek-ai/dsh-enhance` is a zero-dependency pure pipeline: rubric validation, one explicit `resolve(request): Spec` step (route, depth, sections, direction, body language), template bundle rendering, and the bundle validation boundary (`validateSections`, `dropUncitedLines`). The deterministic template stage IS the pipeline; a model refiner is one optional stage over its output. Template output is the labeled degraded mode and the keyless test double, so every path is testable without an API key.

Previews run host-side behind the Typert Remote face of `@deepseek-ai/dsh-enhance-runtime` (ctx key `enhance`), consumed remotely by the client plugin the way `dsh-client-ui-commands` consumes `ctx.commands`. The rubric stays host-side in `.dsh/enhance.yml` and fails loud at load. A preview is transient: it runs no model call and appends no session events; the accepted text becomes model-visible only when the human sends it as an ordinary message. Later model-refiner requests append one ignorable session event carrying the exact request so model-visible equals logged.

Accept is host-attested human input and commits as one operation: the single atomic draft replace plus an optional `ctx.goals.create` call — the same service path the human `/goal` command uses. `tool-goal/authority.ts` gates the model-facing goal tools, not service calls made on a human gesture. Goal completion criteria live in the goal seam; todo seeds travel inside the accepted text as `todo_write` instructions. The enhancer keeps no criteria store and no todo state.

Clarify chips ride the enhance popover as an anchored overlay on the slash-picker +4px pattern and never lock the input surface. `ComposerBlock` is the composer inert-reason registry and is not used for them.

## Alternatives considered

**Import the pure core into the client bundle.** The dynamic build preset rejects undeclared workspace value imports, and `dsh.client.external` is not a feature-plugin dependency mechanism; a shared-module row would couple browser materialization to a host library for no gain once the rubric is host-side.

**Model-refiner-first pipeline with template fallback.** Every request would cost a model call, keyless tests would mock the primary path instead of exercising it, and a model failure would degrade the common case. Template-first makes the common case free and the refiner the enhancement.

**Clarify chips through `ComposerBlock`.** The registry's contract is an inert-reason that disables message input; the composer must never be locked by this addon, so the chips are popover state instead.

**A new emission authority for goal creation.** The goal service's `create` is already the documented human path behind `/goal`; accepting a preview is equally host-attested human input, and a second authority path would create a second writer beside the goal seam.

**Client-side variant history in memory.** Drafts survive session switches; variants persist with the draft through the existing draft-restore channel as opaque composer state, and no new session log schema is introduced for decorative state.

## Consequences

The refiner slices extend `enhance-runtime` and the core's validation boundary only; `GenerateOptions.purpose` gains an `enhance` member with every consumer updated in the same change, and the attempt event rides ignorable envelope data with both SDK projections updated alongside. The `/enhance` command keeps its own rubric load until a unification slice moves it onto the service; that duplication is recorded in both package READMEs. Client tests own the atomic replace and byte-identical discard properties; the shared keyless fixture set drives unit, composition, and recorded-session tiers. Package READMEs pin the template's model-visible literals verbatim.
