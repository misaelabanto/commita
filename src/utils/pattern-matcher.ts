import { minimatch } from 'minimatch';

export const DEFAULT_GROUPING_IGNORES = [
  '**/build/**', '**/.gradle/**', 'dist/**', '**/dist/**',
  'node_modules/**', '**/node_modules/**', '**/target/**',
  '**/.next/**', 'coverage/**', '**/__pycache__/**', 'out/**',
];

export class PatternMatcher {
  private patterns: string[];

  constructor(patterns: string[]) {
    this.patterns = patterns;
  }

  shouldIgnore(filePath: string): boolean {
    if (this.patterns.length === 0) {
      return false;
    }

    return this.patterns.some(pattern =>
      minimatch(filePath, pattern, { dot: true }) ||
      minimatch(filePath, `${pattern}/**`, { dot: true })
    );
  }

  filterFiles<T extends { path: string }>(files: T[]): T[] {
    if (this.patterns.length === 0) {
      return files;
    }

    return files.filter(file => !this.shouldIgnore(file.path));
  }

  ignorableRatio(files: { path: string }[]): number {
    if (files.length === 0) return 0;
    const n = files.filter(f => this.shouldIgnore(f.path)).length;
    return n / files.length;
  }

  static parsePatterns(patternsString: string): string[] {
    if (!patternsString || patternsString.trim() === '') {
      return [];
    }

    return patternsString
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }
}

