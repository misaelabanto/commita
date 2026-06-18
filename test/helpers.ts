import { GitService } from '@/git/git.service.ts';
import { AIService } from '@/ai/ai.service.ts';
import { DEFAULT_CONFIG, type CommitaConfig } from '@/config/config.types.ts';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';

export interface TestRepo {
  dir: string;
  git: SimpleGit;
  gitService: GitService;
}

export function writeFile(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

export async function makeRepo(): Promise<TestRepo> {
  const dir = mkdtempSync(join(tmpdir(), 'commita-'));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('commit.gpgsign', 'false');

  // baseline tree
  writeFile(dir, 'a/base.txt', 'a base\n');
  writeFile(dir, 'b/base.txt', 'b base\n');
  await git.add(['a/base.txt', 'b/base.txt']);
  await git.commit('chore: baseline');

  const gitService = new GitService(dir);
  await gitService.init();

  return { dir, git, gitService };
}

export function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function makeConfig(overrides?: Partial<CommitaConfig>): CommitaConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/**
 * A fake AIService that returns a deterministic message and can be configured to
 * throw on the Nth call (1-indexed) to exercise partial-failure paths.
 */
export class FakeAIService extends AIService {
  public calls = 0;
  private throwOnCall: number;

  /** Context passed to each generateCommitMessage call, in order. */
  public contexts: Array<string | undefined> = [];

  constructor(throwOnCall = 0) {
    // Provide a config with an API key so the real constructor's validation passes.
    super(makeConfig({ openaiApiKey: 'sk-test-fake-key-123456' }));
    this.throwOnCall = throwOnCall;
  }

  override async generateCommitMessage(
    _diff: string,
    _files: string[],
    scope: string,
    context?: string,
  ): Promise<string> {
    this.calls += 1;
    this.contexts.push(context);
    if (this.throwOnCall > 0 && this.calls === this.throwOnCall) {
      throw new Error('fake AI failure');
    }
    const safeScope = scope.replace(/[^a-zA-Z0-9/_-]/g, '');
    return `feat(${safeScope}): test`;
  }
}
