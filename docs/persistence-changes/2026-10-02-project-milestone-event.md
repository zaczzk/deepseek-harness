---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-02-project-milestone-event

English | [中文](2026-10-02-project-milestone-event.zh.md)

## Summary

Adds the ignorable project/milestone log event recording one committed register milestone row — its branded `M<n>` identity, title, and diagram evidence — so a milestone's recorded decisions are reconstructable from the session log.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-02-project-milestone-event
baseline: false
changes:
  - root: "event:project/milestone"
    previous: null
    after: "72c664e8bbdb11ec681f558723fbe1d4f4fff41d62cb2fd7137af15a17921dd1"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Additive: existing records remain valid. Builds that predate the type skip the event through its ignorable envelope marker, and the payload is log-only — it never enters model history. No envelope or header representation changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/core/session packages/workspace/project-register, where the project-register plugin suite covers the milestone-row event append and the core suite covers the ignorable envelope declaration, append, and seed admission.

<a id="dev-note"></a>
## Dev Note

None.
