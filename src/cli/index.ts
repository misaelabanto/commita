import type { CommitOptions } from '@/cli/commit-handler.ts';
import { CommitHandler } from '@/cli/commit-handler.ts';
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

  await program.parseAsync(process.argv);
}

