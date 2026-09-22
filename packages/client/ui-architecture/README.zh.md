---
description: "Web 架构（Architecture）会话视图：会话工作区当前的 Mermaid 架构图及其里程碑图形状态。"
kind: "package-reference"
---

# dsh-client-ui-architecture

[English](README.md) | 中文

## 概述

用本包在会话中直接查看工作区当前的架构图。`architecture` 会话视图通过 `workspaceFiles` Remote 读取 `ARCHITECTURE.md`，用 Mermaid 渲染其中第一个 `mermaid` 代码块，并在文件名旁显示 `DECISIONS.md` 最新里程碑记录的图形状态。被里程碑记录为 stale 的架构图会在画布上方保留一行操作提示，直到其源码发生变化。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本包与 `ui-conversation`、`workspace-files` 客户端面以及提供 `file` 提供者的 resources 插件一同挂载到 Web 客户端名单。它注册一个 `conversation.view` 条目（`architecture`，顺序 20），标签走 `architecture` 语言包。标签页的一切都从所寻址的 Session 推导：Host 将 `ARCHITECTURE.md` 与 `DECISIONS.md` 解析到该 Session 的工作区根目录，因此浏览器端无需传递根路径。

状态徽标报告架构图的实时状态：`current`、`stale` 或 `absent`。当最新里程碑行记录为 `stale` 且架构图源码指纹仍与当时相同时，状态为 `stale`；编辑源码即清除该状态。

### 配置

无。工作区文件名（`ARCHITECTURE.md`、`DECISIONS.md`）是通过 `@deepseek-ai/dsh-util-project-register` 与里程碑记录器共享的协议常量。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 —— 点击展开</summary>

标准 `useResource` 钩子通过 `file` 提供者给出每个文档的元数据（版本），标签页自己的 store 保存它通过 `workspaceFiles.readBytes` 读取的文本，以及 Mermaid 为提取出的架构图源码渲染的 SVG。每个观测到的元数据版本只发起一次读取，因此失败的读取保持失败，直到文件再次变化；一个视图的读取与渲染按提交顺序落定。Mermaid 的浏览器打包为一个延迟加载的自包含 client chunk；`tsdown.config.ts` 在打包期间绑定它的脚本作用域全局变量。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 插件主体：语言包、store 与 `conversation.view` 注册 |
| [`src/client/ArchitectureView.tsx`](src/client/ArchitectureView.tsx) | 状态条、图画布与状态行 |
| [`src/client/store.ts`](src/client/store.ts) | 每个 Session 的文档与渲染状态 |
| [`src/client/face.ts`](src/client/face.ts) | 按序写入 store 的读取与渲染 |
| [`src/client/render-diagram.ts`](src/client/render-diagram.ts) | Mermaid 惰性加载与 SVG 渲染 |
| — | 不发布运行时不变量伴随模块；所有显示值均来自调用时的 Host 读取。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [项目登记工具](../../util/project-register/README.zh.md) —— 本视图与记录器共享的登记语法、架构图提取与指纹。
- [工作区文件服务](../../api/workspace-files/README.zh.md) —— `useResource<'file'>` 背后的有界读取与变更推送。
- [Conversation 参考](../../../docs/subsystems/conversation.zh.md) —— 会话视图标签页如何注册与渲染。

-----

<a id="model-experience"></a>
## 模型体验

无：本包不注册工具、不贡献提示词区段、不追加会话事件。

#### KV 缓存影响

无；本包既不组装也不发送模型请求。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **每份文档只渲染一张图** —— 只渲染第一个 `mermaid` 代码块，后续代码块保持隐藏。
- **Mermaid 方言跟随打包的渲染器** —— 冷门图表类型从同一打包加载其 chunk；Mermaid 无法解析的源码显示渲染失败行，而不是源码文本。
- **无平移缩放** —— SVG 缩放至画布宽度并纵向滚动。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

无。

</details>
