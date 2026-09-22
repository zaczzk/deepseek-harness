---
description: "Web 决策（Decisions）会话视图：会话工作区 DECISIONS.md 的重大决策登记表及其里程碑图形状态。"
kind: "package-reference"
---

# dsh-client-ui-decisions

[English](README.md) | 中文

## 摘要

用本包在会话中直接查看工作区的重大决策登记表。`decisions` 会话视图通过 `workspaceFiles` Remote 读取 `DECISIONS.md`，按最新在前渲染其决策登记表：每个决策或里程碑一行，里程碑行的 Diagram 列显示其记录的图形状态，并标记出最新的里程碑行。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [维护者笔记](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本包与 `ui-conversation`、`workspace-files` 客户端面以及提供 `file` 提供者的 resources 插件一同挂载到 Web 客户端名单。它注册一个 `conversation.view` 条目（`decisions`，顺序 30），标签走 `decisions` 语言包。标签页的一切都从所寻址的 Session 推导：Host 将 `DECISIONS.md` 解析到该 Session 的工作区根目录，因此浏览器端无需传递根路径。

各行按最新在前（文件顺序倒序）呈现。Diagram 列显示里程碑行记录的标记——`updated`、`stale` 或 `absent`——决策行则显示 `—`。最新的里程碑行会被标记，使其记录的图形状态最先被看到。

### 配置

无。工作区文件名（`DECISIONS.md`）是通过 `@deepseek-ai/dsh-util-project-register` 与里程碑记录器共享的协议常量。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 —— 点击展开</summary>

标准 `useResource` 钩子通过 `file` 提供者给出登记表的元数据（版本），标签页自己的 store 保存它通过 `workspaceFiles.readBytes` 读取的文本。每个观测到的元数据版本只发起一次读取，因此失败的读取保持失败，直到文件再次变化；一个视图的读取按提交顺序落定。`parseRegister` 跳过格式错误的表格行而不是否决整个文档，因此一行损坏不会遮住其余各行。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 插件主体：语言包、store 与 `conversation.view` 注册 |
| [`src/client/DecisionsView.tsx`](src/client/DecisionsView.tsx) | 登记表与状态行 |
| [`src/client/store.ts`](src/client/store.ts) | 每个 Session 的登记读取状态 |
| [`src/client/face.ts`](src/client/face.ts) | 按序写入 store 的登记读取 |
| — | 不发布运行时不变量伴随模块；所有显示值均来自调用时的 Host 读取。 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [项目登记工具](../../util/project-register/README.zh.md) —— 本视图与记录器共享的登记语法与图形证据。
- [工作区文件服务](../../api/workspace-files/README.zh.md) —— `useResource<'file'>` 背后的有界读取与变更推送。
- [Conversation 参考](../../docs/subsystems/conversation.md) —— 会话视图标签页如何注册与渲染。

-----

<a id="model-experience"></a>
## 模型体验

无：本包不注册工具、不贡献提示词区段、不追加会话事件。

#### KV 缓存影响

无；本包既不组装也不发送模型请求。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **每个工作区一份登记表** —— 只读取工作区根的 `DECISIONS.md`；存放在别处的登记表不会显示。
- **登记表的说明文字留在文件中** —— 标签页渲染决策登记表；`DECISIONS.md` 表格下方的理据文字不作投影。
- **仅按文件顺序** —— 各行按文件位置最新在前显示；表格不按日期或状态排序。

<a id="dev-note"></a>
### 维护者笔记

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

无。

</details>
