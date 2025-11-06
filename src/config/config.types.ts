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
}

export const DEFAULT_CONFIG: CommitaConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  promptStyle: 'default',
  commitStyle: 'conventional',
};

