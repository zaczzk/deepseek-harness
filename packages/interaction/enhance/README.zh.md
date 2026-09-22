---
description: "面向 /enhance 命令的确定性提示词转任务结构化：经校验的规则集配置、请求解析与模板包渲染，全程无模型调用。"
kind: "package-library"
---

# @deepseek-ai/dsh-enhance

[English](README.md) | 中文

## 概述

使用 `dsh-enhance`，你可以把粗略草稿一次性确定性地转换为结构化任务包——目标、约束、验收标准，以及可选的 goal 与 todo 草稿——全程无模型调用。`dsh-command-enhance` 用它支撑 `/enhance`，任何 Host 或 Client 插件也可以调用同样的函数来渲染或预览包。从 `resolveEnhance` 与 `renderEnhance` 入手。一切都派生自经校验的 `.dsh/enhance.yml` 规则集，因此你的原则会原样出现在每个包中，无密钥测试也能断言精确输出。

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

### 何时使用

当调用方需要按已存原则重构草稿文本并获得可复现的输出时使用本库：例如 `/enhance` 命令、composer 预览，或为后续模型阶段准备的无密钥测试替身。当任务需要发明验收标准或仓库上下文时不要使用——本包只结构化草稿与规则集已携带的内容。

### 入口

```ts
import { renderBundleText, renderEnhance, resolveEnhance, validateEnhanceConfig } from '@deepseek-ai/dsh-enhance'

const config = validateEnhanceConfig({
  principles: [{ id: 'modularity', text: 'Prefer modular components.' }],
  skipPatterns: [],
  limits: { minDraftCharacters: 10, foldBelowCharacters: 30, splitAboveCharacters: 200, maxExamples: 2 },
  depths: { task: ['objective', 'acceptance'] },
  defaultDepth: 'task',
  outputLanguage: 'auto',
})
const request = { draft: 'Add a settings page with save and cancel buttons.' }
const spec = resolveEnhance(request, config)
const text = renderBundleText(renderEnhance(request, spec, config))
```

成功会产出冻结的 `EnhanceBundle` 及其纯文本投影；`text` 以 `Objective:` 开头，并为草稿的每个句子列出一个 `- [ ]` 验收复选框。`validateEnhanceConfig` 会抛出 `EnhanceError`，一次性列出每一条被违反的规则集规则；`resolveEnhance` 对空白草稿和未声明的深度抛出 `EnhanceError`；其他失败都不会变成 `EnhanceError`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

一个显式解析步骤为一个模板渲染器供给输入；每个函数都是纯函数，本包不携带任何运行时依赖。

流水线：`validateEnhanceConfig` 在配置边界解析规则集，把所有违反收集进一个 `EnhanceError`，并以 `u` 标志编译跳过模式。`resolveEnhance` 只用本地信号分类草稿（先匹配跳过模式，再看三个长度阈值），并解析该深度的小节、改写方向与正文语言。`renderEnhance` 按规范顺序派生各小节，`renderBundleText` 以本地化的 `en`/`zh` 标题投影它们。

| 文件 | 职责 |
|---|---|
| [`src/types.ts`](src/types.ts) | 请求、spec、包与规则集配置的词汇 |
| [`src/config.ts`](src/config.ts) | 规则集校验与 `validateSections`，即包的校验边界 |
| [`src/resolve.ts`](src/resolve.ts) | `resolve(request): Spec`——路由、深度、小节、改写方向、正文语言 |
| [`src/template.ts`](src/template.ts) | 模板包渲染及其纯文本投影 |

小节词汇是封闭的：`objective`、`context`、`constraints`、`acceptance`、`verification`、`doneLooksLike`、`goal`、`todos`。约束行针对已配置的原则 id 使用引用语法 `[principle:<id>] <text>`；`validateSections` 拒绝无引用的行与空白条目，`dropUncitedLines` 丢弃改进输出中无引用的行，每个已配置的示例在加载时也要通过同一边界。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当库级约定不够用时阅读以下页面。

- [`dsh-command-enhance`](../command-enhance/README.zh.md)——为聊天 UI 挂载本流水线的 `/enhance` 命令。
- [命令包](../commands/README.zh.md)——斜杠命令背后的注册表与分发约定。
- [命令子系统参考](../../../docs/subsystems/commands.zh.md)——命令词汇、生命周期事件与服务行为。

-----

<a id="model-experience"></a>
## 模型体验

无。本库不执行模型请求，也不组装模型上下文；渲染出的包只有在用户把该文本作为普通输入提交时才对模型可见。

#### KV Cache 影响

直接 token 影响为零：本包不触碰任何请求，因此不可能让可复用前缀失效。把渲染出的包作为用户输入提交的消费方，对该次提交的缓存行为负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本库何时不合适；它们是当前包约束。

- **仅结构性标准**——验收标准与 todo 种子是目标的按句拆分；模板不发明验收内容，因此任务专属标准需要模型精炼阶段。
- **封闭的小节词汇**——八个小节 id 是固定的；自定义小节会在校验边界被 `validateSections` 拒绝。
- **无仓库上下文**——包只携带草稿与规则集；工作树或历史上下文需要单独的提供方阶段。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文，明确不具权威性；已交付行为以上文与包代码为准。

- **模型精炼阶段，形状尚未决定**——对模板输出的可选精炼是后续变更；其 schema 校验与修复规则随该变更落地。
- **按工作区解析规则集，尚未决定**——规则集值由调用方提供；从工作区服务派生它们是一个开放方向。

</details>
