import type { CommitStyle, PromptStyle, Provider } from '@/config/config.types.ts';
import { existsSync } from 'fs';
import { readFile, writeFile, chmod } from 'fs/promises';
import { join } from 'path';

interface ConfigLine {
  type: 'comment' | 'blank' | 'config';
  content: string;
  key?: string;
  value?: string;
}

const VALID_KEYS = [
  'PROVIDER',
  'MODEL',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'COMMIT_STYLE',
  'PROMPT_STYLE',
  'PROMPT_TEMPLATE',
  'CUSTOM_PROMPT',
];

const VALID_PROVIDERS: Provider[] = ['openai', 'gemini'];
const VALID_COMMIT_STYLES: CommitStyle[] = ['conventional', 'emoji'];
const VALID_PROMPT_STYLES: PromptStyle[] = ['default', 'detailed', 'minimal', 'custom'];

export class ConfigWriter {
  async set(key: string, value: string, filePath: string): Promise<void> {
    this.validateKey(key);
    this.validateValue(key, value);

    const lines = await this.readConfigFile(filePath);
    const updatedLines = this.updateOrAddConfigLine(lines, key, value);
    await this.writeConfigFile(filePath, updatedLines);
  }

  private validateKey(key: string): void {
    const normalizedKey = key.toUpperCase();
    if (!VALID_KEYS.includes(normalizedKey)) {
      const availableKeys = VALID_KEYS.join(', ');
      throw new Error(`Unknown configuration key '${key}'\n\nAvailable keys: ${availableKeys}`);
    }
  }

  private validateValue(key: string, value: string): void {
    const normalizedKey = key.toUpperCase();

    switch (normalizedKey) {
      case 'PROVIDER':
        if (!VALID_PROVIDERS.includes(value as Provider)) {
          throw new Error(
            `Invalid value for PROVIDER\n  Expected: ${VALID_PROVIDERS.join(' or ')}\n  Received: ${value}`
          );
        }
        break;
      case 'COMMIT_STYLE':
        if (!VALID_COMMIT_STYLES.includes(value as CommitStyle)) {
          throw new Error(
            `Invalid value for COMMIT_STYLE\n  Expected: ${VALID_COMMIT_STYLES.join(' or ')}\n  Received: ${value}`
          );
        }
        break;
      case 'PROMPT_STYLE':
        if (!VALID_PROMPT_STYLES.includes(value as PromptStyle)) {
          throw new Error(
            `Invalid value for PROMPT_STYLE\n  Expected: ${VALID_PROMPT_STYLES.join(', ')}\n  Received: ${value}`
          );
        }
        break;
      case 'OPENAI_API_KEY':
        if (value.length < 10) {
          throw new Error(
            `API key for OPENAI_API_KEY appears to be invalid (too short: ${value.length} characters)`
          );
        }
        break;
      case 'GEMINI_API_KEY':
        if (value.length < 10) {
          throw new Error(
            `API key for GEMINI_API_KEY appears to be invalid (too short: ${value.length} characters)`
          );
        }
        break;
    }
  }

  private async readConfigFile(filePath: string): Promise<ConfigLine[]> {
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      return this.parseConfigLines(content);
    } catch (error) {
      throw new Error(`Could not read config file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseConfigLines(content: string): ConfigLine[] {
    const lines: ConfigLine[] = [];
    const contentLines = content.split('\n');

    for (const line of contentLines) {
      if (line.trim().startsWith('#')) {
        lines.push({
          type: 'comment',
          content: line,
        });
      } else if (line.trim() === '') {
        lines.push({
          type: 'blank',
          content: line,
        });
      } else {
        const trimmed = line.trim();
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim().toUpperCase();
          const value = trimmed.substring(eqIndex + 1).trim();
          lines.push({
            type: 'config',
            content: line,
            key,
            value,
          });
        }
      }
    }

    return lines;
  }

  private updateOrAddConfigLine(lines: ConfigLine[], key: string, value: string): ConfigLine[] {
    const normalizedKey = key.toUpperCase();
    const existingIndex = lines.findIndex(
      (line) => line.type === 'config' && line.key === normalizedKey
    );

    if (existingIndex >= 0) {
      lines[existingIndex] = {
        type: 'config',
        content: `${normalizedKey}=${value}`,
        key: normalizedKey,
        value,
      };
    } else {
      lines.push({
        type: 'config',
        content: `${normalizedKey}=${value}`,
        key: normalizedKey,
        value,
      });
    }

    return lines;
  }

  private async writeConfigFile(filePath: string, lines: ConfigLine[]): Promise<void> {
    let content: string;

    if (lines.length === 0) {
      content = this.createDefaultConfig();
    } else {
      content = lines.map((line) => line.content).join('\n');
      if (content && !content.endsWith('\n')) {
        content += '\n';
      }
    }

    try {
      await writeFile(filePath, content, 'utf-8');
      // Set file permissions to 0600 (owner read/write only)
      await chmod(filePath, 0o600);
    } catch (error) {
      throw new Error(
        `Could not write config file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private createDefaultConfig(): string {
    return `# Commita Configuration
# https://github.com/misaelabanto/commita

# AI Provider: openai or gemini
# PROVIDER=openai

# Model name (provider-specific)
# MODEL=gpt-4o-mini

# Prompt style: default, detailed, minimal, or custom
# PROMPT_STYLE=default

# Commit message style: conventional or emoji
# COMMIT_STYLE=conventional

# API Keys - set the key for your chosen provider
# OPENAI_API_KEY=your-openai-api-key-here
# GEMINI_API_KEY=your-gemini-api-key-here
`;
  }
}
