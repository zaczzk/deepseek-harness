---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-03-workspace-halt-event

English | [中文](2026-10-03-workspace-halt-event.zh.md)

## Summary

Adds the ignorable workspace/halt log event recording one Session archived as one iteration of a fleet halt — the branded `WorkspaceId` of the Workspace whose iteration issued the archive call and the fleet-wide count — so a halted Session's own log records why it stopped.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-03-workspace-halt-event
baseline: false
changes:
  - root: "event:workspace/halt"
    previous: null
    after: "a0339d89650f48920a94ccbbb1c74140ef4a2b8f9ecca0093f8e61c2803a334f"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Additive: existing records remain valid. Builds that predate the type skip the event through its ignorable envelope marker, and the payload is log-only — it never enters model history. No envelope or header representation changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/core/session packages/workspace/workspace, where the workspace registry suite covers the fleet-marker archive append (event emitted after the archive commits; the row path appends nothing; a persistence fault logs and resolves without failing the committed archive) and the core suite covers the ignorable envelope declaration, append, and seed admission.

<a id="dev-note"></a>
## Dev Note

None.
