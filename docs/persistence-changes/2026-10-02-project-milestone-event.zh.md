---
description: "记录一次持久化类型变更及其兼容性确认。"
kind: persistence-change
---

# 2026-10-02-project-milestone-event

[English](2026-10-02-project-milestone-event.md) | 中文

## 摘要

新增可忽略的 project/milestone 日志事件，记录一条已提交的里程碑登记行——其带品牌的 `M<n>` 身份、标题与图表证据——使该里程碑已记录的决策可从会话日志中重建。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

增量式变更：现有记录仍然有效。早于该类型构建的版本通过其可忽略信封标记跳过该事件，且该负载仅作日志记录——绝不进入模型历史。信封或头部表示均无变化。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/core/session packages/workspace/project-register：project-register 插件套件覆盖里程碑行事件的追加，核心套件覆盖可忽略信封的声明、追加与种子接纳。

<a id="dev-note"></a>
## 开发备注

无。
