---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-23-enhance-attempt-event

English | [中文](2026-09-23-enhance-attempt-event.zh.md)

## Summary

Adds the ignorable enhance/attempt log event recording one settled Enhance refinement attempt with its exact model request.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-23-enhance-attempt-event
baseline: false
changes:
  - root: "event:enhance/attempt"
    previous: null
    after: "f4f075735a89240a48e202eb1b96d52af01e9d1cfeaa145676b05bc2a02cb035"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Additive: existing records remain valid. Builds that predate the type skip the event through its ignorable envelope marker, and the payload is log-only — it never enters model history. No envelope or header representation changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/core/session packages/llm/llm-deepseek: 1061 tests passed; enhance-attempt.spec.ts covers the required marker declaration, append, and seed admission.

<a id="dev-note"></a>
## Dev Note

None.
