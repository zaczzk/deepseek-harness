## What

Top-right **token-usage meter** in the Session header, plus the accounting behind it.

- **Meter** (`@deepseek-ai/dsh-client-ui-usage`): compact per-route bar + session token total; click opens Session total, Project total (all sessions in the workspace), per-route rows with the selected model marked, and Week/Month limit percentages that render **only when a source reports them**.
- **Per-route accounting** (`token-meter`: `tokenUsageByModel`): durable projection folding assistant settlements and `compaction/summary` calls per billed provider/model route; rows reconcile with `tokenUsage` plus the summarizer calls.
- **Limits reader** (`@deepseek-ai/dsh-host-token-plan-usage`): polls the provider's Token Plan report with a stored console session behind the connection trust fence (`redirect: 'error'`, cookie never leaves the Host), serves `/dsh/token-plan/usage`. No provider reports a weekly window and no gateway sends usage caps in response headers today, so those rows stay hidden until a source does.
- Bilingual READMEs (en/zh) and docs; new assembled-browser scenario `apps/web/tests/usage-meter.e2e.ts`.

## Demo

![Session-header token-usage meter: session and project totals after a real model round](https://github.com/zaczzk/deepseek-harness/blob/usage-meter-assets/usage-meter-demo.gif?raw=true)

Demonstrated commit `3879f10b1975a762fc1c4089c53ef6b9d3261141`, built and served from the `feat/usage-meter` tree of this pull request's head (`https://github.com/zaczzk/deepseek-harness`, branch `feat/usage-meter`). One real model round ran (MiMo 2.6 Pro through the application's normal credential-ref configuration, prompt "Reply with the word READY and nothing else."); the session billed 8.7K tokens and the meter's Session and Project rows show it. Capture: standalone Playwright (no browser-control workflow is available to this session) driving a cached Chromium headless build against a real `dsh web` server on 127.0.0.1:3181 with fresh scratch `DSH_HOME`/`DSH_AGENTS_HOME`; the server booted with `--patch apps/web/tests/pin-browse-picker.overlay.yml` (the repository's automation override for the native directory picker; the demonstrated flow uses the seeded workspace and never opens a picker). Encoding: 1.0–18.48s of one continuous capture at 1.5x speed, 2s final hold, 10fps, 1200px wide. No fixtures, mock transports, or synthetic events.

## Evidence

- 186 focused unit/client specs (token-meter 132, token-plan-usage 19, ui-usage 35) — all green
- per-file 100% coverage on the three touched packages
- typecheck (host and client programs) and lint green for the whole tree
- all package, README, i18n, and catalog gates green; 1093 bilingual pairs consistent
- `pnpm run build && pnpm run build:web` green

Windows-runner caveats, red before this change and outside its surface: `test:snapshot` fails on recorded-fixture normalization the repository documents as macOS/Linux-only (plus request-header tool-schema drift from upstream schema evolution — this diff touches no tool or schema file), and `test:web` cannot launch its browser on this machine (the Playwright browser build is absent from the cache). The assembled-browser behavior of this change is demonstrated by the real-server recording above and covered by `apps/web/tests/usage-meter.e2e.ts` for CI.

## Labels requested

`kind/feature` · `area/web` · `area/llm` (new durable domain: model providers, routing, and token accounting). The PR author lacks label rights on this repository, so a maintainer please applies them.
