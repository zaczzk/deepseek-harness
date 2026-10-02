---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-02-approval-rule-reference

[English](2026-10-02-approval-rule-reference.md) | 中文

## 概述

审批审计事件现在可以携带可选的 `rule` 引用，标识应答该请求的已记住审批规则。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

`approval/asked` 与 `approval/decided` 上的 `rule` 字段为可选，现有写入方继续生成不带该字段的事件，现有读取方不受影响。缺少 `rule` 表示没有已记住规则应答该请求（常规组合应答路径）。新增可选字段允许以同一版本进行。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/interaction/user-approval --coverage（rules.spec.ts 求值 + rules-store 套件 51/51 通过，src 逐文件 100% 覆盖率）；pnpm run gen-persistence-catalog --check 通过；pnpm run verify-persistence-changes --check 通过。

<a id="dev-note"></a>
## 开发备注

无。
