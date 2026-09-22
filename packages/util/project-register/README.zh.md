---
description: "浏览器安全的决策登记表语法、架构图提取、图指纹与有界的工作区文本读取。"
kind: "package-library"
---

# dsh-util-project-register

[English](README.md) | 中文

## 概述

项目标签页与里程碑记录器共享的浏览器安全项目登记辅助库。本包解析与追加 `DECISIONS.md` 决策登记表（`ID | Date | Kind | Title | Status | Diagram`），从 `ARCHITECTURE.md` 提取当前 Mermaid 架构图，计算图源指纹，对照最新里程碑行推导架构图的实时状态，并通过 `workspaceFiles` Remote 一次性读取完整的 UTF-8 工作区文件。本包不含 Cordis 服务或运行时状态。

## 目录

- [登记表语法](#register-grammar)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="register-grammar"></a>
## 登记表语法

一条登记行是含六个单元格的 Markdown 表格行。`ID` 对决策为 `D<n>`，对里程碑为 `M<n>`；`Date` 为 `YYYY-MM-DD`；`Kind` 为 `decision` 或 `milestone`；`Status` 为 `proposed`、`accepted`、`superseded` 或 `done`；`Diagram` 在决策行为 `—`，在里程碑行为 `<flag>` 或 `<flag>@<fingerprint>`，其中 `flag` 取 `updated`、`stale`、`absent` 之一。`parseRegister` 按文件顺序保留格式正确的行，并跳过其他任何行，包括 kind、status 或 Diagram 单格未知的行。`nextRegisterId` 扫描原始表格行，因此已有标识不会被重新发放，即使其行格式不正确。`formatRegisterRow` 将标题截断至 200 字符、折叠空白，并把 `|` 改写为 `/`；`appendRegisterRow` 将行插入表格最后一行之后，并在文档尚无登记表时创建标准标题与表格。`diagramSource` 返回第一个闭合且非空的 ` ```mermaid ` 代码块源码。`diagramFingerprint` 是仅用于检测内容变化的 8 位十六进制 FNV-1a 哈希；`diagramFreshness` 在没有架构图时报告 `absent`，在架构图仍是里程碑记录为 stale 的那份时报告 `stale`，其余报告 `current`。

-----

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- **每份文档只取一张图** —— `diagramSource` 只读取第一个 Mermaid 代码块，后续代码块被忽略。
- **登记标题不能含 `|`** —— 格式化器改写该字符而不做转义，因此渲染出的标题与含该字符的标题不同。
- **指纹只检测变化，不证明身份** —— FNV-1a 哈希不抗碰撞，不得用于内容鉴权。
- **每次只读完整文件** —— `readWorkspaceText` 走 `readBytes`，受 Host 完整文件上限约束，不分页读取更大的文档。


<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

无。

</details>

**运行时不变量：** 不发布伴随模块。本工具不持有可变的运行时关系。
