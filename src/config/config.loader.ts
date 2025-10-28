import type { CommitaConfig, CommitStyle, PromptStyle } from '@/config/config.types.ts';
import { DEFAULT_CONFIG } from '@/config/config.types.ts';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

export class ConfigLoader {
  async load(configPath?: string): Promise<CommitaConfig> {
    const fileConfig = await this.loadFromFile(configPath);
    const envConfig = this.loadFromEnv();

    return {
      ...DEFAULT_CONFIG,
      ...fileConfig,
      ...envConfig,
    };
  }

  private async loadFromFile(configPath?: string): Promise<Partial<CommitaConfig>> {
    const path = configPath || join(process.cwd(), '.commita');

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
      }
    }

    return config;
  }

  private loadFromEnv(): Partial<CommitaConfig> {
    const config: Partial<CommitaConfig> = {};

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

    return config;
  }
}

