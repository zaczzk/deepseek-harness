---
description: "Polls the provider's Token Plan usage report with a stored console session and serves the newest usage windows to the browser meter."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-token-plan-usage

English | [中文](README.zh.md)

## Summary

This host plugin owns the provider session the usage meter must not see. It polls the console's Token Plan usage endpoint with the stored session cookie, parses the report's `data.monthUsage.items` monthly-quota row into one monthly usage window, and serves the newest reported windows at `/dsh/token-plan/usage` behind the composition's connection trust fence. The cookie never leaves the Host and is never logged; a report that no longer carries the console counts is refused (its field names alone reach the log) and the previous window stays served.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount it beside the browser meter in the Web composition:

```yaml
- name: '@deepseek-ai/dsh-host-token-plan-usage'
  config:
    sessionEnv: DSH_TOKEN_PLAN_SESSION
```

### Configuration

`origin` is the console origin serving `/api/v1/tokenPlan/usage`. `session` holds the console session cookie value, `sessionEnv` names the Host environment variable read when `session` is empty (prefer it, so no secret enters a configuration file). `pollIntervalMs` and `timeoutMs` bound the poll. With no stored session the reader stays idle and the route reports no limits.

### Reading the numbers

The route answers `GET` with `{ "limits": [...] }`: `period` is `month` for the console's monthly plan quota, with `usedTokens`, `limitTokens`, and an optional `resetsAt`. A period the provider does not report is simply absent. Credentialed requests never follow a redirect.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design behind the reader; the observable behavior is fully covered in [Use this package](#use-this-package).

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Function plugin: config, poll loop, and the trust-fenced route |
| [`src/usage.ts`](src/usage.ts) | Pure report parsing and the failure diagnostic |
| [`src/shared.ts`](src/shared.ts) | Route path and wire payload types shared with the browser meter |

The poll loop keeps one reference the route serves as-is, so every state change lands at one commit point. Parsing is total: a body without the console counts returns null instead of a partial window.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Token meter subsystem](../../../docs/subsystems/token-meter.md) — the session-side usage figures the meter shows beside these limits.
- [`ui-usage`](../../client/ui-usage/README.md) — the browser meter consuming this route.

-----

<a id="model-experience"></a>
## Model Experience

None, as the reader is Host plumbing; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request on the model's behalf.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One provider, one window** — the reader parses the console's Token Plan report only; no weekly window exists there, and no gateway reports usage caps in its response headers, so those rows stay hidden.
- **The counts schema is pinned to the live console report** — the `month_total_token` row of `data.monthUsage.items` carries `used`/`limit`; a drifted report reports absent and logs only its field names until the parser is retargeted.

**Runtime invariant:** No companion is published. The poll loop and its route share one reference published at one commit point, and the connection fence plus the parse-or-refuse rule are asserted by this package's Loader-composition spec.
