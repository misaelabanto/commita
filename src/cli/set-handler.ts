import { ConfigWriter } from '@/config/config.writer.ts';
import chalk from 'chalk';
import { createInterface } from 'readline';
import { homedir } from 'os';
import { join } from 'path';

export interface SetOptions {
  local?: boolean;
}

const SENSITIVE_KEYS = ['OPENAI_API_KEY', 'GEMINI_API_KEY'];

export class SetHandler {
  private configWriter: ConfigWriter;

  constructor() {
    this.configWriter = new ConfigWriter();
  }

  async execute(keyValue: string, options: SetOptions): Promise<void> {
    const { key, value } = this.parseKeyValue(keyValue);

    let finalValue = value;
    if (!finalValue) {
      finalValue = await this.promptForValue(key);
    }

    const configPath = this.getConfigPath(options.local || false);
    await this.configWriter.set(key, finalValue, configPath);

    console.log(chalk.green('\n✓ Configuration updated successfully'));
    console.log(`  ${chalk.cyan(key)}=${chalk.green(this.maskSensitiveValue(key, finalValue))} set in ${chalk.gray(configPath)}\n`);
  }

  private parseKeyValue(keyValue: string): { key: string; value?: string } {
    const eqIndex = keyValue.indexOf('=');

    if (eqIndex === -1) {
      // No value provided, will prompt interactively
      return {
        key: keyValue.trim(),
        value: undefined,
      };
    }

    const key = keyValue.substring(0, eqIndex).trim();
    const value = keyValue.substring(eqIndex + 1).trim();

    if (!key) {
      throw new Error('Key cannot be empty');
    }

    return { key, value };
  }

  private getConfigPath(isLocal: boolean): string {
    if (isLocal) {
      return join(process.cwd(), '.commita');
    }
    return join(homedir(), '.commita');
  }

  private async promptForValue(key: string): Promise<string> {
    if (!process.stdin.isTTY) {
      throw new Error(`Value required for key '${key}'. Use format: commita set KEY=value`);
    }

    const isSensitive = this.isSensitiveKey(key);
    const prompt = `Enter value for ${chalk.cyan(key)}${isSensitive ? ' (hidden)' : ''}: `;

    return new Promise((resolve, reject) => {
      const readline = createInterface({
        input: process.stdin,
        output: isSensitive ? process.stderr : process.stdout,
        terminal: true,
      });

      if (isSensitive) {
        // Hide input for sensitive keys
        process.stdin.setRawMode?.(true);
        process.stderr.write(prompt);
      } else {
        readline.question(prompt, () => {});
      }

      let value = '';

      process.stdin.on('data', (buffer) => {
        const char = buffer.toString();

        if (char === '\n' || char === '\r') {
          if (isSensitive) {
            process.stdin.setRawMode?.(false);
            process.stderr.write('\n');
          }
          readline.close();
          resolve(value);
        } else if (char === '\u0003') {
          // Handle Ctrl+C
          if (isSensitive) {
            process.stdin.setRawMode?.(false);
          }
          readline.close();
          reject(new Error('Input cancelled'));
        } else if (char === '\u007f') {
          // Handle backspace
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      });

      readline.once('close', () => {
        if (!value) {
          reject(new Error('No value provided'));
        }
      });
    });
  }

  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEYS.includes(key.toUpperCase());
  }

  private maskSensitiveValue(key: string, value: string): string {
    if (!this.isSensitiveKey(key)) {
      return value;
    }
    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  }
}
