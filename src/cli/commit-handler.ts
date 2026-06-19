import { AIService } from '@/ai/ai.service.ts';
import { decideConfirm } from '@/cli/confirm.ts';
import { resolveContext, resolveContextFilePath } from '@/cli/context.ts';
import type { CommitaConfig } from '@/config/config.types.ts';
import { FileGrouper } from '@/git/file-grouper.ts';
import type { FileGroup } from '@/git/file-grouper.ts';
import type { FileChange } from '@/git/git.service.ts';
import { GitService } from '@/git/git.service.ts';
import { ProjectDetector } from '@/git/project-detector.ts';
import { DEFAULT_GROUPING_IGNORES, PatternMatcher } from '@/utils/pattern-matcher.ts';
import chalk from 'chalk';
import { relative } from 'path';
import { createInterface } from 'readline';

const MOSTLY_IGNORABLE_RATIO = 0.7;

export class CommitAbortError extends Error {
  constructor(public code: number) {
    super('aborted');
    this.name = 'CommitAbortError';
  }
}

export interface CommitOptions {
  all: boolean;
  ignore: string;
  push: boolean;
  verify: boolean;
  config?: string;
  dryRun: boolean;
  status: boolean;
  depth?: number;
  maxFilesPerGroup?: number;
  atomic: boolean;
  requireCleanIndex: boolean;
  yes: boolean;
  confirmThreshold?: number;
  defaultIgnores: boolean;
  context?: string;
  contextFile?: string;
}

export class CommitHandler {
  private gitService: GitService;
  private fileGrouper: FileGrouper;
  private aiService: AIService;
  private config: CommitaConfig;
  private noVerify: boolean = false;
  private dryRun: boolean = false;
  private requireCleanIndex: boolean = false;
  private atomic: boolean = false;
  private yes: boolean = false;
  private confirmThreshold: number = 100;
  private preRunSha: string | null = null;
  private committedShas: string[] = [];
  private context?: string;
  // Absolute path of a resolved --context-file, excluded from --all grouping so
  // the per-run note never lands in a commit of its own.
  private contextFilePath?: string;

  constructor(config: CommitaConfig, aiService?: AIService) {
    this.config = config;
    this.gitService = new GitService();
    this.fileGrouper = new FileGrouper();
    this.aiService = aiService ?? new AIService(config);
  }

  async execute(options: CommitOptions): Promise<void> {
    console.log(chalk.blue('🤖 Commita - AI-powered auto-commit\n'));

    this.noVerify = !options.verify;
    this.dryRun = options.dryRun;
    this.committedShas = [];
    this.contextFilePath = options.contextFile != null ? resolveContextFilePath(options.contextFile) : undefined;

    // Resolve context before any git work so a bad --context/--context-file
    // aborts the run before any commit is created.
    try {
      this.context = resolveContext({ context: options.context, contextFile: options.contextFile });
    } catch (error) {
      console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Invalid context'}\n`));
      throw new CommitAbortError(1);
    }
    if (this.context) {
      console.log(chalk.gray(`Context: ${this.context.replace(/\n/g, '\n         ')}\n`));
    }

    // CLI > config precedence
    const groupDepth = options.depth ?? this.config.groupDepth ?? 2;
    const maxFilesPerGroup = options.maxFilesPerGroup ?? this.config.maxFilesPerGroup ?? 0;
    this.confirmThreshold = options.confirmThreshold ?? this.config.confirmThreshold ?? 100;
    this.requireCleanIndex = options.requireCleanIndex || this.config.requireCleanIndex;
    this.atomic = options.atomic || this.config.atomic;
    this.yes = options.yes;
    // --no-default-ignores (CLI) wins when explicitly passed; otherwise the
    // config value applies. There is no --default-ignores flag, so the CLI can
    // only ever disable the defaults, not force them back on over the config.
    const useDefaultIgnores =
      options.defaultIgnores === false ? false : this.config.defaultIgnores;

    await this.gitService.init();
    this.preRunSha = await this.gitService.getHeadSha();

    const boundaries = ProjectDetector.detect(this.gitService.getRootDir());
    this.fileGrouper = new FileGrouper(boundaries, {
      depth: groupDepth,
      maxFilesPerGroup,
    });

    const userPatterns = PatternMatcher.parsePatterns(options.ignore);
    const patterns = useDefaultIgnores
      ? [...DEFAULT_GROUPING_IGNORES, ...userPatterns]
      : userPatterns;
    const patternMatcher = new PatternMatcher(patterns);

    try {
      if (options.status) {
        await this.showStatus(patternMatcher);
        return;
      }

      const stagedChanges = await this.gitService.getStagedChanges();

      if (!options.all && stagedChanges.length === 0) {
        console.error(chalk.red('❌ Error: No staged changes found.\n'));
        console.log(chalk.yellow('Either stage some changes or use the --all flag to process all changes.\n'));
        console.log(chalk.gray('Examples:'));
        console.log(chalk.gray('  git add <files>       # Stage specific files'));
        console.log(chalk.gray('  commita --all         # Process all changes\n'));
        throw new CommitAbortError(1);
      }

      if (options.all && stagedChanges.length > 0) {
        if (this.requireCleanIndex) {
          console.error(chalk.red(`Refusing to run --all with ${stagedChanges.length} pre-staged file(s).`));
          console.log(chalk.yellow('Commit or unstage them first, or drop --require-clean-index.'));
          throw new CommitAbortError(1);
        }
        // default: fold pre-staged into grouping
        console.log(chalk.yellow(`Note: ${stagedChanges.length} pre-staged file(s) will be regrouped and committed by group.`));
        if (!this.dryRun) {
          await this.gitService.unstageFiles(stagedChanges.map(f => f.path));
        }
      } else if (stagedChanges.length > 0 && !options.all) {
        console.log(chalk.yellow('📦 Found staged changes. Grouping and processing them...\n'));
        await this.processGroupedStagedChanges(stagedChanges);
      }

      if (options.all) {
        await this.processAllChanges(patternMatcher);
      }

      if (options.push && !this.dryRun) {
        await this.pushChanges();
      }

      if (this.dryRun) {
        console.log(chalk.yellow('\n🏃 Dry run complete: no changes were committed or pushed.\n'));
      } else {
        console.log(chalk.green('\n✨ Done!\n'));
      }
    } catch (error) {
      if (error instanceof CommitAbortError) {
        throw error;
      }

      if (this.atomic && this.committedShas.length > 0 && !this.dryRun) {
        if (this.preRunSha) {
          await this.gitService.resetSoft(this.preRunSha);
        } else {
          await this.gitService.deleteHeadRef();
        }
        console.log(chalk.yellow(`Rolled back ${this.committedShas.length} commit(s) (--atomic).`));
      } else if (this.committedShas.length > 0) {
        this.reportPartialFailure();
      }

      if (error instanceof Error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      } else {
        console.error(chalk.red('\n❌ An unknown error occurred\n'));
      }
      throw new CommitAbortError(1);
    }
  }

  private reportPartialFailure(): void {
    console.log(chalk.red(`\nRun failed after creating ${this.committedShas.length} commit(s):`));
    for (const sha of this.committedShas) console.log(chalk.gray(`  ${sha.slice(0, 8)}`));
    console.log(chalk.yellow('To undo all commits from this run (keeps your changes staged):'));
    if (this.preRunSha) console.log(chalk.white(`  git reset --soft ${this.preRunSha}`));
    else console.log(chalk.white('  git update-ref -d HEAD'));
  }

  private printPlan(groups: FileGroup[]): void {
    const total = groups.reduce((sum, g) => sum + g.files.length, 0);
    console.log(chalk.blue(`\nPlan: ${groups.length} group(s)`));
    groups.forEach((g, idx) => {
      console.log(chalk.cyan(`[${idx + 1}/${groups.length}] ${g.scope}  (${g.files.length} file(s))`));
      const shown = g.files.slice(0, 5);
      for (const f of shown) {
        console.log(chalk.gray(`    ${f.path}`));
      }
      if (g.files.length > 5) {
        console.log(chalk.gray(`    (+${g.files.length - 5} more)`));
      }
    });
    console.log(chalk.blue(`Total: ${total} file(s) in ${groups.length} group(s)\n`));
  }

  private async confirm(question: string): Promise<boolean> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer: string = await new Promise(resolve => {
        rl.question(question, resolve);
      });
      const normalized = answer.trim().toLowerCase();
      return normalized === 'y' || normalized === 'yes';
    } finally {
      rl.close();
    }
  }

  // Invariant: exactly one of the staged-only or --all code paths runs per
  // invocation (guaranteed by the if/else-if in execute), so gating per batch
  // is equivalent to gating per run. If both paths ever run together, move this
  // gate up to execute() so the threshold covers the combined file count.
  private async gateConfirmation(groups: FileGroup[]): Promise<void> {
    const total = groups.reduce((sum, g) => sum + g.files.length, 0);
    const maxGroup = groups.reduce((max, g) => Math.max(max, g.files.length), 0);

    const decision = decideConfirm({
      total,
      maxGroup,
      threshold: this.confirmThreshold,
      yes: this.yes,
      dryRun: this.dryRun,
      isTTY: Boolean(process.stdin.isTTY),
    });

    if (decision === 'proceed') return;

    if (decision === 'abort') {
      console.error(chalk.red(`Refusing to commit ${total} files without confirmation in a non-interactive shell. Re-run with --yes to proceed.`));
      throw new CommitAbortError(1);
    }

    // prompt
    const ok = await this.confirm(`Proceed with committing ${total} files in ${groups.length} groups? [y/N] `);
    if (!ok) {
      console.log(chalk.yellow('Aborted by user.'));
      throw new CommitAbortError(0);
    }
  }

  private async _processChangesInGroups(changes: FileChange[], isStaged: boolean): Promise<void> {
    if (changes.length === 0) {
      console.log(chalk.yellow(`No ${isStaged ? 'staged' : 'unstaged'} changes found to group. Skipping...`));
      return;
    }

    if (isStaged && !this.dryRun) {
      const allFiles = changes.map(f => f.path);
      await this.gitService.unstageFiles(allFiles);
    }

    const groups = this.fileGrouper.groupByPath(changes);
    const optimizedGroups = this.fileGrouper.optimizeGroups(groups);

    for (const warning of this.fileGrouper.splitWarnings) {
      console.log(chalk.yellow(warning));
    }

    this.printPlan(optimizedGroups);

    await this.gateConfirmation(optimizedGroups);

    console.log(chalk.blue(`Found ${optimizedGroups.length} group(s) of ${isStaged ? 'staged' : 'unstaged'} changes:\n`));

    for (const [index, group] of optimizedGroups.entries()) {
      console.log(chalk.cyan(`\n[${index + 1}/${optimizedGroups.length}] Processing ${isStaged ? 'staged' : 'unstaged'}: ${group.scope}`));
      console.log(chalk.gray(`Files: ${group.files.map(f => f.path).join(', ')}\n`));

      const files = group.files.map(f => f.path);
      const diff = await this.gitService.getDiff(files, isStaged && this.dryRun);

      if (!diff) {
        console.log(chalk.yellow(`  No diff found for this ${isStaged ? 'staged' : 'unstaged'} group. Skipping...`));
        continue;
      }

      console.log(chalk.cyan('  Generating commit message...'));
      const message = await this.aiService.generateCommitMessage(diff, files, group.scope, this.context);

      console.log(chalk.gray('  Commit message:'));
      console.log(chalk.white(`  ${message.replace(/\n/g, '\n  ')}`));
      console.log();

      if (this.dryRun) {
        console.log(chalk.yellow(`  ⏭ Dry run: skipped committing ${files.length} file(s)`));
      } else {
        await this.gitService.stageFiles(files);
        const sha = await this.gitService.commit(message, files, { noVerify: this.noVerify });
        this.committedShas.push(sha);
        console.log(chalk.green(`  ✓ Committed ${files.length} ${isStaged ? 'staged' : 'unstaged'} file(s)`));
      }
    }
  }

  private async processGroupedStagedChanges(stagedChanges: FileChange[]): Promise<void> {
    await this._processChangesInGroups(stagedChanges, true);
  }

  private async processAllChanges(patternMatcher: PatternMatcher): Promise<void> {
    const unstagedChanges = this.excludeContextFile(await this.gitService.getUnstagedChanges());

    if (unstagedChanges.length === 0) {
      console.log(chalk.yellow('No unstaged changes found.'));
      return;
    }

    const ratio = patternMatcher.ignorableRatio(unstagedChanges);

    const filteredChanges = patternMatcher.filterFiles(unstagedChanges);
    const excludedCount = unstagedChanges.length - filteredChanges.length;

    if (excludedCount > 0) {
      console.log(chalk.gray(`  (${excludedCount} file(s) excluded by ignore patterns)`));
    }

    if (ratio >= MOSTLY_IGNORABLE_RATIO) {
      console.log(chalk.yellow(`  Note: ${Math.round(ratio * 100)}% of changed files are build/VCS noise and were excluded. Use -i to refine or --no-default-ignores to include them.`));
    }

    if (filteredChanges.length === 0) {
      console.log(chalk.yellow('All files were filtered out by ignore patterns.'));
      return;
    }

    await this._processChangesInGroups(filteredChanges, false);
  }

  // A --context-file is per-run intent, not a code change. When it lives inside
  // the repo, --all would otherwise discover it as an untracked/modified file
  // and commit the note. Drop it from the change set so that never happens.
  private excludeContextFile(changes: FileChange[]): FileChange[] {
    if (!this.contextFilePath) return changes;

    const rel = relative(this.gitService.getRootDir(), this.contextFilePath);
    const filtered = changes.filter(change => change.path !== rel);

    if (filtered.length < changes.length) {
      console.log(chalk.gray(`  (excluded context file '${rel}' from grouping)`));
    }

    return filtered;
  }

  private async pushChanges(): Promise<void> {
    if (this.committedShas.length === 0) {
      console.log(chalk.gray('\nNo new commits to push.'));
      return;
    }

    const hasRemote = await this.gitService.hasRemote();

    if (!hasRemote) {
      console.log(chalk.yellow('\n⚠️  No remote repository configured. Skipping push.'));
      return;
    }

    const branch = await this.gitService.getCurrentBranch();
    console.log(chalk.blue(`Pushing ${this.committedShas.length} commit(s) to origin/${branch}`));

    try {
      await this.gitService.push();
      console.log(chalk.green('✓ Changes pushed successfully'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Failed to push changes. You may need to push manually.'));
      if (error instanceof Error) {
        console.log(chalk.gray(`   Reason: ${error.message}`));
      }
    }
  }

  private async showStatus(patternMatcher: PatternMatcher): Promise<void> {
    const stagedChanges = await this.gitService.getStagedChanges();
    const unstagedChanges = await this.gitService.getUnstagedChanges();
    const filteredUnstaged = patternMatcher.filterFiles(unstagedChanges);

    if (stagedChanges.length === 0 && filteredUnstaged.length === 0) {
      console.log(chalk.yellow('No changes found.\n'));
      return;
    }

    if (stagedChanges.length > 0) {
      console.log(chalk.green(`📦 Staged changes (${stagedChanges.length} file(s)):\n`));
      const groups = this.fileGrouper.optimizeGroups(this.fileGrouper.groupByPath(stagedChanges));
      for (const group of groups) {
        console.log(chalk.cyan(`  [${group.scope}]`));
        for (const file of group.files) {
          console.log(chalk.gray(`    ${file.status} ${file.path}`));
        }
      }
      console.log();
    }

    if (filteredUnstaged.length > 0) {
      console.log(chalk.red(`📝 Unstaged changes (${filteredUnstaged.length} file(s)):\n`));
      const groups = this.fileGrouper.optimizeGroups(this.fileGrouper.groupByPath(filteredUnstaged));
      for (const group of groups) {
        console.log(chalk.cyan(`  [${group.scope}]`));
        for (const file of group.files) {
          console.log(chalk.gray(`    ${file.status} ${file.path}`));
        }
      }
      console.log();
    }

    const ignoredCount = unstagedChanges.length - filteredUnstaged.length;
    if (ignoredCount > 0) {
      console.log(chalk.gray(`  (${ignoredCount} file(s) excluded by ignore patterns)\n`));
    }
  }
}
