---
description: "记录一次持久化类型变更及其兼容性确认。"
kind: persistence-change
---

# 2026-10-03-workspace-halt-event

[English](2026-10-03-workspace-halt-event.md) | 中文

## 摘要

新增可忽略的 workspace/halt 日志事件，记录作为一次舰队停机迭代而被归档的某个会话——发出该归档调用的工作区迭代所归属的带品牌 `WorkspaceId`，以及舰队级计数——使被停机会话自身的日志记录下其停止原因。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

增量式变更：现有记录仍然有效。早于该类型构建的版本通过其可忽略信封标记跳过该事件，且该负载仅作日志记录——绝不进入模型历史。信封或头部表示均无变化。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/core/session packages/workspace/workspace：workspace 注册表套件覆盖带舰队标记的归档追加（事件在归档提交后发出；行路径不追加任何内容；持久化故障仅在日志记录后解决，不会令已提交的归档失败），核心套件覆盖可忽略信封的声明、追加与种子接纳。

<a id="dev-note"></a>
## 开发备注

无。
