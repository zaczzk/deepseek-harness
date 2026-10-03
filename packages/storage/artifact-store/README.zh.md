---
description: "用于主机和维护者选择保留 workspace-changes 的 SHA-1 寻址每轮整文件捕获的持久化整文件工件存储（ctx.artifactStore）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-artifact-store

[English](README.md) | 中文

## 摘要

使用此包可将 workspace-changes 的 SHA-1 寻址整文件捕获提升为按工作空间作用域的持久化存储，使重启后重新打开的对话能再次找到其早期的工件卡片。该存储通过 `ctx.storageDomain` 打开 `artifact_files` 域，并向其写入方暴露 `ctx.artifactStore`。保留受到两个经验证的 `Config` 字段约束——`maxStoreBytes`（按工作空间，写路径上的最旧轮次优先淘汰）和 `retentionDays`（按年限清理，在每次写入和启动时各运行一次）。没有定时器也没有监视器；触发点是存储自身的写路径及其激活。该主机侧状态不增加工具、提示或会话事件，因此对模型和代理循环不可见。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知局限与待办工作](#known-limitations-and-deferred-work)
- [开发者说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

当主机功能需要保留必须跨重启存在并保持有界的持久化整文件副本时，使用此包。属主包只打开一次域并持有唯一句柄；workspace-changes 记录器是第一个写入方，并通过存储服务激活，而非依赖构造顺序。

### 何时使用它

选择它用于必须比 Session 临时目录存续更久的整文件工件保留。避免用于应属于会话事件日志的数据——会话持久化接缝负责该表面。

### 打开与存储

存储服务通过注入的 storage-domain 工具打开 `artifact_files` 域。其 `store` 方法提升一个捕获侧，然后应用保留边界：

```text
await ctx.artifactStore.store({
  workspace: '/work/demo',       // canonical workspace root; retention and eviction scope
  sha1: 'abc…',                  // the SHA-1 content address workspace-changes already derives
  content: 'file bytes',         // binary content is re-encoded to round-trip a JSON medium
  bytes: 1234,                   // decoded byte length, the figure eviction accounts
  turn: 7,                       // oldest-turn-first eviction orders by it
  createdAt: new Date().toISOString(),
})
```

重启后重新打开的对话会从同一介质读取其早期的工件记录。

### 保留边界

`maxStoreBytes` 限制每个工作空间的存储总量；当一次写入使某工作空间超过其上限时，会淘汰该工作空间最旧轮次优先的捕获，直到总量回到或低于上限。`retentionDays` 依据每条捕获的 `createdAt` 清理早于该年限的记录；该轮询在每次写入和启动时各运行一次。缺失字段会使对应轮询停用。整文件副本上限复用 workspace-changes 的现有 `maxFileBytes`——捕获与存储在一条尺寸规则下保持一致——超限文件降级为声明而非导致轮次失败。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxStoreBytes` | 缺失 | 按工作空间的存储字节上限；写路径上最旧轮次优先淘汰 |
| `retentionDays` | 缺失 | 年限边界；每次写入与启动时清理早于它的记录 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-artifact-store)是每个可接受字段及其 JSDoc 的详尽来源。

### 依赖

该包基于 `storage/storage-domain` 的 `defineDomain`：它对自己的属主边采取三个带源码映射的步骤——`@deepseek-ai/dsh-storage-domain` 清单行、`../../storage/storage-domain` tsconfig 引用、锁文件导入——其写入方的激活通过 `static inject = ['storageDomain']` 声明（先例 `workspace/workspace/src/index.ts:171`）。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

该存储是一个 Cordis `Service`（`ctx.artifactStore`），在注入的 `storageDomain` 工具之上持有单一已打开的 `artifact_files` 域表。

### 设计概念

- **保留位于写路径上。** `store` 写入，然后运行年限清理，再按工作空间上限淘汰——没有定时器也没有监视器，因此每次存储轮次也同时清扫规模与年限。
- **淘汰是最旧轮次优先、按工作空间。** 同一工作空间的记录先按轮次、再按同轮次的 `createdAt` 排序，淘汰最旧者直至该工作空间存储总量回到或低于其上限。不同工作空间绝不交叉记账。
- **边界经验证，缺失即停用。** `maxStoreBytes` 和 `retentionDays` 是 schemastery 类型的 `Config` 字段；缺失字段使对应轮询停用。
- **存储不重算 `bytes` 或 `sha1`。** 它们是调用方提供的数字，域按给定值持久化；派生由写入方完成。

### 打开序列

`[Service.init]` 通过 `ctx.storageDomain.open(artifactDomainSpec)` 打开域，通过 `ctx.effect` 释放器取得其关闭的所有权，绑定 `files` 表，并在激活时运行一次年限清理。

### 源码映射

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`ArtifactStore` 服务、`ctx.artifactStore`、`Config`、保留轮询 |
| [`src/spec.ts`](src/spec.ts) | 域声明：`artifactDomainSpec`、`artifact_files` 表、`artifactRecord` 与 `ArtifactId` 类型 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当此包的视角不够时，请阅读这些页面：子系统参考是权威契约，第一个消费者记录了提升模式。

- [存储子系统](../../../docs/subsystems/storage.zh.md) — 域契约、后端契约、变更事件、生成 API。
- [存储包映射](../README.zh.md) — 该族的包及其仓库位置。
- [workspace-changes 包](../deliverables/workspace-changes/README.md) — 第一个写入方，其每轮捕获由此存储提升。

-----

<a id="model-experience"></a>
## 模型体验

### 持久化工件保留

#### 模型看到什么

什么都没有。该包不注册工具、不注入提示、不追加会话事件；它在 `ctx.artifactStore` 之后存储整文件捕获，并为每条存储记录返回一个品牌化 id。恢复的工件表面仅通过消费者自身的文档化表面到达模型。

#### 令牌影响

为零：此包没有任何文本进入模型请求。

#### KV 缓存影响

独立：域读写从不触及请求前缀，因此这里不会使提供方缓存复用失效。

## 已知局限与待办工作

<a id="known-limitations-and-deferred-work"></a>


这些局限界定了工件存储何时不适用或需要特殊的运维注意。它们是当前的包约束，不是任务积压。

- **单进程变更可见性** — 域的 `domain/changed` 事件是进程内的；在跨进程修订模式落地之前，第二个主机进程观察不到变更（[代理笔记](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)）。
- **无自动数据迁移** — 存储版本与规范不同的域在打开时拒绝（`version-mismatch`）；修改模式需要手动迁移存储数据（[storage-domain 契约](../../../docs/subsystems/storage.zh.md)）。
- **二进制内容被重新编码** — `content` 携带 UTF-8 文本或在 JSON 介质上往返的二进制字节；`bytes` 持有解码后的字节长度，淘汰以此记账。

<a id="dev-note"></a>
### 开发者说明

<details>
<summary>面向维护者的工作上下文——点击展开</summary>

无。

</details>