# Session artifacts: session-header token-usage meter

English | [中文](README.zh.md)

Everything staged for the upstream pull request that `zaczzk` cannot open on
`deepseek-ai/deepseek-harness` (GraphQL `CreatePullRequest` denied, REST 404,
no SSH key). A maintainer with rights can land `zaczzk:feat/usage-meter` using
[pr-body.md](pr-body.md) unchanged; the change itself is already merged here.

## Contents

| File | Role |
|---|---|
| [pr-body.md](pr-body.md) | Pull-request body: what, demo embed, evidence, label requests |
| [capture-notes.md](capture-notes.md) | GIF provenance: tree, transport, mode flags, encoding |
| [boot.ps1](boot.ps1) | Boots one real `dsh web` server from the recorded tree |

The Playwright capture and probe scripts stay local under `.playwright-mcp/gif-run/`, with the raw video and QA frames.

## Where the demonstration lives

- Demo GIF: `usage-meter-assets` branch of `zaczzk/deepseek-harness`
  (`usage-meter-demo.gif`, 1,222,749 bytes, sha256 `5B38A68073B2342F9E09A715697E086384C91DF6FA87814623A4B3EEC7890C0C`)
- Demonstrated commit: `3879f10b1975a762fc1c4089c53ef6b9d3261141`
- Raw video and QA frames stay local under `.playwright-mcp/gif-run/`
