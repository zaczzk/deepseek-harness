import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  changedPaths,
  commitNamedPaths,
  hasRemote,
  isClean,
  leaseWorktree,
  locateRepository,
  mergeRunBranch,
  pushBranch,
  removeWorktreeLease,
  runGit,
  type RepositoryFacts,
} from '../../src/run/git.ts'
import { removeRunState } from '../../src/run/state.ts'

const directories: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  directories.push(dir)
  return dir
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

function createRepo(): string {
  const dir = tempDir('dsh-run-git-')
  git(dir, ['init', '-b', 'main'])
  git(dir, ['config', 'user.email', 'run@test.invalid'])
  git(dir, ['config', 'user.name', 'dsh-run-test'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(dir, 'README.md'), 'start\n')
  git(dir, ['add', 'README.md'])
  git(dir, ['commit', '-m', 'init'])
  return dir
}

function facts(dir: string): RepositoryFacts {
  const located = locateRepository(dir)
  if (located === null) throw new Error(`fixture ${dir} is not a repository`)
  return located
}

afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop() as string, { recursive: true, force: true, maxRetries: 50, retryDelay: 200 })
})

describe('repository facts', () => {
  it('locates a repository from inside it and reports none outside', () => {
    const dir = createRepo()
    mkdirSync(join(dir, 'nested'))
    const located = locateRepository(join(dir, 'nested'))
    expect(located?.branch).toBe('main')
    expect(located?.toplevel).toBe(dir)
    // `--git-common-dir` is cwd-relative; a nested --cwd must still resolve the
    // scratch location inside this repository's git directory.
    expect(located?.commonDir).toBe(join(dir, '.git'))
    expect(locateRepository(tempDir('dsh-run-plain-'))).toBeNull()
  })

  it('reports cleanliness and remote presence', () => {
    const dir = createRepo()
    expect(isClean(dir)).toBe(true)
    expect(hasRemote(dir, 'origin')).toBe(false)
    writeFileSync(join(dir, 'README.md'), 'dirty\n')
    expect(isClean(dir)).toBe(false)
  })
})

describe('changed paths', () => {
  it('lists tracked and untracked paths and clears after commit', () => {
    const dir = createRepo()
    writeFileSync(join(dir, 'a.txt'), 'a\n')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'b.txt'), 'b\n')
    expect(changedPaths(dir, null)).toEqual(['a.txt', 'sub/b.txt'])
    const committed = commitNamedPaths(dir, ['a.txt', 'sub/b.txt'], 'add files')
    expect(committed).toMatchObject({ ok: true })
    expect(changedPaths(dir, null)).toEqual([])
  })

  it('reports git failures as unknown instead of empty', () => {
    expect(changedPaths(tempDir('dsh-run-plain-'), null)).toBeNull()
  })
})

describe('commitNamedPaths', () => {
  it('commits only the named paths and leaves other staged work staged', () => {
    const dir = createRepo()
    writeFileSync(join(dir, 'mine.txt'), 'mine\n')
    writeFileSync(join(dir, 'theirs.txt'), 'theirs\n')
    git(dir, ['add', 'theirs.txt'])
    const committed = commitNamedPaths(dir, ['mine.txt'], 'only mine')
    if (!committed.ok) throw new Error(committed.failure)
    expect(committed.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(git(dir, ['show', '--pretty=format:', '--name-only', 'HEAD'])).toBe('mine.txt')
    expect(git(dir, ['diff', '--cached', '--name-only'])).toBe('theirs.txt')
  })

  it('reports nothing to commit for an empty path list', () => {
    expect(commitNamedPaths(createRepo(), [], 'noop')).toEqual({ ok: true, commit: null })
  })
})

describe('worktree leases', () => {
  it('leases under the documented scratch location and releases cleanly', () => {
    const dir = createRepo()
    const repo = facts(dir)
    const leased = leaseWorktree(repo, 'run-a')
    if (!leased.ok) throw new Error(leased.failure)
    expect(leased.lease.path).toBe(join(repo.commonDir, 'dsh-scratch', 'runs', 'run-a', 'worktree'))
    expect(leased.lease.branch).toBe('dsh-run/run-a')
    expect(existsSync(join(leased.lease.path, 'README.md'))).toBe(true)
    writeFileSync(join(leased.lease.path, 'work.txt'), 'w\n')
    expect(changedPaths(leased.lease.path, leased.lease.base)).toEqual(['work.txt'])

    const removed = removeWorktreeLease(repo, leased.lease)
    expect(removed).toEqual({ cleaned: true, failure: null })
    expect(existsSync(leased.lease.path)).toBe(false)
    removeRunState(join(repo.commonDir, 'dsh-scratch', 'runs', 'run-a'))
    expect(existsSync(join(repo.commonDir, 'dsh-scratch', 'runs', 'run-a'))).toBe(false)
    expect(existsSync(join(repo.commonDir, 'dsh-scratch'))).toBe(false)
    expect(git(dir, ['worktree', 'list']).split('\n')).toHaveLength(1)
    expect(git(dir, ['branch', '--list', 'dsh-run/run-a'])).toBe('')
    expect(changedPaths(dir, null)).toEqual([])
  })

  it('clears junctions before removal and never deletes their targets', () => {
    const dir = createRepo()
    const repo = facts(dir)
    const leased = leaseWorktree(repo, 'run-junction')
    if (!leased.ok) throw new Error(leased.failure)
    // The known hazard: recursive removal follows a Windows junction into its
    // target and deletes the linked directory's real contents.
    const outside = tempDir('dsh-run-junction-target-')
    writeFileSync(join(outside, 'sentinel.txt'), 'this must survive')
    symlinkSync(outside, join(leased.lease.path, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')

    const removed = removeWorktreeLease(repo, leased.lease)
    expect(removed.cleaned).toBe(true)
    expect(existsSync(join(outside, 'sentinel.txt'))).toBe(true)
    expect(existsSync(leased.lease.path)).toBe(false)
  })

  it('releases a lease whose directory is already gone without stranding its branch', () => {
    const dir = createRepo()
    const repo = facts(dir)
    const leased = leaseWorktree(repo, 'run-gone')
    if (!leased.ok) throw new Error(leased.failure)
    rmSync(leased.lease.path, { recursive: true, force: true })

    const removed = removeWorktreeLease(repo, leased.lease)
    expect(removed).toEqual({ cleaned: true, failure: null })
    expect(git(dir, ['branch', '--list', 'dsh-run/run-gone'])).toBe('')
    expect(git(dir, ['worktree', 'list']).split('\n')).toHaveLength(1)
  })
})

describe('delivery', () => {
  it('merges a run branch into the target and refuses a dirty primary checkout', () => {
    const dir = createRepo()
    const repo = facts(dir)
    const leased = leaseWorktree(repo, 'run-m')
    if (!leased.ok) throw new Error(leased.failure)
    writeFileSync(join(leased.lease.path, 'feature.txt'), 'feature\n')
    commitNamedPaths(leased.lease.path, ['feature.txt'], 'feature')

    writeFileSync(join(dir, 'README.md'), 'uncommitted human edit\n')
    expect(mergeRunBranch(repo, leased.lease.branch, 'main', 'merge')).toEqual({
      ok: false,
      failure: 'the primary checkout has uncommitted tracked changes; commit or stash them before delivery',
    })
    git(dir, ['checkout', '--', 'README.md'])

    const merged = mergeRunBranch(repo, leased.lease.branch, 'main', 'merge feature')
    if (!merged.ok) throw new Error(merged.failure)
    expect(existsSync(join(dir, 'feature.txt'))).toBe(true)
    expect(git(dir, ['log', '--oneline', '-1'])).toContain('merge feature')
  })

  it('aborts a conflicted merge and reports it', () => {
    const dir = createRepo()
    const repo = facts(dir)
    const leased = leaseWorktree(repo, 'run-c')
    if (!leased.ok) throw new Error(leased.failure)
    writeFileSync(join(leased.lease.path, 'README.md'), 'from run\n')
    commitNamedPaths(leased.lease.path, ['README.md'], 'run change')
    writeFileSync(join(dir, 'README.md'), 'from main\n')
    git(dir, ['add', 'README.md'])
    git(dir, ['commit', '-m', 'main change'])

    const merged = mergeRunBranch(repo, leased.lease.branch, 'main', 'merge')
    expect(merged.ok).toBe(false)
    expect(isClean(dir)).toBe(true)
  })

  it('pushes to the configured remote and names push failures', () => {
    const dir = createRepo()
    const remote = tempDir('dsh-run-remote-')
    execFileSync('git', ['init', '--bare', remote])
    git(dir, ['remote', 'add', 'origin', remote])
    expect(pushBranch(dir, 'origin', 'main')).toEqual({ pushed: true, failure: null })
    expect(execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' })).toContain('refs/heads/main')

    const failed = pushBranch(dir, 'origin', 'no-such-branch')
    expect(failed.pushed).toBe(false)
    expect(failed.failure).toContain('git push origin no-such-branch failed')
  })
})

describe('runGit', () => {
  it('captures a non-zero status as data and a spawn failure as stderr', () => {
    const dir = createRepo()
    const failure = runGit(['definitely', 'not-a-git-subcommand'], dir)
    expect(failure.status).not.toBe(0)
    expect(runGit(['rev-parse', '--is-inside-work-tree'], dir).stdout).toBe('true')
  })
})
