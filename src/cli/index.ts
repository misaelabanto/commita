import type { CommitOptions } from '@/cli/commit-handler.ts';
import { CommitAbortError, CommitHandler } from '@/cli/commit-handler.ts';
import type { SetOptions } from '@/cli/set-handler.ts';
import { SetHandler } from '@/cli/set-handler.ts';
import {
  HARNESS_DISPLAY_NAMES,
  type HarnessName,
  type SkillInstallOptions,
  SkillsHandler,
  SUPPORTED_HARNESSES,
} from '@/cli/skills-handler.ts';
import * as prompts from '@clack/prompts';
import { ConfigLoader } from '@/config/config.loader.ts';
import type { GroupBy } from '@/config/config.types.ts';
import { GROUP_BY_MODES } from '@/config/config.types.ts';
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

function parseGroupByOption(value: string): GroupBy {
  const normalized = value.trim().toLowerCase();
  const mode = GROUP_BY_MODES.find(candidate => candidate === normalized);

  if (!mode) {
    throw new InvalidArgumentError(`must be one of: ${GROUP_BY_MODES.join(', ')}`);
  }

  return mode;
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
    .option('--group-by <mode>', `How files are split into commits: ${GROUP_BY_MODES.join(' or ')}`, parseGroupByOption)
    .option('--single', 'Commit every change as one commit, skipping grouping entirely', false)
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

  program
    .command('skills')
    .description('Manage Commita skills for coding agents')
    .command('install')
    .description('Install the Commita skill for Codex and compatible agents')
    .option('-a, --agent <agents...>', 'Harnesses to install to (for example: codex claude-code)')
    .option('-y, --yes', 'Install to all detected harnesses without prompting')
    .option('-f, --force', 'Replace an existing Commita skill')
    .action(async (options: Omit<SkillInstallOptions, 'agents'> & { agent?: string[]; yes?: boolean }) => {
      try {
        const handler = new SkillsHandler();
        const agents = await selectHarnesses(handler, options.agent, options.yes ?? false);
        if (!agents) {
          return;
        }
        const installation = await handler.install({ agents, force: options.force });
        const action = installation.replacedExistingSkill ? 'updated' : 'installed';

        console.log(chalk.green(`\n✓ Commita skill ${action} for ${agents.join(', ')}\n`));
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

async function selectHarnesses(
  handler: SkillsHandler,
  requestedHarnesses: string[] | undefined,
  skipPrompt: boolean,
): Promise<string[] | undefined> {
  if (requestedHarnesses && requestedHarnesses.length > 0) {
    return requestedHarnesses;
  }

  const detectedHarnesses = await handler.detectInstalledHarnesses();
  if (skipPrompt) {
    if (detectedHarnesses.length === 0) {
      throw new Error('No installed harnesses were detected. Pass --agent to select one explicitly.');
    }
    return detectedHarnesses;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('No interactive terminal is available. Pass --agent to select a harness.');
  }

  const selectedHarnesses = await prompts.multiselect({
    message: 'Which harnesses do you want to install to?',
    options: SUPPORTED_HARNESSES.map(harness => ({
      value: harness,
      label: HARNESS_DISPLAY_NAMES[harness],
    })),
    initialValues: detectedHarnesses,
    required: true,
  });

  if (prompts.isCancel(selectedHarnesses)) {
    prompts.cancel('Skill installation cancelled.');
    return undefined;
  }

  return selectedHarnesses as HarnessName[];
}
