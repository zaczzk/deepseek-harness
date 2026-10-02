---
description: "Web GUI 的里程碑转录节点：把一条已提交的 project/milestone 会话事件渲染为 conversation.chat.node 键控行；供里程碑转录投影的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-milestone

[English](README.md) | 中文

## 概述

里程碑转录节点把每条已提交的 `project/milestone` 会话事件（含 `M<n>` id、标题与图表证据的注册行）渲染为当前 Session 转录中的一条键控 `conversation.chat.node` 行。它键控于第 8 项的持久事件而非 `todo/write`，因此无需客户端的 host `milestoneMarker` Config 副本；由其他 Session 的注册行产生的里程碑绝不出现在此转录中，也不渲染占位符——跨 Session 里程碑的不可用标注意由注册行（第 9 项界面）承担。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

与 `ui-conversation`、`ui-chat` 及 project-register 领域包一起挂载本插件。它注册一个 `ConversationNodeDefinition`（kind 为 `milestone`）、一个键控 `conversation.chat.node` 渲染器，以及 `milestone` locale 命名空间。每条已提交的里程碑渲染为一行标题（`node.title`，逐字插入事件的 `id` 与 `title`），旁侧带图表标记：存在的 `DiagramMark` 时，标记可见文本经键控 `mark.*` 词汇解析（`mark.updated`、`mark.stale`、`mark.absent`），`diagram` 为 `null` 时渲染 `mark.none`。可访问名称是 `node.mark`，`node.markTooltip` 是仅针对非 null 情况的 tooltip 与 aria 描述；`null` 图表不带 tooltip。

### 失败

投影只从本 Session 自己已提交的里程碑事件渲染。事件被追加到其他 Session 的里程碑绝不出现在这里，也不显示占位符；把此类数字标注为不可用的是注册行界面。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

默认导出的 `milestoneDefinition` 是一个 `ConversationNodeDefinition<MilestoneState>`，其 `match(event)` 在 `event.type === 'project/milestone'` 时返回 `{ id, role: 'start' }`，否则返回 `null`。`start` 读取 `id`、`title`、`diagram` 与事件的 `seq`；`update` 恒等（一个事件、一个 Node、一行），`buildViewNode` 在状态缺失时返回 `null`，否则返回以里程碑 id 为 key、`anchorSeq: seq - 0.1` 的 Chat Node。`MilestoneView` 组件被 memo 化；它通过 `t('node.title', { id, title })` 插值标题，并通过同一 `milestone` 命名空间解析标记标签与 tooltip，因此每个渲染字符串都是键控字典值。注册随插件 fiber 生命周期执行，卸载插件即移除 Definition、键控渲染器与字典（HMR 安全）。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当里程碑节点不够用时阅读以下页面。它们从转录行进入 project-register 领域与它所填充的 slot。

- [dsh-project-register](../../workspace/project-register/README.zh.md)——拥有 `project/milestone` 事件与注册行的领域包。
- [ui-conversation](../ui-conversation/README.zh.md)——声明 Conversation Definition 注册表并拥有组装逻辑。
- [ui-chat](../ui-chat/README.zh.md)——声明本包填充的键控 `conversation.chat.node` slot。
- [客户端包映射](../README.zh.md)——相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## 模型体验

无。本包只渲染 project-register 领域已发出的一条会话事件；它不增加任何模型可见输入、提示或工具界面。

#### KV Cache 影响

无——该节点只读取已提交的持久会话事件，不执行任何影响缓存的操作。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了当前里程碑节点。它们是当前包约束，不是 project-register 对比或任务积压。

- **仅 Session 本地数据源**——行只从本 Session 自己已提交的里程碑事件渲染；由其他 Session 的注册行产生的里程碑按设计绝不出现在这里（那是注册行界面）。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。只有一处键控 `conversation.chat.node` 注册，其释放已由 HMR 安全性用例证明——投影是对已提交会话事件的纯 Conversation Definition，因此没有独立不变式界面需要观察可能发散的关系。