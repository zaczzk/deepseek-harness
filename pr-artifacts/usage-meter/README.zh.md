# 会话产出物：会话标题栏代币用量指示器

[English](README.md) | 中文

这里保存为上游拉取请求准备的全部材料。`zaczzk` 目前无法在
`deepseek-ai/deepseek-harness` 上创建该请求（GraphQL `CreatePullRequest` 被拒、
REST 404、无 SSH 密钥）；具备权限的维护者可原样使用 [pr-body.md](pr-body.md)
落地 `zaczzk:feat/usage-meter`，改动本身已合入本仓库。

## 目录

| 文件 | 职责 |
|---|---|
| [pr-body.md](pr-body.md) | 拉取请求正文：改动内容、演示嵌入、证据、标签申请 |
| [capture-notes.md](capture-notes.md) | GIF 溯源：树、传输、模式参数、编码 |
| [boot.ps1](boot.ps1) | 从被录制的树启动一台真实 `dsh web` 服务器 |

Playwright 捕获与探测脚本连同原始视频、QA 帧保留在本地 `.playwright-mcp/gif-run/` 下。

## 演示存放位置

- 演示 GIF：`zaczzk/deepseek-harness` 的 `usage-meter-assets` 分支
  （`usage-meter-demo.gif`，1,222,749 字节，sha256 `5B38A68073B2342F9E09A715697E086384C91DF6FA87814623A4B3EEC7890C0C`）
- 演示提交：`3879f10b1975a762fc1c4089c53ef6b9d3261141`
- 原始视频与 QA 帧保留在本地 `.playwright-mcp/gif-run/` 下
