import { describe, expect, test } from 'bun:test';
import { decideConfirm } from '@/cli/confirm.ts';

const base = {
  total: 10,
  maxGroup: 5,
  threshold: 100,
  yes: false,
  dryRun: false,
  isTTY: true,
};

describe('decideConfirm', () => {
  test('below threshold -> proceed', () => {
    expect(decideConfirm(base)).toBe('proceed');
  });

  test('yes=true -> proceed even over threshold', () => {
    expect(decideConfirm({ ...base, total: 500, yes: true })).toBe('proceed');
  });

  test('dryRun=true -> proceed even over threshold', () => {
    expect(decideConfirm({ ...base, total: 500, dryRun: true })).toBe('proceed');
  });

  test('over threshold + TTY -> prompt', () => {
    expect(decideConfirm({ ...base, total: 500 })).toBe('prompt');
  });

  test('over threshold + non-TTY + no yes -> abort', () => {
    expect(decideConfirm({ ...base, total: 500, isTTY: false })).toBe('abort');
  });

  test('per-group over threshold (total under) + TTY -> prompt', () => {
    expect(decideConfirm({ ...base, total: 10, maxGroup: 150 })).toBe('prompt');
  });

  test('per-group over threshold (total under) + non-TTY -> abort', () => {
    expect(
      decideConfirm({ ...base, total: 10, maxGroup: 150, isTTY: false }),
    ).toBe('abort');
  });
});
