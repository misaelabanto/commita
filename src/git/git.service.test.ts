import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GitService } from '@/git/git.service.ts';
import { cleanup, makeRepo, writeFile, type TestRepo } from '../../test/helpers.ts';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import simpleGit from 'simple-git';

describe('GitService P0 index isolation', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await makeRepo();
  });

  afterEach(() => {
    cleanup(repo.dir);
  });

  test('commit(pathspec) commits ONLY the group, leaving pre-staged file staged', async () => {
    // pre-stage a/x.ts (ambient index)
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');
    await repo.git.add(['a/x.ts']);

    // unstaged change in b/y.ts
    writeFile(repo.dir, 'b/y.ts', 'export const y = 2;\n');

    await repo.gitService.stageFiles(['b/y.ts']);
    await repo.gitService.commit('feat(b): y', ['b/y.ts']);

    const headFiles = (await repo.git.raw(['show', '--name-only', '--pretty=format:', 'HEAD']))
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    expect(headFiles).toContain('b/y.ts');
    expect(headFiles).not.toContain('a/x.ts');

    const stillStaged = (await repo.git.raw(['diff', '--cached', '--name-only']))
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    expect(stillStaged).toContain('a/x.ts');
  });

  test('new/untracked file in group is committed', async () => {
    writeFile(repo.dir, 'c/new.ts', 'export const c = 3;\n');
    await repo.gitService.stageFiles(['c/new.ts']);
    await repo.gitService.commit('feat(c): new', ['c/new.ts']);

    const headFiles = (await repo.git.raw(['show', '--name-only', '--pretty=format:', 'HEAD']))
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    expect(headFiles).toContain('c/new.ts');
  });

  test('deleted file in group is committed', async () => {
    // Mirror the handler flow: the file is deleted in the working tree, then
    // staged via stageFiles (git add stages deletions), then committed.
    rmSync(join(repo.dir, 'a/base.txt'));
    await repo.gitService.stageFiles(['a/base.txt']);
    await repo.gitService.commit('chore(a): remove base', ['a/base.txt']);

    const log = await repo.git.raw(['log', '--diff-filter=D', '--name-only', '--pretty=format:', '-1']);
    expect(log).toContain('a/base.txt');
  });

  test('commit([]) throws (empty-pathspec guard)', async () => {
    await expect(repo.gitService.commit('msg', [])).rejects.toThrow(/empty pathspec/);
  });

  test('getHeadSha returns sha on repo with commits, null on unborn', async () => {
    const sha = await repo.gitService.getHeadSha();
    expect(typeof sha).toBe('string');
    expect((sha ?? '').length).toBeGreaterThan(0);

    const freshDir = mkdtempSync(join(tmpdir(), 'commita-unborn-'));
    const freshGit = simpleGit(freshDir);
    await freshGit.init();
    const fresh = new GitService(freshDir);
    await fresh.init();
    expect(await fresh.getHeadSha()).toBeNull();
    cleanup(freshDir);
  });

  test('isIndexClean true on clean, false after staging', async () => {
    expect(await repo.gitService.isIndexClean()).toBe(true);
    writeFile(repo.dir, 'a/x.ts', 'x\n');
    await repo.git.add(['a/x.ts']);
    expect(await repo.gitService.isIndexClean()).toBe(false);
  });
});
