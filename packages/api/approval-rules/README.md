---
description: "Host and Client approval-rule control: the durable remembered-rule store's list, save, and revoke mirrored to the browser over the generated approvalRuleSets Remote namespace, owning no grant lifecycle."
kind: "package-reference"
---
# Approval Rules Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-approval-rules` owns the Host `ctx.approvalRuleController` service and the generated Client `ctx.remote.approvalRuleSets` namespace. Its three Remote methods are exact passthroughs of the durable remembered-rule store that the `interaction/user-approval` package opens: `list` yields the unexpired rule rows ordered by name, `save` creates or replaces one rule (and write-prunes any now-expired rule, atomically through the store's single-open domain) and returns the branded id the row renders and revoke targets, and `revoke` removes one rule by that branded id and reports whether it existed. Each method translates the store's untyped failure onto a single stable `approval-rules/error` Remote code carrying the failing method as context, so a Settings seat renders one failure story. The controller is a thin seam over the durable store — it owns neither grant evaluation nor the audit trail; user-approval remains the single owner of both. The Client half installs `ctx.approvalRuleSets` (`IApprovalRuleSets`), the RPC passthrough service whose list/save/revoke a Settings seat issues.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Host controller requires the durable remembered-rule store service `ctx.approvalRules` and the Typert registry, and fails to load without them. `list()` returns the current (unexpired) remembered-rule rows ordered by name; the roster is a request/response snapshot, so a UI re-reads it to refresh after a write and no stream state lives on this side. `save({ record })` stores the rule fields (name, tool, effect, optional expiry) and returns the branded rule id, write-pruning any rule now expired in the same atomic store open. `revoke({ id })` removes one rule by its branded id and returns whether a rule with that id existed and was removed.

Every method rethrows a store failure through the Remote error channel. The store throws untyped errors (`approvalRules store is not open`), so the controller maps them onto the single stable `approval-rules/error` Remote code with the failing method carried as opaque diagnosis context — never the rule content.

The Client entry installs `ctx.approvalRuleSets` (`IApprovalRuleSets`), backed by `ClientApprovalRuleSets`. `list()`, `save(record)`, and `revoke(id)` each forward to the matching Remote method and return the Remote result, so a Settings seat owns its own read lifecycle and error presentation from the typed failure code. The plugin resolves the Gateway stream factory and the `approvalRuleSets` namespace while its own context is current, because callers issue reads on caller stacks whose dynamic context has not declared `remote.approvalRuleSets`.

### Config

None. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-api-approval-rules) is the exhaustive source for accepted fields and their JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

None, as approval-rule management is browser and Host control state; it registers no prompt, tool, or session event. The user-approval package remains the single owner of rule evaluation and the audit trail that the model's view of approvals depends on.

#### KV Cache effect

No direct effect; these reads and writes never touch model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This controller carries no caller authorization: the user-approval store is the only access rule, and every rule a connected browser supplies is stored as-is.
- The roster is a request/response snapshot; a Host restart between a UI's list and a follow-up save or revoke returns a fresh observation, not an incremental continuation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The controller is a stateless projection of `ctx.approvalRules` store reads and writes; the user-approval package owns the durable store, grant evaluation, and the audit trail these methods forward.