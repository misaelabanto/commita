export type CommitStyle = 'conventional' | 'emoji';
export type PromptStyle = 'default' | 'detailed' | 'minimal' | 'custom';

export interface CommitaConfig {
  model: string;
  promptStyle: PromptStyle;
  promptTemplate?: string;
  customPrompt?: string;
  commitStyle: CommitStyle;
  openaiApiKey?: string;
}

export const DEFAULT_CONFIG: CommitaConfig = {
  model: 'gpt-4o-mini',
  promptStyle: 'default',
  commitStyle: 'conventional',
};

