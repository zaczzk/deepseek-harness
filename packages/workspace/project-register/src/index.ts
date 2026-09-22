/**
 * Records every major milestone as a row in the project's `DECISIONS.md`, so
 * the architecture diagram is reviewed at each milestone: a todo item newly
 * completed under the configured `milestoneMarker` and each completed goal
 * append one `milestone` row carrying the `ARCHITECTURE.md` diagram's
 * `updated`/`stale`/`absent` flag against the previous milestone's recorded
 * fingerprint. Recording is advisory — any failure warns and drops that
 * milestone, and nothing it observes ever blocks the work being recorded.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-goal'
import type { Session } from '@deepseek-ai/dsh-session'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/types'
import {
  ARCHITECTURE_FILE, REGISTER_FILE, appendRegisterRow, latestMilestone, parseRegister,
} from '@deepseek-ai/dsh-util-project-register'
import {
  completedMilestones, milestoneDate, milestoneDiagram, milestoneRow, type MilestonePlan,
} from './record.ts'

/** Stable Loader identity. */
export const name = 'project-register'

/** Services used to read and record the project files. */
export const inject = ['fs']

/** Milestone recognition rules. Invalid values fail plugin load. */
export interface Config {
  /** A todo item whose content starts with this marker is a milestone; its title is the content with the marker removed. */
  milestoneMarker: string
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  milestoneMarker: z.string().default('milestone:'),
})

/**
 * Read one project file over `fs`, mapping an absent file to a fallback.
 * `readText` rejects for a missing file, so the catch names that outcome and
 * answers `missing`.
 * @param fs - filesystem capability.
 * @param path - workspace-relative project file name.
 * @param cwd - working directory resolving `path`.
 * @param missing - value carried when the file is absent.
 * @returns the file's text, or `missing` when the file is absent.
 */
async function readProjectFile(fs: FileSystem, path: string, cwd: string, missing: string | undefined): Promise<string | undefined> {
  try {
    return await fs.readText(await fs.resolve(path, { cwd }))
  } catch {
    // readText rejects exactly when the file is absent; that outcome reads as `missing`.
    return missing
  }
}

/**
 * Observe milestone todo completions and goal completions and record each one
 * as a `DECISIONS.md` register row carrying the architecture diagram's state
 * at call time.
 * @param ctx - host context with `fs`.
 * @param config - validated milestone recognition rules.
 * @returns nothing; the listeners run for the plugin's lifetime.
 * @throws when `milestoneMarker` is empty or only whitespace — misconfiguration
 *   fails loud at load.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.milestoneMarker.trim() === '') throw new Error('project-register requires a non-empty milestoneMarker')
  // A milestone records only on an observed todo-list transition.
  const todos = new WeakMap<Session, readonly TodoItem[]>()
  // One append chain per working directory, so two milestones never interleave writes to one register.
  const chains = new Map<string, Promise<void>>()
  /**
   * Append one milestone row to a working directory's register, with the
   * diagram evidence read at call time. Any failure warns and drops the
   * milestone; this never throws into event dispatch.
   * @param cwd - working directory holding the project files.
   * @param title - milestone title to record.
   * @returns a promise settling once the append attempt is over.
   */
  const appendMilestone = async (cwd: string, title: string): Promise<void> => {
    try {
      const architecture = await readProjectFile(ctx.fs, ARCHITECTURE_FILE, cwd, undefined)
      const register = (await readProjectFile(ctx.fs, REGISTER_FILE, cwd, undefined)) ?? ''
      const previous = latestMilestone(parseRegister(register))?.diagram ?? null
      const plan: MilestonePlan = { title, ...milestoneDiagram(architecture, previous) }
      const row = milestoneRow(register, plan.title, plan.flag, plan.fingerprint, milestoneDate(new Date()))
      const target = await ctx.fs.resolve(REGISTER_FILE, { cwd })
      await ctx.fs.writeText(target, appendRegisterRow(register, row))
    } catch (error) {
      ctx.logger.warn(`project-register: dropped milestone "${title}" in "${cwd}": ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  /**
   * Queue one milestone row for a session's project register. Subagent
   * children, delegated sessions, and sessions without a working directory
   * record nothing.
   * @param session - session whose working directory holds the register.
   * @param title - milestone title to record.
   * @returns nothing; the append runs on the working directory's chain.
   */
  const record = (session: Session, title: string): void => {
    const { cwd, origin, delegationDepth } = session.header
    if (cwd === undefined || origin === 'subagent' || (delegationDepth ?? 0) > 0) return
    chains.set(cwd, (chains.get(cwd) ?? Promise.resolve()).then(() => appendMilestone(cwd, title)))
  }
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'todo/write') return
    const previous = todos.get(session)
    todos.set(session, event.data.todos)
    for (const title of completedMilestones(previous, event.data.todos, config.milestoneMarker)) record(session, title)
  })
  ctx.on('goal/changed', ({ agent, change }) => {
    if (change.operation !== 'complete' || change.goal === undefined) return
    // A completed goal's objective is its milestone title; the service rejects empty objectives.
    const title = change.goal.objective.trim()
    if (title !== '') record(agent.session, title)
  })
}
