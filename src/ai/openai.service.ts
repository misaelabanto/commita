import { CommitTypeAnalyzer } from '@/ai/commit-type-analyzer.ts';
import { EmojiMapper } from '@/ai/emoji-mapper.ts';
import type { CommitaConfig } from '@/config/config.types.ts';
import { PROMPT_TEMPLATES } from '@/config/prompt-templates.ts';
import OpenAI from 'openai';

export class OpenAIService {
  private client: OpenAI;
  private config: CommitaConfig;
  private typeAnalyzer: CommitTypeAnalyzer;
  private emojiMapper: EmojiMapper;

  constructor(config: CommitaConfig) {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key is required. Set it in .commita file or OPENAI_API_KEY env var.');
    }

    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.config = config;
    this.typeAnalyzer = new CommitTypeAnalyzer();
    this.emojiMapper = new EmojiMapper();
  }

  async generateCommitMessage(diff: string, files: string[], scope: string): Promise<string> {
    const prompt = this.buildPrompt(diff);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates concise git commit messages. The response should be plain text without any markdown formatting.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      let message = completion.choices[0]?.message?.content?.replace(/^```\n*((.*\n*)+)```$/, '$1').trim() || '';

      if (!message) {
        const commitType = this.typeAnalyzer.analyzeFromDiff(diff, files);
        message = `${commitType}(${scope}): update files`;
      }

      if (this.config.commitStyle === 'emoji') {
        message = this.emojiMapper.replaceTypeWithEmoji(message);
      }

      return message;
    } catch (error) {
      console.error('Error generating commit message:', error);
      const commitType = this.typeAnalyzer.analyzeFromDiff(diff, files);
      let fallbackMessage = `${commitType}(${scope}): update files`;

      if (this.config.commitStyle === 'emoji') {
        fallbackMessage = this.emojiMapper.replaceTypeWithEmoji(fallbackMessage);
      }

      return fallbackMessage;
    }
  }

  private buildPrompt(diff: string): string {
    let template: string;

    if (this.config.promptStyle === 'custom') {
      template = this.config.customPrompt || this.config.promptTemplate || PROMPT_TEMPLATES.default;
    } else {
      template = PROMPT_TEMPLATES[this.config.promptStyle];
    }

    return template.replace('{diff}', this.truncateDiff(diff));
  }

  private truncateDiff(diff: string, maxLength: number = 8000): string {
    if (diff.length <= maxLength) {
      return diff;
    }

    const lines = diff.split('\n');
    const truncated: string[] = [];
    let currentLength = 0;

    for (const line of lines) {
      if (currentLength + line.length > maxLength) {
        truncated.push('\n... (diff truncated for brevity) ...');
        break;
      }
      truncated.push(line);
      currentLength += line.length + 1;
    }

    return truncated.join('\n');
  }
}

