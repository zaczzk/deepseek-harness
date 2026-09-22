---
description: "把每个主要里程碑记为 DECISIONS.md 登记行，并携带架构图的 updated、stale 或 absent 标记；来源为新完成的里程碑待办与完成的目标；含标记配置、记录规则与失败行为。"
kind: "package-reference"
---

# dsh-project-register

[English](README.md) | 中文

## 摘要

本插件通过把每个里程碑写下来，落实"每个主要里程碑都要更新架构图"的要求。每个新完成的里程碑待办（内容以配置标记开头的条目）与每个完成的目标，都会向项目的 `DECISIONS.md` 追加一条 `milestone` 行，记录当日日期与 `done` 状态。该行的 Diagram 单格记录当时的 `ARCHITECTURE.md` Mermaid 架构图：指纹与上一个里程碑所记不同为 `updated`，自那以来未变为 `stale`，没有架构图为 `absent`。记录只作提示：任何失败都告警并丢弃该里程碑，从不阻塞被记录的工作。

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

将其挂载到任何携带 `fs` 能力的 Host 组合中：

```yaml
- name: '@deepseek-ai/dsh-project-register'
  config:
    milestoneMarker: 'milestone:'
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `milestoneMarker` | `milestone:` | 内容以该标记开头的待办条目即里程碑；其标题为去掉标记后的内容 |

每个带工作目录的顶层 Session 都会记录；subagent 来源的 Session、委派的 Session 以及没有工作目录的 Session 不记录。`todo/write` 事件记录相对此前所观察列表新完成的里程碑：条目内容（去空白后）以 `milestoneMarker` 开头（忽略大小写）且状态为 `completed` 时计数，且仅当此前观察的列表尚未完成它时才记录。`goal/changed` 完成会把该目标的 objective 记为里程碑。

每个被记录的里程碑向 Session 工作目录中的 `DECISIONS.md` 追加一行（尚无登记表的文档会补上标准标题与表格），并以同目录 `ARCHITECTURE.md` 中第一个闭合的 ` ```mermaid ` 代码块为依据填写 Diagram 单格：文件或代码块缺失为 `absent`，否则为 `<flag>@<fingerprint>`——指纹与上一个里程碑行所记不同为 `updated`，相同为 `stale`。行标识取下一个未使用的 `M<n>`，绝不复用已有标识。同一工作目录的两个里程碑不会交错写入；读写失败会记录一条 `project-register:` 告警并丢弃该里程碑，而不阻塞被记录的工作。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 —— 点击展开</summary>

里程碑识别是纯逻辑，在事件监听器中同步执行。每个 `todo/write` 事件与按 Session 保存的上一份全量列表快照做差：那里已经完成的条目绝不再记录，那里不存在的条目计为未完成。目标完成直接提供其 objective。识别出的标题排入每个工作目录一条的 promise 链，因此一个工作目录的登记严格串行执行读-追加-写周期；每个周期在调用时重读 `ARCHITECTURE.md` 与 `DECISIONS.md`，因此记录的标记反映里程碑落定时的文件，而非检测时的文件。上一里程碑行的 Diagram 指纹决定 `stale` 还是 `updated`；`nextRegisterId` 扫描原始表格，绝不复用已有标识。监听器由 effect 持有；除按 Session 的待办快照与追加链外插件不持其他状态，追加链会自行收敛。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件装配：事件监听、Session 资格、按工作目录的追加链与文件读取 |
| [`src/record.ts`](src/record.ts) | 纯里程碑逻辑：新完成里程碑识别、图标记、日期与登记行铸造 |

**运行时不变量：** 不发布运行时不变量伴随模块。每条记录都派生自调用时的会话事件与文件读取，没有任何独立观察能与登记表分叉。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [项目登记语法](../../util/project-register/README.zh.md) —— 本插件写入所用的 `DECISIONS.md` 表格语法、Mermaid 提取与指纹。
- [Goal 服务](../../goal/goal/README.zh.md) —— 其完成会记录里程碑的目标生命周期。
- [Todo 工具](../../todo/tool-todo/README.zh.md) —— 其标记条目会成为里程碑的待办列表。

<a id="model-experience"></a>
## 模型体验

无：本包不注册工具、不贡献提示词区段、不追加会话事件；它只向工作区的 `DECISIONS.md` 追加行。

#### KV 缓存影响

无。这里没有任何内容进入模型请求，因此提供商缓存复用不受影响。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- 恢复的 Session 首次观察到的待办列表不记录任何内容：里程碑只在观察到状态跃迁时记录，因此在本 Host 进程观察到该 Session 之前完成的里程碑不会被记录。
- 只有 `ARCHITECTURE.md` 中第一个闭合且非空的 ` ```mermaid ` 代码块计为架构图；后续代码块对记录的标记不可见。
- 写入失败会以 `project-register:` 告警丢弃该里程碑且不重试，`DECISIONS.md` 因此没有它的行。
- 重复的已完成条目按去空白内容识别：改写措辞后再次完成的待办会记录第二条里程碑行。
- 架构图指纹只检测内容变化，绝不证明身份。

<a id="dev-note"></a>
### 维护者笔记

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

无。

</details>
