import { AIService } from '@/ai/ai.service.ts';
import type { CommitaConfig } from '@/config/config.types.ts';
import { FileGrouper } from '@/git/file-grouper.ts';
import type { FileChange } from '@/git/git.service.ts';
import { GitService } from '@/git/git.service.ts';
import { ProjectDetector } from '@/git/project-detector.ts';
import { PatternMatcher } from '@/utils/pattern-matcher.ts';
import chalk from 'chalk';

export interface CommitOptions {
  all: boolean;
  ignore: string;
  push: boolean;
  verify: boolean;
  config?: string;
  dryRun: boolean;
  status: boolean;
}

export class CommitHandler {
  private gitService: GitService;
  private fileGrouper: FileGrouper;
  private aiService: AIService;
  private config: CommitaConfig;
  private noVerify: boolean = false;
  private dryRun: boolean = false;

  constructor(config: CommitaConfig) {
    this.config = config;
    this.gitService = new GitService();
    this.fileGrouper = new FileGrouper();
    this.aiService = new AIService(config);
  }

  async execute(options: CommitOptions): Promise<void> {
    console.log(chalk.blue('🤖 Commita - AI-powered auto-commit\n'));

    this.noVerify = !options.verify;
    this.dryRun = options.dryRun;

    await this.gitService.init();

    const boundaries = ProjectDetector.detect(this.gitService.getRootDir());
    this.fileGrouper = new FileGrouper(boundaries);

    const patternMatcher = new PatternMatcher(
      PatternMatcher.parsePatterns(options.ignore)
    );

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
        process.exit(1);
      }

      if (stagedChanges.length > 0 && !options.all) {
        console.log(chalk.yellow('📦 Found staged changes. Grouping and processing them...\n'));
        await this.processGroupedStagedChanges(stagedChanges);
      } else if (stagedChanges.length > 0 && options.all) {
        console.log(chalk.yellow('⚠️  Ignoring staged changes due to --all flag\n'));
      }

      if (options.all) {
        await this.processAllChanges(patternMatcher);
      }

      if (options.push && !this.dryRun) {
        await this.pushChanges();
      }

      if (this.dryRun) {
        console.log(chalk.yellow('\n🏃 Dry run complete — no changes were committed or pushed.\n'));
      } else {
        console.log(chalk.green('\n✨ Done!\n'));
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      } else {
        console.error(chalk.red('\n❌ An unknown error occurred\n'));
      }
      process.exit(1);
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
      const message = await this.aiService.generateCommitMessage(diff, files, group.scope);

      console.log(chalk.gray('  Commit message:'));
      console.log(chalk.white(`  ${message.replace(/\n/g, '\n  ')}`));
      console.log();

      if (this.dryRun) {
        console.log(chalk.yellow(`  ⏭ Dry run — skipped committing ${files.length} file(s)`));
      } else {
        await this.gitService.stageFiles(files);
        await this.gitService.commit(message, { noVerify: this.noVerify });
        console.log(chalk.green(`  \u2713 Committed ${files.length} ${isStaged ? 'staged' : 'unstaged'} file(s)`));
      }
    }
  }

  private async processGroupedStagedChanges(stagedChanges: FileChange[]): Promise<void> {
    await this._processChangesInGroups(stagedChanges, true);
  }

  private async processAllChanges(patternMatcher: PatternMatcher): Promise<void> {
    const unstagedChanges = await this.gitService.getUnstagedChanges();

    if (unstagedChanges.length === 0) {
      console.log(chalk.yellow('No unstaged changes found.'));
      return;
    }

    const filteredChanges = patternMatcher.filterFiles(unstagedChanges);

    if (filteredChanges.length === 0) {
      console.log(chalk.yellow('All files were filtered out by ignore patterns.'));
      return;
    }

    await this._processChangesInGroups(filteredChanges, false);
  }

  private async pushChanges(): Promise<void> {
    const hasRemote = await this.gitService.hasRemote();

    if (!hasRemote) {
      console.log(chalk.yellow('\n⚠️  No remote repository configured. Skipping push.'));
      return;
    }

    console.log(chalk.blue('\n📤 Pushing changes...'));

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

  private extractScopeFromFiles(files: string[]): string {
    if (files.length === 0) return 'root';

    const firstFile = files[0];
    if (!firstFile) return 'root';

    const parts = firstFile.split('/');

    if (parts.length === 1) return 'root';
    if (parts.length === 2) return parts[0] || 'root';

    const commonDirs = ['src', 'lib', 'app'];
    const srcIndex = parts.findIndex(p => commonDirs.includes(p));

    if (srcIndex !== -1 && srcIndex + 1 < parts.length) {
      return parts[srcIndex + 1] || 'root';
    }

    return parts[0] || 'root';
  }
}

