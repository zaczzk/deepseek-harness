---
description: "Web 会话标题栏的安静式会话与项目代币用量指示器，显示计费路由与提供方报告的额度百分比。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage

[English](README.md) | 中文

## 概述

用量指示器是会话标题栏工具行中的小控件：一条按路由分段的横条配以紧凑的会话代币总量，并在来源报告时于旁显示 15 分钟延迟平均值与月额度百分比（`▮▮ 8.7K tok · 1.2s · 34%`）；点开面板依次列出会话与项目总量、延迟窗口、已报告的额度、补偿额度、套餐与重置行，以及本会话的计费提供方/模型路由（当前模型高亮）。会话尚未产生计费时不渲染任何内容，宿主路由未报告之前不渲染提供方行。所有数字都读取宿主计算的投影（`tokenUsageByModel`、`tokenUsage`、`modelSelection`）与共享的会话、工作区列表，提供方数字来自读取器的路由报告（`limits` 窗口、`plan?`、`credits?`、`state`）；本包不拥有任何计量，也不添加任何模型可见面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 Web 组合需要在不打开回合面板的情况下展示代币消耗时，挂载本插件。它通过 `slots.inject` 注册一条 `conversation.session.header.utilities` 条目（`id: 'usage'`），与标题栏的其他工具并列加载，并随自身 fiber 卸载。

### 读懂数字

面板按固定顺序列出各行——`Session`、`Project`、`Latency 15m`、`Latency 1h`、`Month`、`Compensation`、`Plan`、`Resets`——随后是本会话的计费提供方/模型路由（当前模型高亮）。会话总量对 `tokenUsageByModel` 的路由行求和（助手结算与 compaction 摘要调用）。项目总量对当前会话所属工作区的每个会话求和，其他会话取会话列表携带的缓存投影值。

延迟行对当前模型的 `modelLatency` 样本在最近 15 分钟与 1 小时窗口求平均——只有真实发生的调用参与，因此空闲的模型既不显示数字、也不稀释结果——并在窗口内样本达到 5 个后于平均值旁追加最近秩 p95（`1.2s · p95 3.1s`）；不足 5 个样本时该行只显示平均值。胶囊最多携带三个数字：会话总量、15 分钟平均值与月额度的整数百分比（`▮▮ 8.7K tok · 1.2s · 34%`），最后一个仅在报告月度窗口时出现。

额度行是带整数百分比的横条（仅横条封顶），补偿额度显示已报告额度的紧凑代币数（`2.4K tok`），套餐显示订阅套餐名（`Pro`），重置显示套餐的重置月日，并在读取器报告数字时附上燃烧跑道（`10-22 · ≈12d`，否则只有 `10-22`）。数据缺失时对应行隐藏——没有套餐或补偿额度报告、p95 不足 5 个样本——控制台会话过期时（`state: 'expired'`）所有提供方行保持暗显。没有归属声明的路由使用共享的 `unknown` 文案。

### 组合

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-host-token-plan-usage'
- name: '@deepseek-ai/dsh-client-ui-usage'
```

指示器依赖 token-meter 投影与会话、工作区、文案座位；宿主读取器提供提供方行所渲染的用量报告（`limits` 窗口、`plan?`、`credits?`、`state`）。它没有配置项，也不提供任何服务。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

本节解释指示器背后的设计；可观察行为已完整覆盖于[使用本包](#use-this-package)。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 浏览器插件：文案字典与标题栏注册 |
| [`src/client/UsageIndicator.tsx`](src/client/UsageIndicator.tsx) | 表现层：标题栏胶囊与点开面板 |
| [`src/client/usage.ts`](src/client/usage.ts) | 纯函数的范围总量、额度百分比与延迟分位数 |
| [`src/client/limits.ts`](src/client/limits.ts) | 宿主用量路由的 wire 读取器 |
| [`src/client/format.ts`](src/client/format.ts) | 紧凑代币、延迟配对、重置与跑道格式化 |
| [`src/client/contract.ts`](src/client/contract.ts) | `UsageLimit`、`UsageReport` 与注入的报告读取器 |

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
- **燃烧跑道需要持续观测** — 读取器在内存中记录当前周期首次见到的用量，只有在 6 小时成功轮询且速率为正之后才报告 `≈{days}d` 数字；宿主重启或套餐周期变更会重置观测，闸门重新武装后数字才会回来。
- **套餐日期遵循提供方的日历** — `daysUntilReset` 以 `Asia/Shanghai`（控制台按北京时间渲染套餐日期）把朴素的周期结束时间与宿主时钟比较，浏览器只切出 `MM-DD`；其他提供方日历在一个时区常量下保持内部一致。

**Runtime invariant:** 不发布 companion。所有显示数字都派生自宿主拥有的投影与列表，指示器自身不持有状态，其唯一一次 slot 注册的销毁由 HMR-safety 规格验证。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作语境 — 点击展开</summary>

本开发备注是非权威的工作语境：给维护者的笔记与未决问题。已交付行为与采纳的理由在上文、包代码与链接的 Agent Notes 中。

- 延迟窗口在显示时对持久样本时间戳求平均，因此折叠不需要时钟、回放保持确定。提供方报告周窗口后，面板才会出现该行。

</details>
