import { describe, expect, test } from 'bun:test';
import { DEFAULT_GROUPING_IGNORES, PatternMatcher } from '@/utils/pattern-matcher.ts';

describe('PatternMatcher default ignores', () => {
  test('DEFAULT_GROUPING_IGNORES matches build/.gradle/dist paths', () => {
    const matcher = new PatternMatcher(DEFAULT_GROUPING_IGNORES);
    expect(matcher.shouldIgnore('app/build/x.class')).toBe(true);
    expect(matcher.shouldIgnore('.gradle/y')).toBe(true);
    expect(matcher.shouldIgnore('dist/z')).toBe(true);
    expect(matcher.shouldIgnore('src/index.ts')).toBe(false);
  });

  test('merged user -i + defaults both apply', () => {
    const matcher = new PatternMatcher([...DEFAULT_GROUPING_IGNORES, '*.log']);
    expect(matcher.shouldIgnore('dist/z')).toBe(true);
    expect(matcher.shouldIgnore('debug.log')).toBe(true);
    expect(matcher.shouldIgnore('src/index.ts')).toBe(false);
  });

  test('defaults disabled -> only user -i applies', () => {
    const matcher = new PatternMatcher(['*.log']);
    expect(matcher.shouldIgnore('dist/z')).toBe(false);
    expect(matcher.shouldIgnore('debug.log')).toBe(true);
  });

  test('ignorableRatio returns correct fraction', () => {
    const matcher = new PatternMatcher(DEFAULT_GROUPING_IGNORES);
    const files = [
      { path: 'app/build/a.class' },
      { path: 'app/build/b.class' },
      { path: 'dist/c.js' },
      { path: 'src/index.ts' },
    ];
    expect(matcher.ignorableRatio(files)).toBe(0.75);
    expect(matcher.ignorableRatio([])).toBe(0);
  });
});
