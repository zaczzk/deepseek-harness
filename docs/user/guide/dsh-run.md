# Dispatch work with `dsh run`

English | [中文](dsh-run.zh.md)

`dsh run` is the headless control interface for the DeepSeek Harness: one command runs one coding task to completion and writes exactly one JSON result object to stdout, so an orchestrator can dispatch work unattended and parse the outcome without a human, a screenshot, or a regex. Use it to hand the agent a repository and a task, get back outcome, session id, cost, token usage, turn count, and files changed, and rely on a real test-before-push gate and leased worktrees that clean up by default.

## Before you start

- A `dsh` installation: this repository checkout (`pnpm dsh ...`) or a built `dsh` bin.
- A configured model route and credential (see [providers](./providers.md)).
- Git, and a git repository as `--cwd` when you want worktree isolation, delivery, or push.

## Dispatch one task

```sh
dsh run --cwd ../repo --task-file work.json --output json
```

The task text comes from `--task`, from `--task-file` (a UTF-8 file), or from stdin when neither is given. stdout carries only the result object; all progress and diagnostics go to stderr.

### Flag set

| Flag | Default | Meaning |
|---|---|---|
| `--cwd <dir>` | current directory | target workspace the task works in |
| `--task <text>` | — | task text; mutually exclusive with `--task-file` |
| `--task-file <path>` | stdin | read the task text from a UTF-8 file |
| `--session-id <id>` | fresh `session-<uuid>` | continue this session; reattaches the interrupted run's worktree lease |
| `--timeout <duration>` | unbounded | wall-clock bound for the run, such as `90s`, `15m`, `2h` |
| `--output <json\|jsonl>` | `json` | one result object, or a JSONL event stream whose last line is the result |
| `--worktree` / `--no-worktree` | worktree when `--cwd` is a git repository | lease an isolated worktree, or work in place |
| `--no-cleanup` | cleanup on | keep the run worktree and branch instead of removing them |
| `--push` | off | push to `origin/<target-branch>` after the test gate passes |
| `--target-branch <name>` | checked-out branch | branch to merge into and push |
| `--test-cmd <command>` | discovered | the project's test command for the gate |
| `--price-in-usd-per-mtok <n>` | — | declared input price in USD per million tokens, for `cost_usd` |
| `--price-out-usd-per-mtok <n>` | — | declared output price in USD per million tokens, for `cost_usd` |
| `--patch <path>` | — | extra patch overlay for the agent profile (repeatable) |
| `--abort <session-id>` | — | release the worktree lease of an interrupted run and exit |

## Read the result

One line of JSON on stdout, always exactly one parseable object — including on failure and on usage errors.

```json
{"schema":"dsh-run/1","outcome":"success","error":null,"session_id":"session-6f1d…","resumed":false,"turns":3,"usage":{"input_tokens":4120,"output_tokens":815,"reasoning_tokens":null,"cache_read_tokens":null,"cache_write_tokens":null,"total_tokens":null},"usage_complete":true,"cost_usd":0.024635,"answer":"…","files_changed":["src/parser.ts","tests/parser.spec.ts"],"uncommitted":[],"tests":{"status":"passed","command":"pnpm run test","exit_code":0},"push":{"requested":true,"pushed":true,"reason":null},"worktree":{"created":true,"path":"…/.git/dsh-scratch/runs/run-…/worktree","branch":"dsh-run/run-…","cleaned":true},"started_at":"2026-09-22T12:00:00.000Z","duration_ms":95241,"exit_code":0}
```

| Field | Meaning |
|---|---|
| `outcome` | `success`, `failure`, `timeout`, or `interrupted` |
| `error` | `null` on success, else `{code, message}` naming what failed |
| `session_id` | the session to resume, or `null` when no session started |
| `run_id` | the run lease identity; `--abort` accepts it in place of the session id |
| `resumed` | whether `--session-id` continued an existing session |
| `turns` | model turns observed, or `null` when the stream reported none |
| `usage` | summed reported token counts, or `null` when nothing reported usage |
| `usage_complete` | `false` when any billed attempt omitted usage, so `usage` may under-report |
| `cost_usd` | cost at caller-declared prices, or `null` when no prices were declared |
| `answer` | final assistant text, or `null` |
| `files_changed` | repository-relative paths the run touched, or `null` outside a git repository |
| `uncommitted` | paths left uncommitted at the end of the run |
| `tests` | gate report: `status` (`passed`/`failed`/`unavailable`/`absent`/`not-run`), `command`, `exit_code` |
| `push` | `requested`, `pushed`, and the closed `reason` set when nothing was pushed |
| `worktree` | `created`, `path`, `branch`, `cleaned` |
| `started_at`, `duration_ms`, `exit_code` | timing and the matching process exit code |

Unknown values are `null`, never a value that could read as a pass: `tests.status` distinguishes `absent`, `unavailable`, and `not-run` from `passed`.

## Exit codes

| Code | Meaning | Caller action |
|---|---|---|
| 0 | success (and, with `--push`, gate passed and push completed) | continue |
| 1 | the agent ran but the turn did not complete | read `error.code` |
| 2 | invalid invocation; nothing ran | fix the invocation |
| 3 | could not start (boot, credential, unusable `--session-id`, worktree lease) | fix the environment |
| 4 | the test command ran and failed; nothing was pushed | fix the code |
| 5 | the test command could not run or is undeclared with `--push`; nothing was pushed | fix the toolchain |
| 6 | tests passed but delivery failed (commit, merge, or push) | inspect `error.message` |
| 7 | provider rate limit | retry later |
| 124 | timeout expired; the worktree lease is kept | `--session-id` resumes |
| 130 | interrupted (SIGINT/SIGTERM); the worktree lease is kept | `--session-id` resumes |

## Interruption, timeout, and resume

A finished run — success or failure — cleans up its worktree by default, including on failure. An interrupted or timed-out run keeps its worktree lease and records its state under `<git-common-dir>/dsh-scratch/runs/`, because a resume needs the session's recorded working directory to still exist; the result object says `cleaned: false` and names the session.

```sh
dsh run --cwd ../repo --session-id session-6f1d… --task "continue where you were" --output json
```

The resumed run reattaches the same worktree and branch and continues the same session; when it finishes, the normal cleanup runs. To discard a kept lease instead, release it explicitly:

```sh
dsh run --cwd ../repo --abort session-6f1d… --output json
```

## Repository hygiene

With worktree isolation (the default for a git `--cwd`), the run works in `<git-common-dir>/dsh-scratch/runs/<run-id>/worktree` on branch `dsh-run/<run-id>`, commits exactly the named paths it changed (never `git add -A`), merges into `--target-branch`, and removes the worktree and branch before exit. The single documented scratch location is `<git-common-dir>/dsh-scratch/`; a released run leaves none of it behind. Before any worktree removal the runner unlinks every junction and symlink inside it: Windows recursive deletion follows junctions into their targets, and a removal without that step has deleted real directories on real machines.

## The test-before-push gate

The gate runs the project's own test command — `--test-cmd` verbatim, or `package.json`'s `test` script through the pinned package manager — and trusts only its process exit code. `--push` never happens without a passing gate; a command that cannot run reports `unavailable` (exit 5) and an undeclared command reports `absent`, so the guard can never silently no-op.

## Runnable example

[examples/dsh-run-dispatch/dispatch.py](../../../examples/dsh-run-dispatch/dispatch.py) is a single script an orchestrator can call; it parses the result, prints one summary line, saves the object, and mirrors the exit code:

```text
dispatch: success | session=session-6f1d… | exit=0 | tests=passed | pushed=True | files=2 | turns=3
```

The raw acceptance transcript — real dispatch, parsed result, forced failure, hygiene evidence, resume, and usage figures — is [examples/dsh-run-dispatch/acceptance-transcript.md](../../../examples/dsh-run-dispatch/acceptance-transcript.md).

## Design shape and precedent

The shape is a one-shot subcommand with one JSON result on stdout (Claude Code's `claude -p --output-format json` contract: a single structured result carrying session id, cost, usage, and turns) plus a JSONL event stream behind `--output jsonl` (Pi's `--mode json` line-delimited events). Progress and thinking go to stderr while the machine-facing result owns stdout (Codex `exec`'s split), and the orchestrator owns the process lifecycle it spawns (ACP's host-launches-agent shape). A server was rejected: OpenCode's `serve` fits multi-turn networked clients, but this is a single-machine dispatch where a daemon that can wedge is a liability, and a bespoke protocol was rejected because line-delimited JSON over stdio already answers every requirement.
