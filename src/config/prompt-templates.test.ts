import { describe, expect, test } from 'bun:test';
import { applyContext } from '@/config/prompt-templates.ts';

describe('applyContext', () => {
  test('prepends a labeled context block above the base prompt', () => {
    const result = applyContext('Git diff:\n{diff}', 'moved count query into txn, did not remove it');

    expect(result).toContain('moved count query into txn, did not remove it');
    expect(result).toContain('Git diff:\n{diff}');
    // context must come before the base prompt so the diff stays "below"
    expect(result.indexOf('moved count query')).toBeLessThan(result.indexOf('Git diff:'));
  });

  test('returns the prompt unchanged when context is empty, whitespace, or undefined', () => {
    const base = 'Git diff:\n{diff}';
    expect(applyContext(base, undefined)).toBe(base);
    expect(applyContext(base, '')).toBe(base);
    expect(applyContext(base, '   \n\t ')).toBe(base);
  });
});
