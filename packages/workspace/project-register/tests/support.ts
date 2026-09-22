/** Shared fixtures: temporary workspaces, todo-list entries, and settled register readers. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, vi } from 'vitest'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/types'
import { parseRegister, type RegisterRow } from '@deepseek-ai/dsh-util-project-register'

/** A temporary directory removed by the returned cleanup. */
export async function scratchDir(prefix: string, cleanups: Array<() => Promise<unknown>>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** One todo-list entry. */
export function todo(content: string, status: TodoItem['status']): TodoItem {
  return { content, status }
}

/**
 * Wait until `DECISIONS.md` holds a row with this title, then return every
 * parsed row. Appends run on one FIFO chain per working directory, so when the
 * awaited row lands, every earlier append has landed too.
 * @param cwd - working directory holding the register.
 * @param title - title of the row to wait for.
 * @returns all register rows in file order.
 */
export async function settleRows(cwd: string, title: string): Promise<RegisterRow[]> {
  return await vi.waitFor(async () => {
    const rows = parseRegister(await readFile(join(cwd, 'DECISIONS.md'), 'utf8'))
    expect(rows.some(row => row.title === title)).toBe(true)
    return rows
  })
}
