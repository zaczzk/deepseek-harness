---
description: "Web GUI 的已记住审批规则界面：列出持久规则、支持添加/编辑/撤销的 Settings 区块，以及规则应答的转录行；供审批规则体验的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-approval-rules

[English](README.md) | 中文

## 概述

Web GUI 的审批规则界面展示持久记住的审批规则，供用户添加、编辑或撤销，并把每条由规则应答的工具调用渲染为一条转录行。Settings 区块持有规则名册：它读取并写入由 [approval-rules 控制器](../../api/approval-rules/README.zh.md) 镜像到 `interaction/user-approval` 包打开的持久存储之上的生成式 `approvalRuleSets` 客户端服务。规则应答转录行把 `approval/decided` 审计事件——当它携带记住规则引用时——折叠为每次应答调用一条带 key 的 `conversation.chat.node` 行，点明应答规则及其（非永久规则时的）到期时间；交互式应答（无规则）不渲染任何内容。

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

与 `ui-conversation`、`ui-chat` 及 `ui-settings` 一起挂载本插件；随后 `approval-rules` Settings 区块会出现在 Settings 区块列表中，只要会话跟踪 `approval/decided` 事件，规则应答行就会出现在聊天转录中。区块列出持久规则（名称、工具、允许/拒绝效果，以及设置有到期时的到期时间），提供“添加规则”及每行的“编辑”与“撤销”，并打开添加/编辑表单。加载中、空、读取失败、写入失败与保存后刷新等状态各自渲染带 key 的行；落地写入后的名册重新读取若失败，会在刷新错误提示下保留各行。

### 失败

写入失败会显示带 key 的 `rules.error` 行，点明失败动作（`save`/`allow`/`deny`/`revoke`）；读取失败与刷新错误行各自携带自己的“重试”；每次成功写入后都会重新读取名册，使刚写入的行立即出现。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

该插件的浏览器端注册三项随插件 fiber 一起存在（卸载时一并消失，保证 HMR 安全）的贡献：`approval-rule` Conversation Definition 及其带 key 的 `conversation.chat.node` 渲染器、`approval-rules` Settings 区块，以及合并进 UI slots `LocaleNamespaceMap` 的共享 `approval.rules` 语言包。区块由 `ApprovalRulesSectionController` 驱动，其基于 `createSnapshotStore` 的 store 拥有名册读取与添加/编辑/撤销写入路径；并发读取共享同一次读取，成功写入后重新读取列表。所有读写与 `approvalRuleSets` 客户端服务的 `list`/`save`/`revoke` 一一对应。转录 Definition 只匹配携带 `rule` 的 `approval/decided` 记录，按请求 id 为每次应答调用创建一个行，并在渲染时折叠连续的同名规则行——绝不合并事件。所有渲染字符串都是带 key 的 `approval.rules` 值；区块与转录共享该命名空间。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当审批规则界面不够用时阅读以下页面。它们从浏览器区块进入 approval-rules 控制器与持久存储。

- [dsh-api-approval-rules](../../api/approval-rules/README.zh.md)——本区块读取并写入的 Host 控制器 + 生成式 Client `approvalRuleSets` 命名空间。
- [dsh-user-approval](../../interaction/user-approval/README.zh.md)——本界面控制器所包裹的持久记住规则存储。
- [客户端包映射](../README.zh.md)——相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：转录行折叠的 `approval/decided` 审计事件由 approval-rules 控制器包裹的持久存储在记住规则应答权限请求时写入。本包自身不增加模型可见输入。

#### KV Cache 影响

无。转录行只渲染既有的 `approval/decided` 事件，不扩展历史尾部。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了当前审批规则界面。它们是当前包约束，不是审批规则对比或任务积压。

- **有效权限读数位于别处**——本包拥有规则名册（列表、添加/编辑、撤销）与应答行转录；有效权限/沙箱读数归另一个 seat 包。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。区块控制器状态与转录投影的折叠状态由插件自身的 store/Definition 持有，所有释放已由 HMR（热模块替换）安全性用例证明——不存在需要断言的独立运行时关系。
