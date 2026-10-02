---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-02-approval-rule-reference

English | [中文](2026-10-02-approval-rule-reference.zh.md)

## Summary

Approval audit events may now carry an optional `rule` reference identifying a remembered-approval rule that answered the request.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-02-approval-rule-reference
baseline: false
changes:
  - root: "event:approval/asked"
    previous: "2026-09-11-initial"
    after: "70964417b3c0270cdf5a7f833a00cb45b19c1a4925fa19b7d9b49cbdcfee227b"
    decision: same-version
  - root: "event:approval/decided"
    previous: "2026-09-11-initial"
    after: "1b2e308c2a64c816e9ad48333917245c948b62a8c5636cede2250f0212e11f21"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The `rule` field on `approval/asked` and `approval/decided` is optional, so existing writers continue to produce events without it and existing readers are unaffected. A missing `rule` means no remembered rule answered the request (the ordinary composed-answerer path). Adding an optional field is same-version allowed.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/interaction/user-approval --coverage (rules.spec.ts eval + rules-store suites 51/51 passed, per-file 100% src coverage); pnpm run gen-persistence-catalog --check clean; pnpm run verify-persistence-changes --check green.

<a id="dev-note"></a>
## Dev Note

None.
