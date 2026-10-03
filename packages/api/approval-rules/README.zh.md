---
description: "主机端与客户端审批规则控制：将持久化记忆规则存储的列出、保存与撤销，经生成的 approvalRuleSets Remote 命名空间镜像到浏览器，不持有任何授权生命周期。"
kind: "package-reference"
---
# 审批规则控制器（Approval Rules Controller）

[English](README.md) | 中文

## 摘要

`@deepseek-ai/dsh-api-approval-rules` 拥有主机端 `ctx.approvalRuleController` 服务及生成的客户端 `ctx.remote.approvalRuleSets` 命名空间。其三个 Remote 方法是 `interaction/user-approval` 包所打开的持久化记忆规则存储的精确透传：`list` 返回未过期的规则行（按名称排序），`save` 创建或替换一条规则（并通过存储的单开领域原子地写清理任何现已过期的规则）并返回该行渲染与撤销目标所引用的品牌化 id，`revoke` 按该品牌化 id 删除一条规则并报告其是否存在。每个方法都会把存储的非类型化失败映射到单一稳定的 `approval-rules/error` Remote 错误码（携带失败的方法名作为上下文），使设置面板渲染一个统一的失败故事。该控制器是覆盖持久化存储的薄接缝——它既不负责授权判定也不负责审计轨迹；user-approval 仍是二者的唯一所有者。客户端半区安装 `ctx.approvalRuleSets`（`IApprovalRuleSets`）透传服务，供设置面板发起列出/保存/撤销。

## 目录

- [使用此包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

主机端控制器需要持久化记忆规则存储服务 `ctx.approvalRules` 与 Typert 注册表，缺少二者时无法加载。`list()` 返回当前（未过期）记忆规则行（按名称排序）；该名册是请求/响应快照，因此 UI 在写入后通过再次读取来刷新，此侧不保留任何流状态。`save({ record })` 存储规则字段（名称、工具、效果、可选过期时间）并返回品牌化规则 id，并在同一次原子存储开启中写清理任何现已过期的规则。`revoke({ id })` 按品牌化 id 删除一条规则，并返回具有该 id 的规则之前是否存在且已被删除。

每个方法都会把存储失败重新抛出到 Remote 错误通道。存储抛出非类型化错误（例如 `approvalRules store is not open`），因此控制器把它们映射到单一稳定的 `approval-rules/error` Remote 错误码，并将失败的方法名作为不透明诊断上下文——从不携带规则内容。

客户端入口安装 `ctx.approvalRuleSets`（`IApprovalRuleSets`），由 `ClientApprovalRuleSets` 支撑。`list()`、`save(record)` 与 `revoke(id)` 各自转发到对应的 Remote 方法并返回 Remote 结果，因此设置面板从带类型的失败码持有自己的读取生命周期与错误呈现。插件在自己的上下文有效时解析 Gateway 流工厂与 `approvalRuleSets` 命名空间，因为调用方在未声明 `remote.approvalRuleSets` 的动态上下文中发起读取。

### 配置

无。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-approval-rules)是已接受字段及其 JSDoc 的权威来源。

-----

<a id="model-experience"></a>
## 模型体验

无，审批规则管理属于浏览器与主机端控制状态；它不注册提示词、工具或会话事件。user-approval 包仍是模型对审批的视图所依赖的规则判定与审计轨迹的唯一所有者。

#### KV 缓存影响

无直接影响；这些读取与写入从不触及模型请求。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- 本控制器不附带调用方鉴权：user-approval 存储是唯一的访问规则，任何已连接浏览器提供的规则都会被原样存储。
- 该名册是请求/响应快照；UI 的列表与后续保存或撤销之间发生主机重启时，返回的是全新观察，而不是增量续写。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>面向维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 未发布额外伴侣。该控制器是 `ctx.approvalRules` 存储读取与写入的无状态投影；user-approval 包持有持久化存储、授权判定与这些方法转发的审计轨迹。