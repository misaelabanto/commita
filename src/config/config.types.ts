export type CommitStyle = 'conventional' | 'emoji';
export type PromptStyle = 'default' | 'detailed' | 'minimal' | 'custom';
export type Provider = 'openai' | 'gemini';

export interface CommitaConfig {
  provider: Provider;
  model: string;
  promptStyle: PromptStyle;
  promptTemplate?: string;
  customPrompt?: string;
  commitStyle: CommitStyle;
  openaiApiKey?: string;
  geminiApiKey?: string;
  groupDepth: number;
  maxFilesPerGroup: number;
  atomic: boolean;
  requireCleanIndex: boolean;
  confirmThreshold: number;
  defaultIgnores: boolean;
}

export const DEFAULT_CONFIG: CommitaConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  promptStyle: 'default',
  commitStyle: 'conventional',
  groupDepth: 2,
  maxFilesPerGroup: 0,
  atomic: false,
  requireCleanIndex: false,
  confirmThreshold: 100,
  defaultIgnores: true,
};

