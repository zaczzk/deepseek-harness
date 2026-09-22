/** Execute the scenario's `/enhance` lines through the composed command registry. */
export const name = 'snapshot-command-producer'
export const inject = ['commands']

const LINES = [
  '/enhance Add a settings page with save and cancel buttons.',
  '/enhance',
]

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - Composed runtime services.
 */
export function apply(ctx) {
  // `agent/created` listeners settle before session creation responds, so both
  // command lifecycles are durable before the harness's first script step ends.
  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.parentSession !== undefined) return
    const signal = new AbortController().signal
    for (const line of LINES) {
      const executed = await ctx.commands.execute(agent, line, [], signal)
      if (executed === undefined) throw new Error(`snapshot command producer: ${line} did not resolve`)
    }
  })
}
