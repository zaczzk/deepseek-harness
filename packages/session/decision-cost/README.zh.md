---
description: "一个逐会话投影：把会话自身的注册里程碑行及其已提交的令牌用量折合成每个里程碑的派生成本，供组合、调试或扩展 milestoneCost 值的客户端与维护者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-decision-cost

[English](README.md) | 中文

## Summary

本包发布 `milestoneCost` 会话投影：对于本会话自身 `project/milestone` 事件所产生的每一行注册里程碑，折算出从该里程碑事件序列到下一个里程碑（或到会话结束）之间各轮次已提交的令牌用量。若某里程碑的区间没有记录任何用量，其值取 `null` 而非零，因此渲染层永远不会声称一个折合无法支持的“成本”。当工作区的注册表需要为每一决策行展示派生成本而不去虚构定价时，使用本包。

## Table of Contents

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当注册表界面需要为每一里程碑行展示派生成本时，在会话存储与投影注册表旁挂载本插件。只有在投影注册表存在时，本单元才会注册。

### 组合

```ts
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as DecisionCost from '@deepseek-ai/dsh-decision-cost'

const ctx = new Context()
await ctx.plugin(SessionStore)
await ctx.plugin(SessionProjectionRegistry)
await ctx.plugin(DecisionCost)
```

### 读取该值

`milestoneCost` 的值是一个 `Readonly<Record<MilestoneRowId, number | null>>`。它经由共享的投影载体到达——`ctx.sessionProjections.snapshot(session).values.milestoneCost`、变更推送，以及客户端读取路径（`session.projections` / `projectionsBySession`）——与所有带 wire 块的投影所使用的载体相同。按行读取时，座位侧按 `useProjection('milestoneCost', value => value?.[rowId])` 获取。

键的语义是精确的：

- **不在映射中的行**，按构造即为本会话不拥有的行——即兄弟注册表（其他会话）的里程碑。渲染层显示 `cost.unavailable`，绝不显示 `'—'` 也绝不显示零。
- **值为数字的键**，是该里程碑区间已提交的令牌用量。
- **值为 `null` 的键**，是真实的值：该里程碑的区间没有记录任何用量，因此没有可用的数字。
- **决策行**（`D<n>`）不会出现在任何会话事件中，也绝不会进入映射；由座位侧的行类别判别来把它渲染为 `'—'`。

### 依赖边（已命名）

本包折叠来自 `@deepseek-ai/dsh-project-register` 的 item-8 `project/milestone` 事件（由它提供 `MilestoneRowId` 与 `SessionEventMap` 扩展），并折叠与 token-meter 相同的用量记录，因此它在 `@deepseek-ai/dsh-project-register` 与 `@deepseek-ai/dsh-token-meter` 上各带一条 devDependency 与 tsconfig 引用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`src/projection.ts` 导出 `milestoneCostProjectionDefinition`——符合 session-projection 契约的纯、同步、JSON 状态折叠。该折叠逐事件维护一个已提交令牌总量（一组 `TokenUsage` 所汇报的各计费桶之和），并对每一里程碑边界记录该里程碑开启其区间之前已提交的总量。某里程碑的数值是其自身边界与下一个里程碑边界之间的差值（对于尚在进行的区间，则是与实时总量之差），从而把用量归入其所在的区间，与合并规则完全一致。未携带 `usage` 记录的 `assistant/message` 事件不会改动折叠与运行总量；`project/milestone` 事件则闭合前一里程碑的区间并开启一个新的区间。

在视图可读之前，折叠会把本会话每一个自有里程碑键急切地写成 `number` 或 `null`，因此缺席的键永远意味着本会话不拥有的行。

-----

<a id="further-exploration"></a>
## 进一步探索

- [session-projection](../session-projection/README.zh.md)——本包注册所经由的接缝。
- [project-register](../../workspace/project-register/README.zh.md)——`project/milestone` 事件与 `MilestoneRowId`。
- [token-meter](../../llm/token-meter/README.zh.md)——同样的用量流及其 `TokenUsage` 记录。
- [ui-decisions](../../client/ui-decisions/README.zh.md)——Cost 单元格所在的注册表座位。

-----

<a id="model-experience"></a>
## 模型体验

没有模型输入或输出的变化。该折叠只读取持久化的事件日志；其任何数值都不会进入模型请求。该数值是从已提交用量推导出的令牌计数——是展示用的估算值，而非价格——并且刻意不展示给模型。

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办工作

- 该数值是**令牌计数**，而非货币金额；token-meter 刻意不给出精确计价，因此这里不做任何成本换算。
- 用量按已提交的轮次归因；仍在流式输出的轮次尚未汇报，因此最新里程碑的数值会随轮次提交不断增长，在会话活跃期间绝不构成最终声明。
- 本投影只读取本会话自身的里程碑。兄弟注册表的里程碑行不带数值（它们不在映射中，渲染为 `cost.unavailable`）。

-----

<a id="dev-note"></a>
## 开发备注

目标读者：扩展该投影的维护者。该单元是纯 JSON 状态折叠；`apply` 与 `view` 都不是异步的，且状态必须保持可被 JSON 缓存（不得使用 `Date`、`Map`、类实例）。一旦序列化状态字段或折叠语义发生变化，就应当递增 `stateVersion`，以便持久化的 `(sessionId, key, ver, seq, val)` 缓存行被丢弃而不是被向前应用。当值未变化时，`view` 必须复用同一引用（`Object.is` 门控变更推送）；折叠本身已经对每一个忽略的事件返回相同的状态引用。