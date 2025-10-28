import { OpenAIService } from '@/ai/openai.service.ts';
import type { CommitaConfig } from '@/config/config.types.ts';
import { FileGrouper } from '@/git/file-grouper.ts';
import type { FileChange } from '@/git/git.service.ts';
import { GitService } from '@/git/git.service.ts';
import { PatternMatcher } from '@/utils/pattern-matcher.ts';
import chalk from 'chalk';

export interface CommitOptions {
  all: boolean;
  ignore: string;
  push: boolean;
  config?: string;
}

export class CommitHandler {
  private gitService: GitService;
  private fileGrouper: FileGrouper;
  private aiService: OpenAIService;
  private config: CommitaConfig;

  constructor(config: CommitaConfig) {
    this.config = config;
    this.gitService = new GitService();
    this.fileGrouper = new FileGrouper();
    this.aiService = new OpenAIService(config);
  }

  async execute(options: CommitOptions): Promise<void> {
    console.log(chalk.blue('🤖 Commita - AI-powered auto-commit\n'));

    const patternMatcher = new PatternMatcher(
      PatternMatcher.parsePatterns(options.ignore)
    );

    try {
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
        console.log(chalk.yellow('📦 Found staged changes. Processing them first...\n'));
        await this.processStagedChanges(stagedChanges);
      } else if (stagedChanges.length > 0 && options.all) {
        console.log(chalk.yellow('⚠️  Ignoring staged changes due to --all flag\n'));
      }

      if (options.all) {
        await this.processAllChanges(patternMatcher);
      }

      if (options.push) {
        await this.pushChanges();
      }

      console.log(chalk.green('\n✨ Done!\n'));
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      } else {
        console.error(chalk.red('\n❌ An unknown error occurred\n'));
      }
      process.exit(1);
    }
  }

  private async processStagedChanges(stagedChanges: FileChange[]): Promise<void> {
    const files = stagedChanges.map(f => f.path);
    const diff = await this.gitService.getDiff(files, true);

    if (!diff) {
      console.log(chalk.yellow('No diff found for staged files. Skipping...'));
      return;
    }

    console.log(chalk.cyan(`Generating commit message for ${files.length} staged file(s)...`));

    const scope = this.extractScopeFromFiles(files);
    const message = await this.aiService.generateCommitMessage(diff, files, scope);

    console.log(chalk.gray('\nCommit message:'));
    console.log(chalk.white(message));
    console.log();

    await this.gitService.commit(message);
    console.log(chalk.green('✓ Committed staged changes\n'));
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

    const groups = this.fileGrouper.groupByPath(filteredChanges);
    const optimizedGroups = this.fileGrouper.optimizeGroups(groups);

    console.log(chalk.blue(`Found ${optimizedGroups.length} group(s) of changes:\n`));

    for (const [index, group] of optimizedGroups.entries()) {
      console.log(chalk.cyan(`\n[${index + 1}/${optimizedGroups.length}] Processing: ${group.scope}`));
      console.log(chalk.gray(`Files: ${group.files.map(f => f.path).join(', ')}\n`));

      const files = group.files.map(f => f.path);
      const diff = await this.gitService.getDiff(files, false);

      if (!diff) {
        console.log(chalk.yellow('  No diff found. Skipping...'));
        continue;
      }

      console.log(chalk.cyan('  Generating commit message...'));
      const message = await this.aiService.generateCommitMessage(diff, files, group.scope);

      console.log(chalk.gray('  Commit message:'));
      console.log(chalk.white(`  ${message.replace(/\n/g, '\n  ')}`));
      console.log();

      await this.gitService.stageFiles(files);
      await this.gitService.commit(message);
      console.log(chalk.green(`  ✓ Committed ${files.length} file(s)`));
    }
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

