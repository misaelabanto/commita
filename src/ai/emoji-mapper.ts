import type { CommitType } from '@/ai/commit-type-analyzer.ts';

export class EmojiMapper {
  private emojiMap: Record<CommitType, string> = {
    feat: '✨',
    fix: '🐛',
    refactor: '♻️',
    chore: '🔧',
    docs: '📝',
    style: '💄',
    test: '✅',
    perf: '⚡',
  };

  getEmoji(type: CommitType): string {
    return this.emojiMap[type];
  }

  replaceTypeWithEmoji(commitMessage: string): string {
    for (const [type, emoji] of Object.entries(this.emojiMap)) {
      const pattern = new RegExp(`^${type}`, 'i');
      if (pattern.test(commitMessage)) {
        return commitMessage.replace(pattern, emoji);
      }
    }
    return commitMessage;
  }
}

