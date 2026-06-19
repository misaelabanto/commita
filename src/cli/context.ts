import { readFileSync } from 'fs';
import { isAbsolute, resolve } from 'path';

/** Hard cap on context length to bound token cost and abuse. */
export const MAX_CONTEXT_LENGTH = 2000;

export interface ContextInput {
  context?: string;
  contextFile?: string;
  /** Directory to resolve a relative --context-file against. Defaults to cwd. */
  cwd?: string;
}

/**
 * Resolve the run's context string from the --context / --context-file inputs.
 *
 * Returns undefined when no meaningful context is provided. Throws on conflicting
 * flags, an unreadable file, or context that exceeds MAX_CONTEXT_LENGTH.
 */
export function resolveContext(input: ContextInput): string | undefined {
  if (input.context != null && input.contextFile != null) {
    throw new Error('Pass either --context or --context-file, not both.');
  }

  const raw = input.contextFile != null ? readContextFile(input.contextFile, input.cwd) : input.context;

  const trimmed = raw?.trim();
  if (!trimmed) {
    if (input.contextFile != null) {
      console.warn(`Warning: context file '${input.contextFile}' is empty, ignoring.`);
    }
    return undefined;
  }

  if (trimmed.length > MAX_CONTEXT_LENGTH) {
    throw new Error(`Context too long (${trimmed.length} chars, max ${MAX_CONTEXT_LENGTH}).`);
  }

  return trimmed;
}

/**
 * Resolve a --context-file argument to an absolute path, matching how
 * readContextFile() locates it. Callers use this to exclude the note file from
 * the changes being committed (it is per-run intent, not a code change).
 */
export function resolveContextFilePath(contextFile: string, cwd?: string): string {
  return isAbsolute(contextFile) ? contextFile : resolve(cwd ?? process.cwd(), contextFile);
}

function readContextFile(contextFile: string, cwd?: string): string {
  const path = resolveContextFilePath(contextFile, cwd);
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    throw new Error(`Cannot read context file '${contextFile}'.`);
  }
}
