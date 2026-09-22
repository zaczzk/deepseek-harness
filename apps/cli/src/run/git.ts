/**
 * Git plane for `dsh run`: repository facts, leased worktrees, named-path
 * commits, delivery, and junction-safe removal. Every git invocation is
 * shell-free and captures its exit code; a non-zero git status is data, never
 * an exception the caller cannot see.
 * @module @deepseek-ai/dsh/run/git
 */

import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** One captured git invocation. */
export interface GitResult {
  /** Process exit code, or `null` when the process could not spawn. */
  status: number | null
  /** Trimmed standard output. */
  stdout: string
  /** Trimmed standard error. */
  stderr: string
}

/**
 * Run one git command without a shell and capture its result.
 * @param args - git arguments, each one process argument.
 * @param cwd - directory the command runs in.
 * @returns the captured exit code and streams.
 */
export function runGit(args: readonly string[], cwd: string): GitResult {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8', windowsHide: true })
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim() === '' && result.error !== undefined
      ? String(result.error)
      : (result.stderr ?? '').trim(),
  }
}

/** Resolved repository locations for one target directory. */
export interface RepositoryFacts {
  /** Absolute primary worktree path (`git rev-parse --show-toplevel`). */
  toplevel: string
  /** Absolute common git directory (`git rev-parse --git-common-dir`). */
  commonDir: string
  /** Branch the primary worktree has checked out, or `null` when detached. */
  branch: string | null
}

/**
 * Locate the git repository containing `cwd`.
 * @param cwd - directory to locate from.
 * @returns the repository facts, or `null` when `cwd` is not in a git repository.
 */
export function locateRepository(cwd: string): RepositoryFacts | null {
  const toplevel = runGit(['rev-parse', '--show-toplevel'], cwd)
  const commonDir = runGit(['rev-parse', '--git-common-dir'], cwd)
  if (toplevel.status !== 0 || commonDir.status !== 0) return null
  const branchResult = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], toplevel.stdout)
  const branch = branchResult.status === 0 && branchResult.stdout !== 'HEAD' ? branchResult.stdout : null
  return {
    // git reports forward-slash paths relative to the directory each command
    // ran in; resolve both against `cwd` (the directory git ran in) to platform
    // form so callers can compare and join them with locally built paths.
    toplevel: resolve(toplevel.stdout),
    commonDir: resolve(cwd, commonDir.stdout),
    branch,
  }
}

/**
 * Whether the named remote exists in the repository.
 * @param toplevel - repository primary worktree.
 * @param remote - remote name.
 * @returns true when the remote is configured.
 */
export function hasRemote(toplevel: string, remote: string): boolean {
  return runGit(['remote', 'get-url', remote], toplevel).status === 0
}

/**
 * Whether the primary worktree holds no staged or unstaged changes. Untracked
 * files do not count: `git merge` already refuses to overwrite them.
 * @param toplevel - repository primary worktree.
 * @returns true when tracked content is clean.
 */
export function isClean(toplevel: string): boolean {
  return runGit(['status', '--porcelain', '--untracked-files=no'], toplevel).stdout === ''
}

/** A leased run worktree: its path, run branch, and the base commit it was cut from. */
export interface WorktreeLease {
  /** Absolute worktree path. */
  path: string
  /** Run branch checked out in the worktree. */
  branch: string
  /** Commit the worktree was created from. */
  base: string
}

/**
 * Recursively unlink every symbolic link (a Windows junction reads as one)
 * under `path`. Windows recursive deletion — `git worktree remove` and Node's
 * `rmSync` — follows MOUNT_POINT junctions into their targets and would delete
 * the linked directory's real contents, so every removal calls this first; on
 * POSIX the same walk simply unlinks ordinary symlinks.
 * @param path - root of the tree whose links are unlinked.
 */
export function clearJunctions(path: string): void {
  const visit = (entry: string): void => {
    let stat: ReturnType<typeof lstatSync>
    try {
      stat = lstatSync(entry)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      if (stat.isSymbolicLink()) unlinkSync(entry)
      return
    }
    for (const child of readdirSync(entry)) visit(join(entry, child))
  }
  visit(path)
}

/**
 * Lease one run worktree under the repository's documented scratch location:
 * `<git-common-dir>/dsh-scratch/runs/<runId>/worktree` on a fresh run branch.
 * @param facts - target repository facts.
 * @param runId - identity naming the run directory and branch.
 * @returns the leased worktree, or the git failure message.
 */
export function leaseWorktree(facts: RepositoryFacts, runId: string): { ok: true; lease: WorktreeLease } | { ok: false; failure: string } {
  const path = join(facts.commonDir, 'dsh-scratch', 'runs', runId, 'worktree')
  const branch = `dsh-run/${runId}`
  const base = runGit(['rev-parse', 'HEAD'], facts.toplevel)
  if (base.status !== 0) return { ok: false, failure: `cannot resolve the base commit: ${base.stderr || base.stdout}` }
  const added = runGit(['worktree', 'add', '-b', branch, path, base.stdout], facts.toplevel)
  if (added.status !== 0) return { ok: false, failure: `git worktree add failed: ${added.stderr || added.stdout}` }
  return { ok: true, lease: { path, branch, base: base.stdout } }
}

/**
 * Remove one run worktree lease and its branch after clearing junctions. A
 * lease whose directory is already gone still releases its git metadata and
 * branch, so `--abort` never strands one. The run's state directory is owned
 * by the state layer and left to its caller.
 * @param facts - target repository facts.
 * @param lease - the lease to release.
 * @returns whether the lease is fully released, plus the failure message.
 */
export function removeWorktreeLease(facts: RepositoryFacts, lease: WorktreeLease): { cleaned: boolean; failure: string | null } {
  let failure: string | null = null
  if (existsSync(lease.path)) {
    try {
      clearJunctions(lease.path)
    } catch (error) {
      failure = `junction clearing failed: ${error instanceof Error ? error.message : String(error)}`
    }
    const removed = runGit(['worktree', 'remove', '--force', lease.path], facts.toplevel)
    if (removed.status !== 0) {
      failure = failure ?? `git worktree remove failed: ${removed.stderr || removed.stdout}`
      // Windows releases child and antivirus handles asynchronously, so retry
      // before falling back to a junction-cleared recursive removal.
      try {
        rmSync(lease.path, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 })
      } catch (error) {
        failure = `worktree removal failed after retries: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  runGit(['worktree', 'prune'], facts.toplevel)
  const listed = runGit(['branch', '--list', lease.branch], facts.toplevel)
  if (listed.stdout !== '') {
    const deleteBranch = runGit(['branch', '-D', lease.branch], facts.toplevel)
    if (deleteBranch.status !== 0) {
      failure = failure ?? `git branch -D ${lease.branch} failed: ${deleteBranch.stderr || deleteBranch.stdout}`
    }
  }
  return { cleaned: failure === null, failure }
}

/** One captured NUL-delimited git listing, split without trimming names. */
function runGitNul(args: readonly string[], cwd: string): string[] | null {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 || result.stdout === null) return null
  return result.stdout.split('\0').filter(path => path !== '')
}

/**
 * List repository-relative paths touched since `base`: committed changes,
 * working-tree changes, and untracked files. `base: null` diffs against HEAD
 * (what is left uncommitted). A git failure reads as unknown, not as empty.
 * @param cwd - repository worktree to inspect.
 * @param base - commit the run started from, or `null` to diff against HEAD.
 * @returns sorted unique repository-relative paths, or `null` when git failed to report.
 */
export function changedPaths(cwd: string, base: string | null): string[] | null {
  const names = new Set<string>()
  const listings = [
    base === null
      ? runGitNul(['diff', '--name-only', '-z', 'HEAD'], cwd)
      : runGitNul(['diff', '--name-only', '-z', base], cwd),
    runGitNul(['ls-files', '--others', '--exclude-standard', '-z'], cwd),
  ]
  if (listings.some(listing => listing === null)) return null
  for (const listing of listings) for (const path of listing ?? []) names.add(path)
  return [...names].sort()
}

/**
 * Commit exactly the named paths, leaving everything else in the index and
 * working tree untouched. A shared tree is never staged wholesale.
 * @param cwd - repository worktree to commit in.
 * @param paths - repository-relative paths to commit.
 * @param message - commit message.
 * @returns the new commit id (`ok` with `commit: null` when there was nothing to commit), or the git failure message.
 */
export function commitNamedPaths(cwd: string, paths: readonly string[], message: string):
  { ok: true; commit: string | null } | { ok: false; failure: string } {
  if (paths.length === 0) return { ok: true, commit: null }
  const staged = runGit(['add', '--', ...paths], cwd)
  if (staged.status !== 0) return { ok: false, failure: `git add failed: ${staged.stderr || staged.stdout}` }
  const committed = runGit(['commit', '-m', message, '--', ...paths], cwd)
  if (committed.status !== 0) return { ok: false, failure: `git commit failed: ${committed.stderr || committed.stdout}` }
  const head = runGit(['rev-parse', 'HEAD'], cwd)
  if (head.status !== 0) return { ok: false, failure: `git rev-parse HEAD failed: ${head.stderr || head.stdout}` }
  return { ok: true, commit: head.stdout }
}

/**
 * Merge one run branch into the target branch of the primary checkout, which
 * must be clean; a dirty primary checkout is a failure, never a forced update.
 * @param facts - target repository facts.
 * @param branch - run branch to merge.
 * @param targetBranch - branch to merge into.
 * @param message - merge commit message.
 * @returns the merge commit id, or the failure message.
 */
export function mergeRunBranch(facts: RepositoryFacts, branch: string, targetBranch: string, message: string):
  { ok: true; commit: string } | { ok: false; failure: string } {
  if (!isClean(facts.toplevel)) {
    return { ok: false, failure: `the primary checkout has uncommitted tracked changes; commit or stash them before delivery` }
  }
  const head = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], facts.toplevel)
  if (head.status !== 0) return { ok: false, failure: `cannot resolve the checked-out branch: ${head.stderr || head.stdout}` }
  if (head.stdout !== targetBranch) {
    const checkedOut = runGit(['checkout', targetBranch], facts.toplevel)
    if (checkedOut.status !== 0) {
      return { ok: false, failure: `git checkout ${targetBranch} failed: ${checkedOut.stderr || checkedOut.stdout}` }
    }
  }
  const merged = runGit(['merge', '--no-ff', '-m', message, branch], facts.toplevel)
  if (merged.status !== 0) {
    runGit(['merge', '--abort'], facts.toplevel)
    return { ok: false, failure: `git merge ${branch} into ${targetBranch} failed: ${merged.stderr || merged.stdout}` }
  }
  const mergedHead = runGit(['rev-parse', 'HEAD'], facts.toplevel)
  if (mergedHead.status !== 0) return { ok: false, failure: `merge succeeded but HEAD is unreadable: ${mergedHead.stderr || mergedHead.stdout}` }
  return { ok: true, commit: mergedHead.stdout }
}

/**
 * Push the target branch to the named remote.
 * @param toplevel - repository primary worktree.
 * @param remote - remote to push to.
 * @param targetBranch - branch to push.
 * @returns whether the push completed, plus the failure message.
 */
export function pushBranch(toplevel: string, remote: string, targetBranch: string): { pushed: boolean; failure: string | null } {
  const pushed = runGit(['push', remote, targetBranch], toplevel)
  if (pushed.status !== 0) {
    return { pushed: false, failure: `git push ${remote} ${targetBranch} failed: ${pushed.stderr || pushed.stdout}` }
  }
  return { pushed: true, failure: null }
}
