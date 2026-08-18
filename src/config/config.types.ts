export type CommitStyle = 'conventional' | 'emoji';
export type PromptStyle = 'default' | 'detailed' | 'minimal' | 'custom';
export type Provider = 'openai' | 'gemini';
export type GroupBy = 'folder' | 'semantic';

export const GROUP_BY_MODES: GroupBy[] = ['folder', 'semantic'];

export interface CommitaConfig {
  provider: Provider;
  model: string;
  promptStyle: PromptStyle;
  promptTemplate?: string;
  customPrompt?: string;
  commitStyle: CommitStyle;
  openaiApiKey?: string;
  geminiApiKey?: string;
  groupBy: GroupBy;
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
  groupBy: 'folder',
  groupDepth: 2,
  maxFilesPerGroup: 0,
  atomic: false,
  requireCleanIndex: false,
  confirmThreshold: 100,
  defaultIgnores: true,
};

