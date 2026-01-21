import type { CommitOptions } from '@/cli/commit-handler.ts';
import { CommitHandler } from '@/cli/commit-handler.ts';
import type { SetOptions } from '@/cli/set-handler.ts';
import { SetHandler } from '@/cli/set-handler.ts';
import { ConfigLoader } from '@/config/config.loader.ts';
import chalk from 'chalk';
import { Command } from 'commander';
import packageJson from '../../package.json' with { type: 'json' };

export async function runCLI() {
  const program = new Command();

  program
    .name('commita')
    .description('AI-powered git auto-commit tool')
    .version(packageJson.version, '-v, --version', 'Show version number')
    .option('-a, --all', 'Process all changes grouped by folders', false)
    .option('-i, --ignore <patterns>', 'Comma-separated patterns to exclude', '')
    .option('--no-push', 'Skip pushing after commit')
    .option('-c, --config <path>', 'Path to custom config file')
    .action(async (options: CommitOptions) => {
      try {
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(options.config);

        const handler = new CommitHandler(config);
        await handler.execute(options);
      } catch (error) {
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

