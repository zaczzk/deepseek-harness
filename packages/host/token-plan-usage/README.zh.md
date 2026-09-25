---
description: "用保存的控制台会话轮询提供方的 Token Plan 用量报告，并把最新的用量窗口提供给浏览器指示器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-token-plan-usage

[English](README.md) | 中文

## 摘要

本宿主插件拥有用量指示器不应看到的提供方会话。它用保存的会话 cookie 轮询控制台的 Token Plan 用量端点，把报告 `data.monthUsage.items` 中的月度配额行解析为一个月度用量窗口，并在组合的 connection 信任护栏之后于 `/dsh/token-plan/usage` 提供最新的已报告窗口。cookie 不离开宿主，也从不写入日志；不再携带控制台计数的报告会被拒绝（日志只记录其字段名），此前的窗口继续提供。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 Web 组合中与浏览器指示器并列挂载：

```yaml
- name: '@deepseek-ai/dsh-host-token-plan-usage'
  config:
    sessionEnv: DSH_TOKEN_PLAN_SESSION
```

### 配置

`origin` 是提供 `/api/v1/tokenPlan/usage` 的控制台来源。`session` 保存控制台会话 cookie 值，`sessionEnv` 指定 `session` 为空时读取的宿主环境变量名（优先使用它，避免密钥进入配置文件）。`pollIntervalMs` 与 `timeoutMs` 约束轮询。没有已保存会话时读取器保持空闲，路由不报告任何额度。

### 读懂数字

路由以 `GET` 返回 `{ "limits": [...] }`：控制台的月度套餐配额记为 `period: 'month'`，携带 `usedTokens`、`limitTokens` 与可选的 `resetsAt`。提供方不报告的周期直接缺席。携带凭证的请求从不跟随重定向。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

本节解释读取器背后的设计；可观察行为已完整覆盖于[使用本包](#use-this-package)。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 函数插件：配置、轮询循环与信任护栏下的路由 |
| [`src/usage.ts`](src/usage.ts) | 纯报告解析与失败诊断 |
| [`src/shared.ts`](src/shared.ts) | 与浏览器指示器共享的路由路径与 wire payload 类型 |

轮询循环只保留一份路由原样提供的引用，因此每次状态变化都落在同一个提交点上。解析是完备的：不带控制台计数的 body 返回 null，而不是残缺窗口。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Token meter 子系统](../../../docs/subsystems/token-meter.zh.md) — 指示器与这些额度并列展示的会话侧用量数字。
- [`ui-usage`](../../client/ui-usage/README.zh.md) — 消费该路由的浏览器指示器。

-----

<a id="model-experience"></a>
## 模型体验

无，因为读取器是宿主管道；这里没有任何内容到达模型请求。

#### KV 缓存影响

无；本包既不组装也不代表模型发送提供方请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **一个提供方，一个窗口** — 读取器只解析控制台的 Token Plan 报告；那里不存在周窗口，网关的响应头也不报告用量上限，因此这些行保持隐藏。
- **计数 schema 钉在控制台的实时报告上** — `data.monthUsage.items` 中的 `month_total_token` 行携带 `used`/`limit`；漂移的报告记为缺席，日志只记录字段名，直到重新定向解析器。

**Runtime invariant:** 不发布 companion。轮询循环与其路由共享同一份在单一提交点发布的引用，connection 护栏与“解析或拒绝”规则由本包的 Loader 组合规格验证。