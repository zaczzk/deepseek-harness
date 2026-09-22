# 用 `dsh run` 派发工作

English | [中文](dsh-run.md)

`dsh run` 是 DeepSeek Harness 的无界面控制接口：一条命令把一个编码任务跑到结束，并向 stdout 写出恰好一个 JSON 结果对象，让编排器可以无人值守地派发工作，并在不依赖人工、截图或正则的前提下解析结果。用它把一个仓库和一个任务交给 agent，即可获得 outcome、会话 id、成本、token 用量、轮次数与变更文件列表，并依赖真实的测试前推送门禁和默认清理的租约式工作树。

## 开始之前

- 一套 `dsh` 安装：本仓库检出（`pnpm dsh ...`）或已构建的 `dsh` 可执行文件。
- 已配置的模型路由与凭据（参见 [providers](./providers.zh.md)）。
- Git；当你需要工作树隔离、交付或推送时，`--cwd` 必须指向一个 git 仓库。

## 派发一个任务

```sh
dsh run --cwd ../repo --task-file work.json --output json
```

任务文本来自 `--task`、来自 `--task-file`（UTF-8 文件），或在两者都未给出时来自 stdin。stdout 只承载结果对象；所有进度与诊断写入 stderr。

### 标志集

| 标志 | 默认 | 含义 |
|---|---|---|
| `--cwd <dir>` | 当前目录 | 任务工作的目标工作区 |
| `--task <text>` | — | 任务文本；与 `--task-file` 互斥 |
| `--task-file <path>` | stdin | 从 UTF-8 文件读取任务文本 |
| `--session-id <id>` | 新的 `session-<uuid>` | 继续该会话；重新挂接被中断运行的工作树租约 |
| `--timeout <duration>` | 不设上限 | 整次运行的挂钟上限，例如 `90s`、`15m`、`2h` |
| `--output <json\|jsonl>` | `json` | 一个结果对象，或以结果为最后一行的 JSONL 事件流 |
| `--worktree` / `--no-worktree` | `--cwd` 为 git 仓库时用工作树 | 租用隔离工作树，或就地工作 |
| `--no-cleanup` | 默认清理 | 保留运行工作树与分支而不删除 |
| `--push` | 关闭 | 测试门禁通过后推送到 `origin/<target-branch>` |
| `--target-branch <name>` | 当前检出分支 | 合并与推送的目标分支 |
| `--test-cmd <command>` | 自动发现 | 门禁使用的项目测试命令 |
| `--price-in-usd-per-mtok <n>` | — | 声明的输入价格（美元/百万 token），用于 `cost_usd` |
| `--price-out-usd-per-mtok <n>` | — | 声明的输出价格（美元/百万 token），用于 `cost_usd` |
| `--patch <path>` | — | agent profile 的额外补丁覆盖（可重复） |
| `--abort <session-id>` | — | 释放被中断运行的工作树租约后退出 |

## 读取结果

stdout 上一行 JSON，永远恰好一个可解析对象——包括失败与用法错误时。

```json
{"schema":"dsh-run/1","outcome":"success","error":null,"session_id":"session-6f1d…","resumed":false,"turns":3,"usage":{"input_tokens":4120,"output_tokens":815,"reasoning_tokens":null,"cache_read_tokens":null,"cache_write_tokens":null,"total_tokens":null},"usage_complete":true,"cost_usd":0.024635,"answer":"…","files_changed":["src/parser.ts","tests/parser.spec.ts"],"uncommitted":[],"tests":{"status":"passed","command":"pnpm run test","exit_code":0},"push":{"requested":true,"pushed":true,"reason":null},"worktree":{"created":true,"path":"…/.git/dsh-scratch/runs/run-…/worktree","branch":"dsh-run/run-…","cleaned":true},"started_at":"2026-09-22T12:00:00.000Z","duration_ms":95241,"exit_code":0}
```

| 字段 | 含义 |
|---|---|
| `outcome` | `success`、`failure`、`timeout` 或 `interrupted` |
| `error` | 成功时为 `null`，否则为 `{code, message}`，指明失败项 |
| `session_id` | 可恢复的会话，或在未启动会话时为 `null` |
| `run_id` | 运行租约标识；`--abort` 可用它代替会话 id |
| `resumed` | `--session-id` 是否继续了既有会话 |
| `turns` | 观察到的模型轮次；流未报告时为 `null` |
| `usage` | 汇总的已报告 token 计数；无用量报告时为 `null` |
| `usage_complete` | 当任一计费尝试省略用量时为 `false`，此时 `usage` 可能少报 |
| `cost_usd` | 按调用方声明价格计算的成本；未声明价格时为 `null` |
| `answer` | 最终助手文本，或 `null` |
| `files_changed` | 运行触碰的仓库相对路径；非 git 仓库外为 `null` |
| `uncommitted` | 运行结束时仍未提交的路径 |
| `tests` | 门禁报告：`status`（`passed`/`failed`/`unavailable`/`absent`/`not-run`）、`command`、`exit_code` |
| `push` | `requested`、`pushed`，以及未推送时的封闭 `reason` 取值集 |
| `worktree` | `created`、`path`、`branch`、`cleaned` |
| `started_at`、`duration_ms`、`exit_code` | 时间信息与对应的进程退出码 |

未知值一律为 `null`，绝不使用可能被读成通过的取值：`tests.status` 区分 `absent`、`unavailable`、`not-run` 与 `passed`。

## 退出码

| 码 | 含义 | 调用方动作 |
|---|---|---|
| 0 | 成功（使用 `--push` 时门禁通过且推送完成） | 继续 |
| 1 | agent 运行了但轮次未完成 | 读取 `error.code` |
| 2 | 调用无效；未运行任何步骤 | 修正调用 |
| 3 | 无法启动（引导、凭据、不可用的 `--session-id`、工作树租约） | 修正环境 |
| 4 | 测试命令运行且失败；未推送任何内容 | 修正代码 |
| 5 | 测试命令无法运行，或在 `--push` 下未声明；未推送任何内容 | 修正工具链 |
| 6 | 测试通过但交付失败（提交、合并或推送） | 检查 `error.message` |
| 7 | 提供方限流 | 稍后重试 |
| 124 | 超时到期；工作树租约被保留 | 用 `--session-id` 恢复 |
| 130 | 被中断（SIGINT/SIGTERM）；工作树租约被保留 | 用 `--session-id` 恢复 |

## 中断、超时与恢复

结束的运行——无论成败——默认都清理其工作树，包括失败时。被中断或超时的运行保留其工作树租约，并把状态记录在 `<git-common-dir>/dsh-scratch/runs/` 下，因为恢复要求会话记录的工作目录仍然存在；结果对象会写明 `cleaned: false` 并给出会话号。

```sh
dsh run --cwd ../repo --session-id session-6f1d… --task "continue where you were" --output json
```

恢复的运行重新挂接同一工作树与分支并继续同一会话；结束时执行正常的清理。若要丢弃保留的租约，请显式释放：

```sh
dsh run --cwd ../repo --abort session-6f1d… --output json
```

## 仓库卫生

在工作树隔离下（git `--cwd` 的默认行为），运行在 `<git-common-dir>/dsh-scratch/runs/<run-id>/worktree` 的 `dsh-run/<run-id>` 分支上工作，只提交它改动的具名路径（绝不 `git add -A`），合并进 `--target-branch`，并在退出前删除工作树与分支。唯一有文档的暂存位置是 `<git-common-dir>/dsh-scratch/`；已释放的运行不在该处留下任何残留。在删除任何工作树之前，运行器会先解除其中全部 junction 与符号链接：Windows 的递归删除会顺着 junction 进入目标，缺少这一步的删除曾在真实机器上清空过真实目录。

## 测试前推送门禁

门禁运行项目自己的测试命令——原样使用 `--test-cmd`，或通过被固定的包管理器运行 `package.json` 的 `test` 脚本——并且只信任其进程退出码。`--push` 绝不会在门禁通过前发生；无法运行的命令报告 `unavailable`（退出 5），未声明的命令报告 `absent`，因此守卫绝不会静默空转。

## 可运行示例

[examples/dsh-run-dispatch/dispatch.py](../../../examples/dsh-run-dispatch/dispatch.py) 是编排器可直接调用的单个脚本；它解析结果、打印一行摘要、保存对象并原样透传退出码：

```text
dispatch: success | session=session-6f1d… | exit=0 | tests=passed | pushed=True | files=2 | turns=3
```

原始验收记录——真实派发、被程序解析的结果、强制失败、卫生证据、恢复与用量数字——见 [examples/dsh-run-dispatch/acceptance-transcript.md](../../../examples/dsh-run-dispatch/acceptance-transcript.md)。

## 设计形态与先例

该形态是带一个 stdout JSON 结果的一次性子命令（Claude Code `claude -p --output-format json` 的契约：单个结构化结果携带会话 id、成本、用量与轮次），外加 `--output jsonl` 背后的 JSONL 事件流（Pi `--mode json` 的按行 JSON 事件）。进度与思考写入 stderr，而面向机器的结果独占 stdout（Codex `exec` 的分流），由编排器拥有其派生的进程生命周期（ACP 的宿主启动 agent 形态）。拒绝了服务器形态：OpenCode 的 `serve` 适合联网的多轮客户端，但这是单机派发，能卡死的常驻守护进程是负担；也拒绝了自定义协议，因为 stdio 上的按行 JSON 已满足全部要求。
