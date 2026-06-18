import type { CommitOptions } from '@/cli/commit-handler.ts';
import { CommitAbortError, CommitHandler } from '@/cli/commit-handler.ts';
import type { SetOptions } from '@/cli/set-handler.ts';
import { SetHandler } from '@/cli/set-handler.ts';
import { ConfigLoader } from '@/config/config.loader.ts';
import chalk from 'chalk';
import { Command, InvalidArgumentError } from 'commander';
import packageJson from '../../package.json' with { type: 'json' };

function parseIntOption(min: number) {
  return (value: string): number => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < min) {
      throw new InvalidArgumentError(`must be an integer >= ${min}`);
    }
    return parsed;
  };
}

export async function runCLI() {
  const program = new Command();

  program
    .name('commita')
    .description('AI-powered git auto-commit tool')
    .version(packageJson.version, '-v, --version', 'Show version number')
    .option('-a, --all', 'Process all changes grouped by folders', false)
    .option('-i, --ignore <patterns>', 'Comma-separated glob patterns to exclude (e.g. "dumps,*.log,dist/*")', '')
    .option('--no-push', 'Skip pushing after commit')
    .option('--no-verify', 'Bypass git pre-commit and commit-msg hooks')
    .option('-c, --config <path>', 'Path to custom config file')
    .option('-d, --dry-run', 'Show commit groups and messages without committing', false)
    .option('-s, --status', 'Show a summary of staged and unstaged changes', false)
    .option('--depth <n>', 'Grouping depth for files outside a detected project', parseIntOption(1))
    .option('--max-files-per-group <n>', 'Auto-split groups larger than n (0 = off)', parseIntOption(0))
    .option('--atomic', 'Roll back all commits from this run if any group fails', false)
    .option('--require-clean-index', 'Abort if the index has pre-staged changes when using --all', false)
    .option('-x, --context <text>', 'Free-text intent passed to the LLM alongside the diff for every group')
    .option('--context-file <path>', 'Read --context from a file (mutually exclusive with --context)')
    .option('-y, --yes', 'Skip confirmation prompts for large or pushed runs', false)
    .option('--confirm-threshold <n>', 'File count at/above which confirmation is required', parseIntOption(1))
    .option('--no-default-ignores', 'Disable the built-in build/VCS-noise grouping ignore set')
    .action(async (options: CommitOptions) => {
      try {
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(options.config);

        const handler = new CommitHandler(config);
        await handler.execute(options);
      } catch (error) {
        if (error instanceof CommitAbortError) {
          process.exit(error.code);
        }
        if (error instanceof Error) {
          console.error(chalk.red(`\n❌ Fatal error: ${error.message}\n`));
        } else {
          console.error(chalk.red('\n❌ An unknown fatal error occurred\n'));
        }
        process.exit(1);
      }
    });

  program
    .command('set <key-value>')
    .description('Set configuration value (format: KEY=value or KEY to prompt)')
    .option('-l, --local', 'Set in project .commita file instead of global ~/.commita')
    .action(async (keyValue: string, options: SetOptions) => {
      try {
        const handler = new SetHandler();
        await handler.execute(keyValue, options);
      } catch (error) {
        if (error instanceof Error) {
          console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
        } else {
          console.error(chalk.red('\n❌ An unknown error occurred\n'));
        }
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

