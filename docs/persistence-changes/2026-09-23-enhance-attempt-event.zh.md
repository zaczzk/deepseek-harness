---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-23-enhance-attempt-event

[English](2026-09-23-enhance-attempt-event.md) | 中文

## 概述

新增可忽略的 enhance/attempt 日志事件，记录一次已结算的 Enhance 精炼尝试及其确切模型请求。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

纯新增：已有记录仍然有效。旧版本构建通过信封的 ignorable 标记跳过该事件；载荷仅写日志，不进入模型历史。信封与 header 表示均无变化。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/core/session packages/llm/llm-deepseek：1061 个测试通过；enhance-attempt.spec.ts 覆盖必需标记声明、追加与种子准入。

<a id="dev-note"></a>
## 开发备注

无。
