/**
 * Monotonic per-Session budget ceiling enforced at the owner deny.
 *
 * Registers a single `ctx.tools.guard()` that folds the Session's durable log
 * to count consumed provider usage tokens (input + output + cache-read +
 * cache-write + reasoning) and returns a model-visible deny string once that
 * sum meets or passes the configured per-Session `budgetCeiling`. The fold is
 * catch-up-on-read, mirroring `token-meter`'s `_sync`: a Session first seen at
 * the guard is replayed from seq 0, and every later call replays only the
 * un-consumed range, so the counter never fails open across a cold reopen or a
 * Host restart.
 *
 * @module @deepseek-ai/dsh-budget-ceiling
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  Session,
  SessionEvent,
  SessionLogOffset as SessionLogOffsetType,
} from '@deepseek-ai/dsh-session'
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { ToolExecution, ToolGuard } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'budget-ceiling'

/**
 * Validated per-Session consumption ceiling expressed as a flat token count.
 * Absent means no ceiling — the guard returns `undefined` for every call, and
 * the package ships in `bundle/base`, so optional-without-default keeps a
 * headless deployment that never asked for a ceiling from failing to boot.
 *
 * The ceiling counts consumed provider usage tokens (the four non-reasoning
 * buckets plus reasoning), the same accounting `token-meter` reports but made
 * the sole figure a decision is taken from.
 */
export interface Config {
  /** Reject a tool call once its Session's consumed usage tokens reach this count. */
  budgetCeiling?: number
}

export const Config: z<Config> = z.object({
  budgetCeiling: z.number(),
})

/**
 * The guard is registered on the tools service (`ctx.tools.guard`), so the
 * plugin injects `tools` — the same combination `timeout-policy` uses (its
 * `inject = ['tools']`). It injects no projection registry: the counter folds
 * the durable log through the `Session` the guard already carries and calls no
 * Remote, so nothing else is ordered against.
 */
export const inject: string[] = ['tools']

/** The stable code a denial renders; kept verbatim on the model's wire. */
export const BUDGET_CEILING_DENY = 'BUDGET_CEILING_DENY'

/** One Session's replay cursor into its durable log. */
interface ReplayState {
  consumedEvents: SessionLogOffsetType
  consumedTokens: number
}

/** Sum the four provider usage buckets plus reasoning without double-counting. */
function usageTokens(input: number, output: number, cacheRead: number, cacheWrite: number, reasoning: number): number {
  return input + output + cacheRead + cacheWrite + reasoning
}

/**
 * Render the model-visible deny string. It carries the stable deny code, the
 * configured ceiling, and the consumed figure so the user (and the model) see
 * why the call was refused and how much headroom remained at the point of
 * refusal. This is a host-authored, model-visible tool result, and model/wire
 * data is kept verbatim by rule, so it is deliberately untranslated.
 */
function denyReason(ceiling: number, consumed: number): string {
  return `${BUDGET_CEILING_DENY}: session has consumed ${consumed} usage tokens, at or above the configured ceiling of ${ceiling}.`
}

/**
 * Install the ceiling guard. Registered once per context; the guard is
 * synchronous and monotonic, evaluated after the extensible `tools/pre-execute`
 * waterfall, and a returned string denies the execution.
 *
 * @param ctx - plugin context; the guard is scoped to it and disposed with it.
 * @param config - validated {@link Config}; absent `budgetCeiling` disables the deny.
 */
export function apply(ctx: Context, config: Config): void {
  const ceiling = config.budgetCeiling
  // Absent ceiling: register an always-pass guard is unnecessary; registering
  // nothing keeps the package fully inert and bootable in a headless base.
  if (ceiling === undefined) return

  const states = new WeakMap<Session, ReplayState>()

  /** Catch one session's fold up to the current durable tail. */
  function sync(session: Session): ReplayState {
    let state = states.get(session)
    if (state === undefined) {
      state = { consumedEvents: SessionLogOffset(0), consumedTokens: 0 }
      states.set(session, state)
    }
    while (state.consumedEvents < session.seq) {
      // Contiguous session seqs index the durable log; a missing event is a
      // log-corruption case, not a normal hole.
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const event = session.eventAt(SessionSeq(state.consumedEvents))!
      foldEvent(state, event)
      state.consumedEvents = SessionLogOffset(state.consumedEvents + 1)
    }
    return state
  }

  // Eager refresh bounds ordinary read latency, but only for Sessions this
  // guard has already folded — the durable catch-up on read remains the source
  // of truth and creates no state for Sessions nothing has read.
  ctx.on('session/event', (session) => {
    if (states.has(session)) sync(session)
  })

  /** Fold one durable event's provider usage into the count. */
  function foldEvent(state: ReplayState, event: SessionEvent): void {
    if (event.type !== 'assistant/message') return
    const usage = event.data.usage
    if (usage === undefined) return
    state.consumedTokens += usageTokens(
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens ?? 0,
      usage.cacheWriteTokens ?? 0,
      usage.reasoningTokens ?? 0,
    )
  }

  const guard: ToolGuard = (execution: Readonly<ToolExecution>): string | undefined => {
    const agent = execution.agent
    // A direct `ctx.tools.execute()` caller carries no Session; no session-
    // scoped ceiling applies. Stated rather than assumed.
    if (agent === undefined) return undefined
    const state = sync(agent.session)
    return state.consumedTokens >= ceiling
      ? denyReason(ceiling, state.consumedTokens)
      : undefined
  }

  ctx.tools.guard(guard)
}
