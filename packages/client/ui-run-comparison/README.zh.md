---
description: "Web 运行对比（Run comparison）会话视图：从 session-query 名单挑选两个已持久化的 Session，并对其记录日志累计六项每次运行指标（轮次、工具调用、输入/输出 tokens、墙钟时间、失败）。"
kind: "package-reference"
---

# dsh-client-ui-run-comparison

[English](README.md) | 中文

## 概述

用本包在会话中并排比较同一会话的两次持久化运行。`run-comparison` 会话视图读取 session-query 名单，让你选择基准运行（A 侧，默认当前 Session）与对比运行（B 侧），并从每侧记录的原始事件日志累计六项指标——去重轮次、工具调用、输入 tokens、输出 tokens、墙钟时间与失败——渲染成两列表格。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本包与 `ui-conversation`、`session-query` 客户端面以及提供名单的 `session-query-controller` Remote 一同挂载到 Web 客户端名单。它注册一个 `conversation.view` 条目（`run-comparison`，顺序 40），标签走 `runComparison` 语言包。标签页通过 `sessionQueries` 客户端服务读取，因此每次名单与日志读取都解析到所寻址的 Host 控制器——浏览器端不出现任何传输细节。

A 侧在可入选时默认取当前 Session（调用者可检查其 Workspace 中已持久化的运行），因此常见的"将此运行与那次运行对比"场景只需一次选择。两个选择器都限定在调用者所属 Workspace 可检查的 Session 范围内；一个选择器绝不提供另一侧当前持有的 Session，因此两侧永远不会落到同一条日志。未持久化的运行会被提供但置为禁用，并在选择器底部显示原因。

### 配置

无。`runComparison` 命名空间的键随包自带；session-query 线上契约由 `@deepseek-ai/dsh-api-session-query-controller` 定义。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 —— 点击展开</summary>

每侧的读取都经过注入的 face，face 按提交顺序串行化请求，因此一次落定永远不会覆盖更新的请求；store 保存名单、每侧读取的生命周期以及最近一次成功的累计结果。失败的读取保留上一次成功值并显示重试；重读会以完全相同的读取目标重新发起。`foldMetrics` 防御性地读取每个事件的 JSON 有界 `data`，遇到格式错误的事件也不会抛出。

缺失规则区分计数与测量量：对已记录事件的计数在零笔时为 `0`；而测量量（tokens、墙钟时间）在其来源缺失时为 `null`——`null` 渲染语言包所属的"不可用"标签，绝不会渲染成会被误读为测量值的零。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 插件主体：语言包、store 与 `conversation.view` 注册 |
| [`src/client/RunComparisonView.tsx`](src/client/RunComparisonView.tsx) | 选择器、状态行与两列指标表格 |
| [`src/client/metrics.ts`](src/client/metrics.ts) | `foldMetrics`：对一条原始事件日志的六项每次运行指标 |
| [`src/client/face.ts`](src/client/face.ts) | 通过 session-query 客户端服务的按序名单与日志读取 |
| [`src/client/store.ts`](src/client/store.ts) | 每侧选择与日志读取的生命周期状态 |
| — | 不发布运行时不变量伴随模块；所有显示值均来自调用时的 Remote 读取。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Session query API 控制器](../../api/session-query-controller/README.zh.md) —— 名单与日志读取背后的 `sessionQueries` Host+Client 服务。
- [Session query 领域](../../session-query/README.zh.md) —— 累计所消费的名单记录与读取语义。
- [Conversation 参考](../../../docs/subsystems/conversation.zh.md) —— 会话视图标签页如何注册与渲染。

-----

<a id="model-experience"></a>
## 模型体验

无：本包不注册工具、不贡献提示词区段、不追加会话事件。

#### KV 缓存影响

无；本包既不组装也不发送模型请求。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **限定工作区名单** —— 选择器只显示当前 Session 所属 Workspace 的 Session；该范围之外的运行不会被提供。
- **仅两侧** —— 本视图恰好对比一次基准与一次对比；三人或以上的矩阵不在范围内。
- **取自记录日志** —— 每项指标都来自记录的原始事件日志；日志中没有记录的指标（例如提供者从未上报的 token 数）显示为"不可用"而不是零。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

`foldMetrics` 的缺失规则刻意把缺失的用量记录当作 `null`（测量值），把没有工具调用的运行当作 `0`（计数）。扩展累计逻辑时请保持这一区分。指标表格 `loading` 分支与 `metricValue` 默认分支上的 `/* v8 ignore */` 存在是因为前置守卫使这些路径在组件中不可达；注释中写明了真实原因。

</details>