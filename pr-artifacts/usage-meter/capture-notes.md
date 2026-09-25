# Capture notes: session-header token-usage meter demo

## Capture record

| Fact | Value |
|---|---|
| Demonstrated commit | `3879f10b1975a762fc1c4089c53ef6b9d3261141` |
| Tree | `feat/usage-meter` worktree at `C:\Users\zac_r\Desktop\dsh-usage-pr`, built with `pnpm run build && pnpm run build:web` |
| Origin served | `zaczzk/deepseek-harness`, branch `feat/usage-meter` (head verified equal to the demonstrated commit before publication) |
| Server | real `dsh web` from that tree, 127.0.0.1:3181, fresh scratch `DSH_HOME`/`DSH_AGENTS_HOME` |
| Transport | real provider (MiMo 2.6 Pro) through the application's normal credential-ref configuration |
| Real model round | yes — prompt `Reply with the word READY and nothing else.`, response `READY`, 8.7K tokens billed |
| Mode flags | `--no-open --port 3181 --patch apps/web/tests/pin-browse-picker.overlay.yml` (the repository's automation override for the native directory picker; the demonstrated flow uses the seeded workspace and opens no picker) |
| Browser | standalone Playwright driving a cached Chromium headless build (no browser-control workflow is available to this session) |
| Encoding | 1.0–18.48s of one continuous capture, 1.5x speed, 2s final hold, 10fps, 1200px wide, 128 colors |
| Artifact | `usage-meter-demo.gif`, 137 frames, 1,222,749 bytes, sha256 `5B38A68073B2342F9E09A715697E086384C91DF6FA87814623A4B3EEC7890C0C` (published copy verified byte-for-byte) |

## Storyboard

1. First-run notice dismissed, seeded Default workspace adopted
2. Prompt sent; one real model round runs (MiMo 2.6 Pro)
3. Header meter appears top-right: micro bar + `8.7K tok`
4. Panel opens: `Session 8.7K tok`, `Project 8.7K tok`
5. Panel closes; pill held for the final frames

No fixture queries, mock transports, synthetic event injection, or test-only
hooks were used. No secrets appear in the capture; the authenticated URL is
never rendered because browser video records page content only.
