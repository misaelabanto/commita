import { CommitTypeAnalyzer } from '@/ai/commit-type-analyzer.ts';
import { EmojiMapper } from '@/ai/emoji-mapper.ts';
import type { CommitaConfig } from '@/config/config.types.ts';
import { applyContext, GROUPING_PROMPT, PROMPT_TEMPLATES } from '@/config/prompt-templates.ts';
import type { ProposedGroup } from '@/ai/semantic-grouper.ts';
import { parseGroupsResponse } from '@/ai/semantic-grouper.ts';
import type { FileChange } from '@/git/git.service.ts';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

/** Diff budget for the grouping call: larger than a per-group message needs. */
const GROUPING_DIFF_LIMIT = 24000;

/** Output budget for the grouping call. A long file list must not truncate. */
const GROUPING_MAX_TOKENS = 4000;

export class AIService {
  private config: CommitaConfig;
  private typeAnalyzer: CommitTypeAnalyzer;
  private emojiMapper: EmojiMapper;

  constructor(config: CommitaConfig) {
    this.config = config;
    this.typeAnalyzer = new CommitTypeAnalyzer();
    this.emojiMapper = new EmojiMapper();

    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.provider === 'openai' && !this.config.openaiApiKey) {
      throw new Error('OpenAI API key is required. Set it in .commita file or OPENAI_API_KEY env var.');
    }

    if (this.config.provider === 'gemini' && !this.config.geminiApiKey) {
      throw new Error('Gemini API key is required. Set it in .commita file or GEMINI_API_KEY env var.');
    }
  }

  async generateCommitMessage(diff: string, files: string[], scope: string, context?: string): Promise<string> {
    const prompt = this.buildPrompt(diff, context);

    try {
      const provider = this.getProvider();
      const model = provider(this.config.model);

      const { text } = await generateText({
        model,
        system: 'You are a helpful assistant that generates concise git commit messages. The response should be plain text without any markdown formatting.',
        prompt,
        temperature: 0.7,
        maxTokens: 500,
      });

      let message = text.replace(/^```\n*((.*\n*)+)```$/, '$1').trim() || '';

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

  /**
   * Ask the model to split the change set into logically complete groups.
   *
   * Returns null on any failure (provider error, unparseable response) so the
   * caller can fall back to folder grouping instead of aborting the run.
   */
  async generateFileGroups(diff: string, files: FileChange[], context?: string): Promise<ProposedGroup[] | null> {
    const fileList = files.map(file => `${file.status} ${file.path}`).join('\n');
    const prompt = applyContext(
      GROUPING_PROMPT.replace('{files}', fileList).replace('{diff}', this.truncateDiff(diff, GROUPING_DIFF_LIMIT)),
      context,
    );

    try {
      const provider = this.getProvider();
      const model = provider(this.config.model);

      const { text } = await generateText({
        model,
        system: 'You group changed files into git commits. You respond with JSON only, no markdown formatting and no commentary.',
        prompt,
        temperature: 0.2,
        maxOutputTokens: GROUPING_MAX_TOKENS,
      });

      return parseGroupsResponse(text);
    } catch (error) {
      console.error('Error generating file groups:', error);
      return null;
    }
  }

  private getProvider() {
    if (this.config.provider === 'gemini') {
      if (this.config.geminiApiKey) {
        return createGoogleGenerativeAI({
          apiKey: this.config.geminiApiKey,
        });
      }
      return google;
    }

    if (this.config.openaiApiKey) {
      return createOpenAI({
        apiKey: this.config.openaiApiKey,
      });
    }

    return openai;
  }

  private buildPrompt(diff: string, context?: string): string {
    let template: string;

    if (this.config.promptStyle === 'custom') {
      template = this.config.customPrompt || this.config.promptTemplate || PROMPT_TEMPLATES.default;
    } else {
      template = PROMPT_TEMPLATES[this.config.promptStyle];
    }

    const prompt = template.replace('{diff}', this.truncateDiff(diff));
    return applyContext(prompt, context);
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

