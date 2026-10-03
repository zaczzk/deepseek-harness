---
description: "主机端与客户端会话查询控制：将 session-query 域的精确逻辑会话读取、重放、过滤与追踪，经生成的 Remote 命名空间镜像到浏览器，不持有任何查询状态。"
kind: "package-reference"
---
# 会话查询控制器（Session Query Controller）

[English](README.md) | 中文

## 摘要

`@deepseek-ai/dsh-api-session-query-controller` 拥有主机端 `ctx.sessionQueryController` 服务及生成的客户端 `ctx.remote.sessionQueries` 命名空间。其四个 Remote 方法是 `ctx.sessionQuery` 读取的精确透传：`listSessions` 返回完整的逻辑语料（最新在前，含实时/持久化标记），`readSession` 将某一逻辑会话经重放校验后的原始事件日志投影到有界的 JSON 线协议信封，`filterEvents` 对某一会话的第一方事件文档应用 AND 元数据与字面文本谓词，`traceSession` 返回某一会话的已知祖先与后代。每个方法都会把域的带类型 `SessionQueryError.code` 翻译为 `session-query/<kebab>` 形式的 Remote 错误码，使浏览器端渲染与主机端相同的失败故事。该控制器是覆盖域包的薄接缝——它既不持有查询状态也不负责鉴权，session-query 域仍是语料读取、重放校验与调用方参数围栏的唯一所有者。客户端半区安装 `ctx.sessionQueries`（`ISessionQueries`）透传服务，供比较面板发起列表/读取/过滤/追踪。

## 目录

- [使用此包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

主机端控制器需要 `ctx.sessionQuery` 域服务与 Typert 注册表，缺少二者时无法加载。`listSessions()` 返回完整的逻辑语料端点（最新在前，每个记录带实时/持久化标记）；该名册是请求/响应快照，因此 UI 通过再次读取来刷新，此侧不保留任何流状态。`readSession({ sessionId })` 在不使会话变为实时的情况下重放某一逻辑会话的完整原始事件日志：每个 `SessionEvent` 经校验的 JSON 有效负载落在有界的 `SessionQueryWireLogSnapshot` 的 `data: JsonValue` 下，`surfaceOp`、`sourceEventSeqs` 与 `ignorable` 在存在时以其原始形态透传——宽度与 `api/session-controller` 对同一来源日志所应用的相同。`filterEvents({ sessionId, filters })` 以升序 `seq` 返回匹配的语义文档。`traceSession({ sessionId })` 返回完整谱系，或第一个无法解析的父节点。

每个方法都会把域失败重新抛出到 Remote 错误通道，并保留其带类型的 `code`。以 `SESSION_QUERY_` 开头的错误码会被 kebab-cased 为 `session-query/<name>`（例如 `SESSION_QUERY_SESSION_NOT_FOUND` → `session-query/session-not-found`）；任何其他失败落到未分类的 `session-query/error` 回退。细节保持不透明——每个 Remote 错误码携带人类可读的诊断与抛出的方法名，从不携带会话内容。

客户端入口安装 `ctx.sessionQueries`（`ISessionQueries`），由 `ClientSessionQueries` 支撑。`listSessions()`、`readSession(sessionId)`、`filterEvents(sessionId, filters)` 与 `traceSession(sessionId)` 各自转发到对应的 Remote 方法并返回 Remote 结果，因此比较面板从带类型的失败码持有自己的读取生命周期与错误呈现。插件在自己的上下文有效时解析 Gateway 流工厂与 `sessionQueries` 命名空间，因为调用方在未声明 `remote.sessionQueries` 的动态上下文中发起读取。

### 配置

无。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-session-query-controller)是已接受字段及其 JSDoc 的权威来源。

-----

<a id="model-experience"></a>
## 模型体验

无，会话查询读取属于浏览器与主机端控制状态；它们不注册提示词、工具或会话事件。模型对同一语料的视图由 [`dsh-session-query`](../../session-query/session-query/README.zh.md) 提供。

#### KV 缓存影响

无直接影响；这些读取从不触及模型请求。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- 本控制器不附带调用方鉴权：域的调用方参数围栏是唯一的访问规则，任何已连接浏览器提供的会话 id 都会被原样读取。
- `readSession` 投影单个 `SessionLogSnapshot` 观察；UI 的列表与读取之间发生主机重启时，返回的是全新观察，而不是增量续读。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>面向维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 未发布额外伴侣。该控制器是 `ctx.sessionQuery` 读取的无状态投影；会话查询域持有语料、重放与这些流转发的读取契约。