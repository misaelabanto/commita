import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { MAX_CONTEXT_LENGTH, resolveContext } from '@/cli/context.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmpDirs: string[] = [];

function makeFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'commita-ctx-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return path;
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe('resolveContext', () => {
  test('returns the trimmed inline context', () => {
    expect(resolveContext({ context: '  hello intent  ' })).toBe('hello intent');
  });

  test('returns undefined when no context is provided or it is blank', () => {
    expect(resolveContext({})).toBeUndefined();
    expect(resolveContext({ context: '' })).toBeUndefined();
    expect(resolveContext({ context: '   \n ' })).toBeUndefined();
  });

  test('throws when both --context and --context-file are provided', () => {
    const file = makeFile('ctx.txt', 'from file');
    expect(() => resolveContext({ context: 'inline', contextFile: file })).toThrow(
      /either --context or --context-file/i,
    );
  });

  test('reads and trims context from --context-file', () => {
    const file = makeFile('notes.md', '\n  context from a file\n\n');
    expect(resolveContext({ contextFile: file })).toBe('context from a file');
  });

  test('throws when --context-file points at an unreadable path', () => {
    expect(() => resolveContext({ contextFile: '/no/such/file-xyz.md' })).toThrow(
      /cannot read context file/i,
    );
  });

  test('throws when context exceeds the hard length cap', () => {
    const tooLong = 'x'.repeat(MAX_CONTEXT_LENGTH + 1);
    expect(() => resolveContext({ context: tooLong })).toThrow(/context too long/i);
  });

  test('accepts context exactly at the cap', () => {
    const atCap = 'x'.repeat(MAX_CONTEXT_LENGTH);
    expect(resolveContext({ context: atCap })).toBe(atCap);
  });

  test('warns and returns undefined for an empty context file', () => {
    const file = makeFile('empty.md', '   \n\t');
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(resolveContext({ contextFile: file })).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]!.join(' ')).toMatch(/empty/i);
    } finally {
      warn.mockRestore();
    }
  });
});
