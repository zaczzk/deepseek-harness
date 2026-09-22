---
description: "面向交互式组合的 /enhance 命令：如何挂载、规则集文件配置什么，以及结构化输出包含什么。"
kind: "package-reference"
---

# @deepseek-ai/dsh-command-enhance

[English](README.md) | 中文

## 概述

`dsh-command-enhance` 为聊天 UI 添加 `/enhance` 命令：给出一份草稿，你就能获得结构化任务——目标、取自你原则的约束、验收标准，以及在 `bundle` 深度下的 goal 与 todo 草稿——全程无模型调用，也不产生任何模型可见输出。规则集存放在随仓库一起做版本管理的 `.dsh/enhance.yml` 文件中，因此每个包都原样引用你自己的原则。一行路由提示会标记可能已经足够清晰、或值得拆分的草稿。挂载命令注册表与本插件；只在两次重载之间编辑规则集文件。

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

在把任何内容发送给 agent（智能体）之前想要稳健的任务形式时，带一份草稿输入 `/enhance`。

### 何时选择

当组合具备 `ctx.commands`，且使用者希望在无模型成本的情况下按已存原则结构化草稿时选择本插件。当需要发明验收标准、仓库上下文或 composer 行内改写时不要使用——那些需要后续的精炼与 composer 阶段。

### 使用命令

| 输入 | 结果 |
|---|---|
| `/enhance <draft>` | 按已配置的默认深度输出结构化包。 |
| `/enhance [task] <draft>` | 同一草稿按 `task` 深度输出（仅该深度声明的小节）。 |
| `/enhance [wip] fix the build` | `[wip]` 保持草稿文本：带方括号的词元只有在点名已声明的深度时才选择深度。 |
| 无草稿的 `/enhance` | `Usage: /enhance [<depth>] <draft> (depths: task, spec, bundle)`——深度列表随你的规则集文件。 |

正文标题跟随草稿语言（`en` 或 `zh`）；界面消息与其他命令一样保持英文。非默认的路由预测会前缀恰好一行提示，例如 `Route: fold (fold-below-characters) — consider folding this into the current goal instead of starting new work.`。每个深度的正文都以其 `verification` 小节中包自有的行 `Confirm every acceptance criterion is satisfied before reporting completion.`（中文构建渲染 `报告完成前确认每条验收标准均已满足。`）结束。

### 最小配置

挂载命令注册表与本插件：

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-enhance
  name: '@deepseek-ai/dsh-command-enhance'
  config:
    enhanceFile: '.dsh/enhance.yml'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enhanceFile` | `required` | 规则集文件的路径；相对路径在插件加载时相对进程工作目录解析。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-command-enhance)是每个受支持字段的穷尽式真源。规则集文件本身在加载时校验，并带着每一处被违反的规则大声失败；这份起步形式覆盖每个字段：

```yaml
principles:
  - id: modularity
    text: Prefer modular components over monoliths.
  - id: minimal-tech-debt
    text: Prefer maintained dependencies over hand-rolling.
skipPatterns:
  - '^ping$'
limits:
  minDraftCharacters: 10
  foldBelowCharacters: 30
  splitAboveCharacters: 200
  maxExamples: 2
depths:
  task: [objective, acceptance]
  spec: [objective, context, constraints, acceptance, verification]
  bundle: [objective, context, constraints, acceptance, verification, goal, todos]
defaultDepth: spec
outputLanguage: auto
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本插件只负责加载与分发；所有转换都由 `@deepseek-ai/dsh-enhance` 拥有。

加载：`apply` 同步读取 `enhanceFile`，将其解析为 YAML，并用 `validateEnhanceConfig` 校验；文件缺失、YAML 无效或规则被违反都会抛出 `EnhanceError`，指明路径与每一处违反，因此损坏的规则集会让组合在加载时失败。

分发：处理器解析可选的前导方括号深度，解析请求，渲染包，并作为 `CommandResult` 文本返回。带方括号的词元只有在点名已声明的深度时才选择深度，因此 `[WIP] fix the build` 这类草稿绝不会被误读。处理器不执行模型调用，也不向模型发送任何内容；执行器记录普通的仅日志事件对 `command/run` / `command/done`。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：规则集加载、`/enhance` 注册、语法、路由提示 |

不发布运行时不变式伴生入口：本适配器不拥有任何状态或事件流，命令注册表拥有注册与分发生命周期。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当命令级约定不够用时阅读以下页面。

- [`dsh-enhance`](../enhance/README.zh.md)——命令背后的确定性流水线与规则集校验。
- [命令包](../commands/README.zh.md)——聊天命令背后的注册表与分发约定。
- [命令子系统参考](../../../docs/subsystems/commands.zh.md)——命令词汇、生命周期事件与服务行为。

-----

<a id="model-experience"></a>
## 模型体验

无。该命令不执行模型调用，也不贡献任何模型上下文；结构化文本只有在用户把它作为普通输入提交时才对模型可见，命令生命周期保持仅日志。

#### KV Cache 影响

直接 token 影响为零：命令不触碰任何请求，因此不可能让可复用前缀失效。把渲染出的包作为用户输入提交的人，对该次提交的缓存行为负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明该命令何时不合适；它们是当前包约束。

- **每进程一个规则集**——`enhanceFile` 在插件加载时相对进程工作目录解析，因此多工作区宿主共享同一规则集，直到按工作区解析落地。
- **仅文本输出**——命令不能创建 goal、todo 或 composer 草稿；你需要通过普通的、由人类作主的路径自行应用结构化文本。
- **编辑规则集需要重载**——规则集文件只在插件加载时读取一次；编辑后请重载组合。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文，明确不具权威性；已交付行为以上文与包代码为准。

- **Composer 集成，后续阶段**——带接受／撤销 diff 的行内 Enhance 控件通过 composer 扩展点复用本流水线；其设计随该变更落地。
- **Goal 与 todo 发射，后续阶段**——通过 goal 与 todo seam 发射包草稿仍由人类作主；发射设计随该变更落地。

</details>
