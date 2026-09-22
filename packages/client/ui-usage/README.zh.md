---
description: "Web 会话标题栏的安静式会话与项目代币用量指示器，显示计费路由与提供方报告的额度百分比。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage

[English](README.md) | 中文

## 摘要

用量指示器是会话标题栏工具行中的小控件：一条按路由分段的横条配以紧凑的会话代币总量，点开面板可看会话与项目总量、提供方报告的周与月额度百分比，以及本会话的计费提供方/模型路由（当前模型高亮）。会话尚未产生计费时不渲染任何内容，没有来源报告用量窗口时不渲染额度行。所有数字都读取宿主计算的投影（`tokenUsageByModel`、`tokenUsage`、`modelSelection`）与共享的会话、工作区列表；本包不拥有任何计量，也不添加任何模型可见面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

当 Web 组合需要在不打开回合面板的情况下展示代币消耗时，挂载本插件。它通过 `slots.inject` 注册一条 `conversation.session.header.utilities` 条目（`id: 'usage'`），与标题栏的其他工具并列加载，并随自身 fiber 卸载。

### 读懂数字

会话总量对 `tokenUsageByModel` 的路由行求和（助手结算与 compaction 摘要调用）。项目总量对当前会话所属工作区的每个会话求和，其他会话取会话列表携带的缓存投影值。额度行是提供方报告窗口的整数百分比，仅横条封顶显示；没有归属声明的路由使用共享的 `unknown` 文案。

### 组合

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-host-token-plan-usage'
- name: '@deepseek-ai/dsh-client-ui-usage'
```

指示器依赖 token-meter 投影与会话、工作区、文案座位；宿主读取器提供已报告的用量窗口。它没有配置项，也不提供任何服务。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

本节解释指示器背后的设计；可观察行为已完整覆盖于[使用本包](#use-this-package)。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 浏览器插件：文案字典、空额度来源、标题栏注册 |
| [`src/client/UsageIndicator.tsx`](src/client/UsageIndicator.tsx) | 表现层：标题栏胶囊与点开面板 |
| [`src/client/usage.ts`](src/client/usage.ts) | 纯函数的范围总量与额度百分比 |
| [`src/client/limits.ts`](src/client/limits.ts) | 宿主用量路由的 wire 读取器 |
| [`src/client/format.ts`](src/client/format.ts) | 基于共享数字模板的紧凑代币格式化 |
| [`src/client/contract.ts`](src/client/contract.ts) | `UsageLimit` 与注入的额度读取器 |

总量是框架 hook 快照上的纯函数（`useMemo`）；组件不持有任何订阅机制。面板是锚定在胶囊下方的 portal，由外部点击或 Escape 关闭。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

当包级契约不够用时阅读这些页面。

- [Token meter 子系统](../../../docs/subsystems/token-meter.zh.md) — 这些数字所依托的投影。
- [Slots 参考](../../../docs/subsystems/slots.zh.md) — 标题栏工具座位与 `slots.inject`。
- [Web Client 架构](../../../docs/subsystems/web-client.zh.md) — 指示器读取的标准座位。

-----

<a id="model-experience"></a>
## 模型体验

无，因为指示器是浏览器 chrome；这里没有任何内容到达模型。

#### KV 缓存影响

无；本包既不组装也不发送提供方请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定指示器的边界与后续工作的起点。它们是当前包约束，不是通用用量核算对比或任务清单。

- **额度行需要有报告来源** — 周与月额度行只由 `UsageInjected.loadLimits` 渲染，它读取 [`dsh-host-token-plan-usage`](../../host/token-plan-usage/README.zh.md)；该读取器在当前提供方上只报告一个月度窗口、没有周窗口，因此周行保持隐藏。
- **项目总量是缓存下界** — 缺少缓存投影值（或不在会话列表中）的会话行不贡献任何量，缓存行在下次检查点之前落后于实时 fold。
- **会话总量指计费的助手与 compaction 流量** — `tokenUsageByModel` 折叠助手结算与 `compaction/summary` 调用，因此比 `tokenUsage` 多出摘要调用的用量。

**Runtime invariant:** 不发布 companion。所有显示数字都派生自宿主拥有的投影与列表，指示器自身不持有状态，其唯一一次 slot 注册的销毁由 HMR-safety 规格验证。
