import { expect, test } from 'bun:test';

test('set help lists every configurable key', () => {
  const result = Bun.spawnSync(['bun', 'run', 'index.ts', 'set', '--help'], {
    cwd: import.meta.dir + '/..',
  });
  const helpText = result.stdout.toString();

  expect(result.exitCode).toBe(0);
  for (const key of [
    'PROVIDER',
    'MODEL',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'COMMIT_STYLE',
    'PROMPT_STYLE',
    'PROMPT_TEMPLATE',
    'CUSTOM_PROMPT',
    'GROUP_BY',
    'GROUP_DEPTH',
    'MAX_FILES_PER_GROUP',
    'CONFIRM_THRESHOLD',
    'ATOMIC',
    'REQUIRE_CLEAN_INDEX',
    'DEFAULT_IGNORES',
  ]) {
    expect(helpText).toContain(key);
  }
});
