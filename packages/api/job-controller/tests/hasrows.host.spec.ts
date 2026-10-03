import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JobOutcome } from '@deepseek-ai/dsh-jobs'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it } from 'vitest'
import { JobController } from '../src/index.ts'

function producer() {
  let settle!: (outcome: JobOutcome) => void
  const spec = {
    kind: 'bash' as const,
    label: 'sleep 60',
    run: () => ({
      cancel: () => {},
      done: new Promise<JobOutcome>((resolve) => { settle = resolve }),
    }),
  }
  return { spec, settle: (outcome: JobOutcome) => { settle(outcome) } }
}

async function registerAgent(ctx: Context, session: Session): Promise<Agent> {
  const agent = {
    id: session.id,
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx,
  } as Agent
  await ctx.agents.register(agent)
  return agent
}

async function harness(): Promise<{
  ctx: Context
  session: Session
  agent: Agent
  controller: JobController
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalJobRegistry)
  ctx.jobs.attachController('hasrows-test')
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(JobController, {})
  const session = ctx.sessions.create()
  const agent = await registerAgent(ctx, session)
  return { ctx, session, agent, controller: ctx.jobController }
}

describe('JobController.hasRows', () => {
  it('reports the sessions whose visible roster holds at least one row', async () => {
    const { ctx, session, agent, controller } = await harness()
    const other = ctx.sessions.create()
    const cold = ctx.sessions.create()
    ctx.jobs.start({ ...producer().spec, owner: agent.id })
    // Only the owning session can see an owned job; `other` and `cold` see
    // nothing, because no unowned job exists in the registry.

    expect(controller.hasRows({ sessionIds: [session.id, other.id, cold.id] }))
      .toEqual({ withJobRows: [session.id] })
  })

  it('reports an unowned job as visible to every requested session', async () => {
    const { ctx, controller } = await harness()
    const a = ctx.sessions.create()
    const b = ctx.sessions.create()
    ctx.jobs.start(producer().spec)

    expect(controller.hasRows({ sessionIds: [a.id, b.id] }))
      .toEqual({ withJobRows: [a.id, b.id] })
  })

  it('returns an empty list when no requested session holds a row', async () => {
    const { ctx, controller } = await harness()
    const cold = ctx.sessions.create()

    expect(controller.hasRows({ sessionIds: [cold.id] })).toEqual({ withJobRows: [] })
  })

  it('treats a settled-but-listed row as present, never reading as zero', async () => {
    const { ctx, session, agent, controller } = await harness()
    const task = producer()
    ctx.jobs.start({ ...task.spec, owner: agent.id })
    task.settle({ status: 'completed', detail: 'exit code: 0' })
    await new Promise(resolve => setTimeout(resolve, 0))

    // A settled record stays listed until it is removed (`jobs/jobs/README.md:129`),
    // so the owning session still reads as holding a job row the same way the
    // row stays visible in a roster stream.
    expect(ctx.jobs.list(session.id).some(job => job.status === 'completed')).toBe(true)
    expect(controller.hasRows({ sessionIds: [session.id] })).toEqual({ withJobRows: [session.id] })
  })
})
