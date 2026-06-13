export type ConfirmDecision = 'proceed' | 'prompt' | 'abort';

export function decideConfirm(p: {
  total: number;
  maxGroup: number;
  threshold: number;
  yes: boolean;
  dryRun: boolean;
  isTTY: boolean;
}): ConfirmDecision {
  if (p.dryRun || p.yes) return 'proceed';
  const over = p.total >= p.threshold || p.maxGroup >= p.threshold;
  if (!over) return 'proceed';
  return p.isTTY ? 'prompt' : 'abort'; // non-TTY over threshold = abort (no hang)
}
