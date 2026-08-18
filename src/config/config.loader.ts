import type { CommitaConfig, CommitStyle, GroupBy, PromptStyle, Provider } from '@/config/config.types.ts';
import { DEFAULT_CONFIG, GROUP_BY_MODES } from '@/config/config.types.ts';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import simpleGit from 'simple-git';

export class ConfigLoader {
  async load(configPath?: string): Promise<CommitaConfig> {
    const globalConfig = await this.loadFromFile(this.getGlobalConfigPath());
    const fileConfig = await this.loadFromFile(configPath);
    const envConfig = this.loadFromEnv();

    return {
      ...DEFAULT_CONFIG,
      ...globalConfig,
      ...fileConfig,
      ...envConfig,
    };
  }

  private getGlobalConfigPath(): string {
    return join(homedir(), '.commita');
  }

  private async loadFromFile(configPath?: string): Promise<Partial<CommitaConfig>> {
    let path = configPath;

    if (!path) {
      const cwdPath = join(process.cwd(), '.commita');
      if (existsSync(cwdPath)) {
        path = cwdPath;
      } else {
        const gitRoot = await this.findGitRoot();
        if (gitRoot) {
          const rootPath = join(gitRoot, '.commita');
          if (existsSync(rootPath)) {
            path = rootPath;
          }
        }
      }
    }

    // Fallback to default check if we still haven't found it or if it was explicitly provided
    if (!path) {
      path = join(process.cwd(), '.commita');
    }

    if (!existsSync(path)) {
      return {};
    }

    try {
      const content = await readFile(path, 'utf-8');
      return this.parseKeyValue(content);
    } catch (error) {
      console.warn(`Warning: Could not read config file at ${path}`);
      return {};
    }
  }

  private async findGitRoot(): Promise<string | null> {
    try {
      const git = simpleGit();
      const root = await git.revparse(['--show-toplevel']);
      return root.trim();
    } catch {
      return null;
    }
  }

  private parseKeyValue(content: string): Partial<CommitaConfig> {
    const config: Partial<CommitaConfig> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      if (!key || valueParts.length === 0) continue;

      const value = valueParts.join('=').trim();
      const normalizedKey = key.trim().toUpperCase();

      switch (normalizedKey) {
        case 'PROVIDER':
          config.provider = value as Provider;
          break;
        case 'MODEL':
          config.model = value;
          break;
        case 'PROMPT_STYLE':
          config.promptStyle = value as PromptStyle;
          break;
        case 'PROMPT_TEMPLATE':
          config.promptTemplate = value;
          break;
        case 'CUSTOM_PROMPT':
          config.customPrompt = value;
          break;
        case 'COMMIT_STYLE':
          config.commitStyle = value as CommitStyle;
          break;
        case 'OPENAI_API_KEY':
          config.openaiApiKey = value;
          break;
        case 'GEMINI_API_KEY':
          config.geminiApiKey = value;
          break;
        case 'GROUP_BY': {
          const mode = parseGroupBy(value);
          if (mode) config.groupBy = mode;
          break;
        }
        case 'GROUP_DEPTH': {
          const n = parseInt(value, 10);
          if (!Number.isNaN(n)) config.groupDepth = n;
          break;
        }
        case 'MAX_FILES_PER_GROUP': {
          const n = parseInt(value, 10);
          if (!Number.isNaN(n)) config.maxFilesPerGroup = n;
          break;
        }
        case 'CONFIRM_THRESHOLD': {
          const n = parseInt(value, 10);
          if (!Number.isNaN(n)) config.confirmThreshold = n;
          break;
        }
        case 'ATOMIC':
          config.atomic = value.toLowerCase() === 'true';
          break;
        case 'REQUIRE_CLEAN_INDEX':
          config.requireCleanIndex = value.toLowerCase() === 'true';
          break;
        case 'DEFAULT_IGNORES':
          config.defaultIgnores = value.toLowerCase() === 'true';
          break;
      }
    }

    return config;
  }

  private loadFromEnv(): Partial<CommitaConfig> {
    const config: Partial<CommitaConfig> = {};

    if (process.env.COMMITA_PROVIDER) {
      config.provider = process.env.COMMITA_PROVIDER as Provider;
    }
    if (process.env.COMMITA_MODEL) {
      config.model = process.env.COMMITA_MODEL;
    }
    if (process.env.COMMITA_PROMPT_STYLE) {
      config.promptStyle = process.env.COMMITA_PROMPT_STYLE as PromptStyle;
    }
    if (process.env.COMMITA_PROMPT_TEMPLATE) {
      config.promptTemplate = process.env.COMMITA_PROMPT_TEMPLATE;
    }
    if (process.env.COMMITA_CUSTOM_PROMPT) {
      config.customPrompt = process.env.COMMITA_CUSTOM_PROMPT;
    }
    if (process.env.COMMITA_COMMIT_STYLE) {
      config.commitStyle = process.env.COMMITA_COMMIT_STYLE as CommitStyle;
    }
    if (process.env.OPENAI_API_KEY) {
      config.openaiApiKey = process.env.OPENAI_API_KEY;
    }
    if (process.env.GEMINI_API_KEY) {
      config.geminiApiKey = process.env.GEMINI_API_KEY;
    }
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && !config.geminiApiKey) {
      config.geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }
    if (process.env.COMMITA_GROUP_BY) {
      const mode = parseGroupBy(process.env.COMMITA_GROUP_BY);
      if (mode) config.groupBy = mode;
    }
    if (process.env.COMMITA_GROUP_DEPTH) {
      const n = parseInt(process.env.COMMITA_GROUP_DEPTH, 10);
      if (!Number.isNaN(n)) config.groupDepth = n;
    }
    if (process.env.COMMITA_MAX_FILES_PER_GROUP) {
      const n = parseInt(process.env.COMMITA_MAX_FILES_PER_GROUP, 10);
      if (!Number.isNaN(n)) config.maxFilesPerGroup = n;
    }
    if (process.env.COMMITA_CONFIRM_THRESHOLD) {
      const n = parseInt(process.env.COMMITA_CONFIRM_THRESHOLD, 10);
      if (!Number.isNaN(n)) config.confirmThreshold = n;
    }
    if (process.env.COMMITA_ATOMIC) {
      config.atomic = process.env.COMMITA_ATOMIC.toLowerCase() === 'true';
    }
    if (process.env.COMMITA_REQUIRE_CLEAN_INDEX) {
      config.requireCleanIndex = process.env.COMMITA_REQUIRE_CLEAN_INDEX.toLowerCase() === 'true';
    }
    if (process.env.COMMITA_DEFAULT_IGNORES) {
      config.defaultIgnores = process.env.COMMITA_DEFAULT_IGNORES.toLowerCase() === 'true';
    }

    return config;
  }
}

/**
 * Accept a grouping mode only when it is one of the known modes. An unknown
 * value is ignored (leaving the folder default in place) rather than cast
 * blindly, because a bad value here would silently change how files are split
 * into commits.
 */
function parseGroupBy(value: string): GroupBy | undefined {
  const normalized = value.trim().toLowerCase();
  const mode = GROUP_BY_MODES.find(candidate => candidate === normalized);

  if (!mode) {
    console.warn(`Warning: unknown grouping mode '${value}', using '${DEFAULT_CONFIG.groupBy}'.`);
    return undefined;
  }

  return mode;
}
