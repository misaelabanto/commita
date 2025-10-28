export type CommitType = 'feat' | 'fix' | 'refactor' | 'chore' | 'docs' | 'style' | 'test' | 'perf';

export class CommitTypeAnalyzer {
  analyzeFromDiff(diff: string, files: string[]): CommitType {
    const lowerDiff = diff.toLowerCase();
    const filePaths = files.map(f => f.toLowerCase());

    if (this.isTest(filePaths, lowerDiff)) return 'test';
    if (this.isDocs(filePaths, lowerDiff)) return 'docs';
    if (this.isChore(filePaths, lowerDiff)) return 'chore';
    if (this.isStyle(lowerDiff)) return 'style';
    if (this.isPerf(lowerDiff)) return 'perf';
    if (this.isFix(lowerDiff)) return 'fix';
    if (this.isFeat(diff, lowerDiff)) return 'feat';

    return 'refactor';
  }

  private isTest(files: string[], diff: string): boolean {
    const testPatterns = ['.test.', '.spec.', '__tests__', '/tests/', '/test/'];
    return files.some(f => testPatterns.some(p => f.includes(p))) ||
      diff.includes('test(') || diff.includes('describe(') || diff.includes('it(');
  }

  private isDocs(files: string[], diff: string): boolean {
    const docPatterns = ['readme', '.md', 'documentation', '/docs/'];
    return files.some(f => docPatterns.some(p => f.includes(p)));
  }

  private isChore(files: string[], diff: string): boolean {
    const chorePatterns = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'bun.lock',
      '.gitignore',
      'tsconfig',
      'webpack',
      'vite.config',
      '.eslint',
      '.prettier',
    ];
    return files.some(f => chorePatterns.some(p => f.includes(p)));
  }

  private isStyle(diff: string): boolean {
    const styleKeywords = ['formatting', 'whitespace', 'indent', 'prettier', 'eslint'];
    const hasStyleKeywords = styleKeywords.some(k => diff.includes(k));

    const hasCodeChanges = diff.includes('function') ||
      diff.includes('class') ||
      diff.includes('const') ||
      diff.includes('import');

    return hasStyleKeywords && !hasCodeChanges;
  }

  private isPerf(diff: string): boolean {
    const perfKeywords = [
      'performance',
      'optimize',
      'cache',
      'memoize',
      'debounce',
      'throttle',
      'lazy',
      'async',
      'usememo',
      'usecallback',
    ];
    return perfKeywords.some(k => diff.includes(k));
  }

  private isFix(diff: string): boolean {
    const fixKeywords = [
      'fix',
      'bug',
      'issue',
      'error',
      'crash',
      'problem',
      'resolve',
      'correct',
      'patch',
      'hotfix',
    ];
    return fixKeywords.some(k => diff.includes(k));
  }

  private isFeat(diff: string, lowerDiff: string): boolean {
    const hasNewFiles = diff.includes('new file mode');
    const hasNewFunctions = lowerDiff.includes('+function') ||
      lowerDiff.includes('+export') ||
      lowerDiff.includes('+const') ||
      lowerDiff.includes('+class');

    const featKeywords = ['add', 'create', 'implement', 'feature', 'new'];
    const hasFeatKeywords = featKeywords.some(k => lowerDiff.includes(k));

    return hasNewFiles || (hasNewFunctions && hasFeatKeywords);
  }
}

