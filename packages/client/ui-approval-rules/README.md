---
description: "Remembered-approval-rule surface for the Web GUI: the Settings section listing durable rules with an add/edit form and revoke, plus the rule-answered transcript row; for users and maintainers of the approval-rules experience."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-approval-rules

English | [中文](README.zh.md)

## Summary

The Web GUI approval-rules surface shows the durable remembered approval rules and lets users add, edit, or revoke them, and it renders each rule-answered tool call as a transcript line. The Settings section owns the rule roster: it reads and writes the generated `approvalRuleSets` client service that the [approval-rules controller](../../api/approval-rules/README.md) mirrors onto the durable store the `interaction/user-approval` package opens, and beneath the roster it renders the effective-permission readout — the active retained Session's effective sandbox mode, workspace root, and permission value off one `session.projections` read. The rule-answered transcript row folds the `approval/decided` audit event — when it carries a remembered-rule reference — into one keyed `conversation.chat.node` line per answered call, naming the answering rule and its expiry when the rule is not permanent; an interactive answer (no rule) renders nothing.

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

Mount this plugin alongside `ui-conversation`, `ui-chat`, and `ui-settings`; the `approval-rules` Settings section then appears in the Settings section list and the rule-answered rows appear in the chat transcript wherever the session tracks `approval/decided` events. The section lists the durable rules (name, tool, allow/deny effect, and expiry when one is set), offers Add rule and per-row Edit and Revoke, and opens an add/edit form. Loading, empty, failed-read, failed-write, and refresh-after-save states each render a keyed line; a landed write whose roster re-read fails keeps the rows under the refresh-error notice. Beneath the roster the section shows the active retained Session's effective sandbox mode, workspace root, and permission value — session-less chrome names the deployment default for all three, and a failed read renders a shared error line with one Retry that re-issues the projection read.

### Failures

A failed write surfaces the keyed `rules.error` line naming the failed action (`save`/`allow`/`deny`/`revoke`); the failed-read and refresh-error lines carry their own Retry; the roster re-reads after every successful write so the row just written appears at once.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin's browser half registers three contributions that ride the plugin fiber (they disappear together on unload for HMR safety): the `approval-rule` Conversation Definition + its keyed `conversation.chat.node` renderer, the `approval-rules` Settings section, and the shared `approval.rules` locale dictionary merged into the UI slots `LocaleNamespaceMap`. The section is driven by `ApprovalRulesSectionController`, whose `createSnapshotStore`-backed store owns the roster read and the add/edit/revoke write paths; concurrent loads share one read, and a successful write re-reads the list. All reads and writes map one-to-one onto the `approvalRuleSets` client service's `list`/`save`/`revoke`. The effective-permission readout derives its three fields from one `session.projections` read on the active retained Session (found through the panel gate plus the `retainedBy.mainView` scan); a failed read strips every field to a shared error line with one Retry, and session-less chrome renders the deployment default. The transcript Definition matches only `approval/decided` records carrying a `rule`, keys one row per answered request by the request id, and the render collapses consecutive-same-rule rows — never the events. Every rendered string is a keyed `approval.rules` value; the section and transcript share the namespace.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the approval-rules surface is not enough. They move from the browser section to the approval-rules controller and the durable store.

- [dsh-api-approval-rules](../../api/approval-rules/README.md) — the Host controller + generated Client `approvalRuleSets` namespace this section reads and writes.
- [dsh-user-approval](../../interaction/user-approval/README.md) — the durable remembered-rule store this surface's controller wraps.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `approval/decided` audit events the transcript row folds: the durable store that the approval-rules controller wraps writes those events when a remembered rule answers a permission request. This package itself adds no model-visible input.

#### KV Cache effect

None. The transcript row renders existing `approval/decided` events; it does not extend the history tail.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the current approval-rules surface. They are current package constraints, not an approval-rules comparison or a task backlog.

- **Readout scope is the retained Session** — the effective-permission readout labels the Session retained in the current view by the `retainedBy.mainView` scan; a global panel, or a view holding no Session, shows the session-less deployment default for all three fields rather than a named Session's values.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The section controller state and the transcript projection's fold state are owned by the plugin's own store/Definition, and all disposals are proven by the HMR-safety spec — there is no independent runtime relationship to assert.
