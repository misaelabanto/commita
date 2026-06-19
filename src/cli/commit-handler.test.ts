import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { CommitAbortError, CommitHandler } from '@/cli/commit-handler.ts';
import type { CommitOptions } from '@/cli/commit-handler.ts';
import { GitService } from '@/git/git.service.ts';
import {
  cleanup,
  FakeAIService,
  makeConfig,
  makeRepo,
  writeFile,
  type TestRepo,
} from '../../test/helpers.ts';

function baseOptions(over?: Partial<CommitOptions>): CommitOptions {
  return {
    all: true,
    ignore: '',
    push: false,
    verify: true,
    dryRun: false,
    status: false,
    atomic: false,
    requireCleanIndex: false,
    yes: true, // default skip prompt unless a test overrides
    defaultIgnores: true,
    ...over,
  };
}

// Build a handler bound to the given repo directory.
function makeHandler(
  repo: TestRepo,
  configOver?: Parameters<typeof makeConfig>[0],
  ai?: FakeAIService,
): CommitHandler {
  const handler = new CommitHandler(makeConfig(configOver), ai ?? new FakeAIService());
  // Point the handler's git service at the temp repo.
  (handler as unknown as { gitService: GitService }).gitService = new GitService(repo.dir);
  return handler;
}

async function commitCount(repo: TestRepo): Promise<number> {
  const out = await repo.git.raw(['rev-list', '--count', 'HEAD']);
  return parseInt(out.trim(), 10);
}

// Returns the set of file paths touched by each commit created since `sinceSha`
// (newest first), so tests can assert that two files never share a commit.
async function commitFileSets(repo: TestRepo, sinceSha: string): Promise<string[][]> {
  const shas = (await repo.git.raw(['rev-list', `${sinceSha}..HEAD`]))
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const sets: string[][] = [];
  for (const sha of shas) {
    const files = (await repo.git.raw(['show', '--name-only', '--pretty=format:', sha]))
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    sets.push(files);
  }
  return sets;
}

describe('CommitHandler integration', () => {
  let repo: TestRepo;
  const origCwd = process.cwd();

  beforeEach(async () => {
    repo = await makeRepo();
    process.chdir(repo.dir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanup(repo.dir);
  });

  test('P0 fold default: pre-staged file regrouped, index ends clean', async () => {
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');
    await repo.git.add(['a/x.ts']);
    writeFile(repo.dir, 'b/y.ts', 'export const y = 2;\n');

    const preRunSha = (await repo.gitService.getHeadSha()) ?? '';
    const handler = makeHandler(repo);
    const before = await commitCount(repo);
    await handler.execute(baseOptions());
    const after = await commitCount(repo);

    expect(after).toBeGreaterThan(before);
    // index clean
    expect(await repo.gitService.isIndexClean()).toBe(true);

    // The 1009-file regression: a/x.ts and b/y.ts must NOT share a commit, and
    // each must land in its own group commit. Asserting both appear somewhere
    // in the log is insufficient (it passes even for a single mega-commit).
    const sets = await commitFileSets(repo, preRunSha);
    const withX = sets.filter(s => s.includes('a/x.ts'));
    const withY = sets.filter(s => s.includes('b/y.ts'));
    expect(withX.length).toBe(1);
    expect(withY.length).toBe(1);
    expect(withX[0]).not.toContain('b/y.ts');
    expect(withY[0]).not.toContain('a/x.ts');
  });

  test('staged-only path (no --all): each group committed in isolation, index ends clean', async () => {
    // Two unrelated groups, both staged. This exercises the default invocation
    // (commita with no --all) and its unstage-then-restage-per-group flow.
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');
    writeFile(repo.dir, 'b/y.ts', 'export const y = 2;\n');
    await repo.git.add(['a/x.ts', 'b/y.ts']);

    const preRunSha = (await repo.gitService.getHeadSha()) ?? '';
    const handler = makeHandler(repo);
    await handler.execute(baseOptions({ all: false }));

    const sets = await commitFileSets(repo, preRunSha);
    // exactly two commits, one per group, never sharing files
    expect(sets.length).toBe(2);
    const withX = sets.filter(s => s.includes('a/x.ts'));
    const withY = sets.filter(s => s.includes('b/y.ts'));
    expect(withX.length).toBe(1);
    expect(withY.length).toBe(1);
    expect(withX[0]).not.toContain('b/y.ts');
    expect(await repo.gitService.isIndexClean()).toBe(true);
  });

  test('staged-only path dry-run leaves files staged and creates no commits', async () => {
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');
    await repo.git.add(['a/x.ts']);

    const handler = makeHandler(repo);
    const before = await commitCount(repo);
    await handler.execute(baseOptions({ all: false, dryRun: true }));

    expect(await commitCount(repo)).toBe(before);
    const staged = (await repo.git.raw(['diff', '--cached', '--name-only']))
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    expect(staged).toContain('a/x.ts');
  });

  test('--require-clean-index with dirty index throws CommitAbortError(1), zero new commits', async () => {
    writeFile(repo.dir, 'a/x.ts', 'x\n');
    await repo.git.add(['a/x.ts']);

    const handler = makeHandler(repo);
    const before = await commitCount(repo);

    let err: unknown;
    try {
      await handler.execute(baseOptions({ requireCleanIndex: true }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CommitAbortError);
    expect((err as CommitAbortError).code).toBe(1);
    expect(await commitCount(repo)).toBe(before);
  });

  test('partial failure: commits before failure persist, recovery reported', async () => {
    // three groups: a, b, c
    writeFile(repo.dir, 'a/x.ts', 'a\n');
    writeFile(repo.dir, 'b/y.ts', 'b\n');
    writeFile(repo.dir, 'c/z.ts', 'c\n');

    const preRunSha = (await repo.gitService.getHeadSha()) ?? '';
    const ai = new FakeAIService(3); // throw on 3rd group
    const handler = makeHandler(repo, undefined, ai);

    let err: unknown;
    try {
      await handler.execute(baseOptions());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CommitAbortError);

    // 2 of 3 groups committed
    const committed = (handler as unknown as { committedShas: string[] }).committedShas;
    expect(committed.length).toBe(2);

    const before = parseInt((await repo.git.raw(['rev-list', '--count', preRunSha])).trim(), 10);
    const now = await commitCount(repo);
    expect(now).toBe(before + 2);
  });

  test('--atomic failure rolls back to preRunSha (net zero commits)', async () => {
    writeFile(repo.dir, 'a/x.ts', 'a\n');
    writeFile(repo.dir, 'b/y.ts', 'b\n');
    writeFile(repo.dir, 'c/z.ts', 'c\n');

    const preRunSha = (await repo.gitService.getHeadSha()) ?? '';
    const ai = new FakeAIService(3);
    const handler = makeHandler(repo, undefined, ai);

    let err: unknown;
    try {
      await handler.execute(baseOptions({ atomic: true }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CommitAbortError);

    const head = await repo.gitService.getHeadSha();
    expect(head).toBe(preRunSha);
  });

  test('confirm gate: non-TTY over threshold without --yes aborts, zero commits', async () => {
    writeFile(repo.dir, 'a/x.ts', 'a\n');
    writeFile(repo.dir, 'b/y.ts', 'b\n');

    const origTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    try {
      const handler = makeHandler(repo, { confirmThreshold: 1 });
      const before = await commitCount(repo);

      let err: unknown;
      try {
        await handler.execute(baseOptions({ yes: false }));
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(CommitAbortError);
      expect((err as CommitAbortError).code).toBe(1);
      expect(await commitCount(repo)).toBe(before);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true });
    }
  });

  test('confirm gate: with --yes proceeds and commits over threshold', async () => {
    writeFile(repo.dir, 'a/x.ts', 'a\n');
    writeFile(repo.dir, 'b/y.ts', 'b\n');

    const handler = makeHandler(repo, { confirmThreshold: 1 });
    const before = await commitCount(repo);
    await handler.execute(baseOptions({ yes: true }));
    expect(await commitCount(repo)).toBeGreaterThan(before);
  });

  test('noise: build/.gradle files excluded by default, included with --no-default-ignores', async () => {
    writeFile(repo.dir, 'app/build/out.class', 'noise\n');
    writeFile(repo.dir, '.gradle/cache', 'noise\n');
    writeFile(repo.dir, 'src/index.ts', 'export const ok = 1;\n');

    // default: noise excluded
    const handler = makeHandler(repo);
    await handler.execute(baseOptions());
    let log = await repo.git.raw(['log', '--name-only', '--pretty=format:']);
    expect(log).toContain('src/index.ts');
    expect(log).not.toContain('app/build/out.class');

    // now with --no-default-ignores the build files get committed
    const handler2 = makeHandler(repo);
    await handler2.execute(baseOptions({ defaultIgnores: false }));
    log = await repo.git.raw(['log', '--name-only', '--pretty=format:']);
    expect(log).toContain('app/build/out.class');
  });

  test('dry-run: zero commits created', async () => {
    writeFile(repo.dir, 'a/x.ts', 'a\n');
    writeFile(repo.dir, 'b/y.ts', 'b\n');

    const handler = makeHandler(repo);
    const before = await commitCount(repo);
    await handler.execute(baseOptions({ dryRun: true }));
    expect(await commitCount(repo)).toBe(before);
  });

  test('--context is passed to the AI for every group in an --all run', async () => {
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');
    writeFile(repo.dir, 'b/y.ts', 'export const y = 2;\n');

    const ai = new FakeAIService();
    const handler = makeHandler(repo, undefined, ai);
    await handler.execute(baseOptions({ context: 'count query moved into txn, not removed' }));

    expect(ai.contexts.length).toBe(2);
    expect(ai.contexts.every(c => c === 'count query moved into txn, not removed')).toBe(true);
  });

  test('no context: the AI receives undefined', async () => {
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');

    const ai = new FakeAIService();
    const handler = makeHandler(repo, undefined, ai);
    await handler.execute(baseOptions());

    expect(ai.contexts.length).toBe(1);
    expect(ai.contexts[0]).toBeUndefined();
  });

  test('--all excludes the --context-file from grouping so per-run notes are not committed', async () => {
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');
    writeFile(repo.dir, '.commit-notes.md', 'Count query moved into txn, not removed\n');

    const ai = new FakeAIService();
    const handler = makeHandler(repo, undefined, ai);
    await handler.execute(baseOptions({ contextFile: '.commit-notes.md' }));

    const log = await repo.git.raw(['log', '--name-only', '--pretty=format:']);
    expect(log).toContain('a/x.ts');
    expect(log).not.toContain('.commit-notes.md');
    // the note still reached the AI as context
    expect(ai.contexts.some(c => c === 'Count query moved into txn, not removed')).toBe(true);
  });

  test('both --context and --context-file abort the run before committing', async () => {
    writeFile(repo.dir, 'a/x.ts', 'export const x = 1;\n');

    const handler = makeHandler(repo);
    const before = await commitCount(repo);
    await expect(
      handler.execute(baseOptions({ context: 'inline', contextFile: '/tmp/whatever.md' })),
    ).rejects.toThrow(CommitAbortError);
    expect(await commitCount(repo)).toBe(before);
  });
});
