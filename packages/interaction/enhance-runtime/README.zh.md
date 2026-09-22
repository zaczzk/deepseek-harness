---
description: "基于确定性提示词转任务流水线的 enhance 预览服务：规则集加载、预览 Remote face，以及无模型的瞬时预览约定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-enhance-runtime

[English](README.md) | 中文

## 概述

`dsh-enhance-runtime` 一次请求给出一次结构化草稿改写：给 `ctx.enhance.preview()` 一个草稿，你会拿回其任务形式的分类事实、结构化小节与渲染文本。composer 的 Enhance 按钮与 `/enhance` 命令族经 Typert Remote face 访问它，因此浏览器代码从不导入流水线或规则集。规则集（你的原则、黄金示例、阈值）在插件加载时从 `.dsh/enhance.yml` 载入，无效时大声失败。预览不执行模型调用，也不写会话事件，因此除一次确定性处理外没有任何成本。

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

把它挂载到命令注册表旁的 Host 组合中；Remote face 会自动为每个 Client 装配提供服务。

### 何时选择

当某个接口需要确定性的草稿改写时选择本服务——composer 预览、命令处理器，或以后的模型精炼阶段。当改写必须触达模型时不要使用：这里的预览是无模型的，被接受的文本只有在用户把它作为普通消息发送时才到达模型。

### 最小配置

```yaml
- id: enhance-runtime
  name: '@deepseek-ai/dsh-enhance-runtime'
  config:
    enhanceFile: '.dsh/enhance.yml'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enhanceFile` | `required` | 规则集文件路径；相对路径在插件加载时相对进程工作目录解析。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-enhance-runtime)是每个可接受字段的穷尽式真源。

### 预览请求

一次调用分类并结构化一个草稿：

```ts
const result = await enhance.preview({ draft, depth: 'bundle', direction: 'enhance' })
```

成功会返回路由预测（`enhance`、`skip`、`split`、`fold`）及其命中的规则、解析出的深度与语言、结构化小节与渲染文本。空白草稿或未声明的深度会以来自 `@deepseek-ai/dsh-enhance` 的 `EnhanceError` 拒绝。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本服务只做加载与分发：所有转换都由 `@deepseek-ai/dsh-enhance` 拥有。

加载同步读取 `enhanceFile`，按 YAML 解析，并用 `validateEnhanceConfig` 校验；文件缺失、YAML 无效或规则被违反都会抛出 `EnhanceError`，点名路径与每一处违反，因此损坏的规则集会让组合在加载时失败。分发通过 `resolveEnhance` 解析请求、通过 `renderEnhance` 渲染、通过 `renderBundleText` 投影，三者都是纯函数。

`preview` 方法带有 `@Remote` 标记，Typert 构建步骤会生成 `./typert` 与 `./remote` 两个 face：Host 组合自动发现该绑定，Client 装配则 `$mount` 生成的 Remote contribution。wire 类型位于 `./types`，因此生成的编解码器直接引用它们，而不必翻查入口。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务入口：规则集加载、`preview` Remote 方法 |
| [`src/types.ts`](src/types.ts) | 预览请求与结果的 wire 词汇 |

不发布运行时不变式伴随条目：本服务不拥有可发散的观察对——纯流水线的测试覆盖转换，组合测试套件覆盖加载与分发。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当服务级约定不够用时阅读以下页面。

- [`dsh-enhance`](../../interaction/enhance/README.zh.md)——确定性流水线、规则集校验与包词汇。
- [`dsh-command-enhance`](../../interaction/command-enhance/README.zh.md)——同一套流水线上的 `/enhance` 命令。
- [命令包](../commands/README.zh.md)——各接口共享的注册表与分发约定。

-----

<a id="model-experience"></a>
## 模型体验

无。本服务不执行模型调用，也不追加任何会话事件；渲染文本只有在用户把它作为普通消息发送时才对模型可见。

#### KV Cache 影响

直接 token 影响为零：本服务不触碰任何请求，因此不可能让可复用前缀失效。把渲染文本作为用户输入提交的用户，对该次提交的缓存行为负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本服务何时不合适；它们是当前包约束。

- **每进程一个规则集**——`enhanceFile` 在插件加载时相对进程工作目录解析，因此多工作区宿主共享一个规则集，直到按工作区解析落地。
- **仅模板阶段**——模型精炼阶段及其失败阶梯是这条流水线之上的后续阶段；在那之前预览仅产出结构性改写。
- **`/enhance` 保留自己的规则集加载**——命令插件加载同一种文件结构，直到某次统一切片把它迁到本服务上。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文，明确不具权威性；已交付行为以上文与包代码为准。

- **精炼器位置，形状已定**——模型精炼作为模板阶段之后的一个可选阶段扩展本服务的预览流水线；见关于 Remote 预览与模板优先流水线的 Agent Note。
- **限定范围的 Typert 生成**——整工作区的 tsdown 生成在部分主机上不稳定；对显式包子集调用 `WorkspaceTypertGenerator.generate()` 会生成相同的 face。

</details>
