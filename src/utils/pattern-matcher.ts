import { minimatch } from 'minimatch';

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
      minimatch(filePath, pattern, { dot: true })
    );
  }

  filterFiles<T extends { path: string }>(files: T[]): T[] {
    if (this.patterns.length === 0) {
      return files;
    }

    return files.filter(file => !this.shouldIgnore(file.path));
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

