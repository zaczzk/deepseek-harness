---
description: "composer 的 Enhance 控件：一个安静的按钮，以及带接受／撤销、锚定在 enhance Remote seam 上的改写预览。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-enhance

[English](README.md) | 中文

## 概述

`dsh-client-ui-enhance` 为 composer 添加一个 Enhance 控件：按下它，一个锚定的弹出层就会把你的草稿重构为任务——目标、约束、验收标准——并以可审阅的变更行 hunk 呈现。接受会以一次原子替换写入改写结果；Dismiss、Escape 或任何中断都会让你的草稿保持逐字节一致。全部文案由 locale（en/zh）持有，控件只是一个安静的图标，预览运行在 Host 侧的 enhance Remote 上——无模型调用、零成本。

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

本插件作为 Web 应用浏览器端名单中的一个 `dsh.client` 条目挂载；按钮出现在 composer 控件行，弹出层出现在 composer 的浮层锚位。

### 何时选择

选择本插件为用户在行内改写未发送的草稿。在纯自动化组合中不要使用：它是 enhance Remote 之上的浏览器呈现，没有无头接口。

### 使用控件

| 操作 | 结果 |
|---|---|
| 按下 Enhance 按钮 | 弹出层打开，并请求一次当前草稿的预览。 |
| 接受 | 草稿以一次原子写入被替换，焦点回到 composer。 |
| Dismiss / Escape / 外部交互 | 弹出层关闭，草稿逐字节保持不动。 |

等待与失败状态不携带任何说明文案：忙碌档只显示一个图标，失败档只显示一行简短的可操作文字。

### 最小配置

```yaml
- id: ui-enhance
  name: '@deepseek-ai/dsh-client-ui-enhance'
```

该条目要求同一组合中存在 enhance Remote（`dsh-enhance-runtime`）与 conversation 输入 facade。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

两个 slot 注册共享同一个按 composer 划分的控制器，它是本包唯一伸向包外的触点。

`apply` 通过 `ctx.slots.inject` 把按钮注册进 `conversation.input.right`、把预览弹出层注册进 `conversation.input.overlay`，各自为该会话注入同一个 `EnhanceController` 句柄。控制器持有瞬时状态（一个 identity 稳定的快照存储）、一个陈旧尝试标记（迟到的响应永远不会盖过较新的响应），以及四个动词：`request` 通过 `conversation.input.for(actx).state` 读取草稿并调用 enhance Remote；`accept` 执行唯一那次原子的 `conversation.input.for(actx).setDraft(text)` 替换；`dismiss` 不写入任何内容。任一退出后 `focus()` 恢复 composer 的光标。

弹出层用受维护的 `diff` 库，针对请求时捕获的草稿渲染变更行 hunk。两个视图都是包内部的；测试直接 import 它们。

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 装配：locale 注册、两次 slot 注册、控制器接线 |
| [`src/client/enhance-controller.ts`](src/client/enhance-controller.ts) | 瞬时预览状态，以及原子 accept／逐字节一致 dismiss 的动词 |
| [`src/client/EnhanceButtonView.tsx`](src/client/EnhanceButtonView.tsx) | 安静的 composer 控件 |
| [`src/client/EnhancePreviewView.tsx`](src/client/EnhancePreviewView.tsx) | 锚定的变更行预览弹出层 |

不发布运行时不变式伴随条目：本插件只拥有呈现状态，其行为只通过注入的 Cordis 服务与 slot 跨越包边界。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当插件级约定不够用时阅读以下页面。

- [`dsh-enhance-runtime`](../../interaction/enhance-runtime/README.zh.md)——预览 Remote face 与瞬时预览约定。
- [Conversation 参考](../../../docs/subsystems/conversation.zh.md)——composer 的 slot 词汇与输入 facade。
- [Web Client 架构](../../../docs/subsystems/web-client.zh.md)——本插件遵循的 slot 与 props 纪律。

-----

<a id="model-experience"></a>
## 模型体验

无。本浏览器插件不构造模型请求，也不贡献任何模型上下文；被接受的草稿只有在用户把它作为普通消息发送时才对模型可见。

#### KV Cache 影响

直接 token 影响为零：本插件不触碰任何请求，因此不可能让可复用前缀失效。发送被接受草稿的用户，对该次提交的缓存行为负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本插件何时不合适；它们是当前包约束。

- **仅变更行 diff**——并排的响应式分栏随 composer UX 优化切片到来；本切片渲染单列变更行。
- **暂无快捷键**——composer 未暴露键盘扩展 seam，因此在它出现之前控件只能用指针操作。
- **先预览、后接受**——幽灵流式、变体环与深度菜单随流式与变体切片到来。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文，明确不具权威性；已交付行为以上文与包代码为准。

- **按 composer 划分控制器**——两次注册共享同一个句柄，无须声明存储即满足实时数据规则；只有当两个 composer 真正同时渲染时，才值得按会话拆分存储。

</details>
