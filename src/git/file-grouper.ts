import type { FileChange } from '@/git/git.service.ts';

export interface FileGroup {
  scope: string;
  files: FileChange[];
}

export class FileGrouper {
  groupByPath(files: FileChange[]): FileGroup[] {
    if (files.length === 0) {
      return [];
    }

    const groups = new Map<string, FileChange[]>();

    for (const file of files) {
      const scope = this.extractScope(file.path);
      const existing = groups.get(scope) || [];
      existing.push(file);
      groups.set(scope, existing);
    }

    return Array.from(groups.entries()).map(([scope, files]) => ({
      scope,
      files,
    }));
  }

  private extractScope(filePath: string): string {
    const parts = filePath.split('/');

    if (parts.length === 1) {
      return 'root';
    }

    const meaningfulParts = this.findMeaningfulPath(parts);
    return meaningfulParts.join('/');
  }

  private findMeaningfulPath(parts: string[]): string[] {
    const commonDirs = ['src', 'lib', 'app', 'pages'];
    const startIdx = parts.findIndex(p => commonDirs.includes(p));

    if (startIdx === -1) {
      return parts.slice(0, Math.min(2, parts.length - 1));
    }

    const relevantParts = parts.slice(startIdx);

    if (relevantParts.length === 1) {
      return relevantParts;
    }

    return relevantParts.slice(0, 2);
  }

  optimizeGroups(groups: FileGroup[]): FileGroup[] {
    const optimized: FileGroup[] = [];
    const scopeMap = new Map<string, FileChange[]>();

    for (const group of groups) {
      const normalizedScope = this.normalizeScope(group.scope);
      const existing = scopeMap.get(normalizedScope) || [];
      existing.push(...group.files);
      scopeMap.set(normalizedScope, existing);
    }

    for (const [scope, files] of scopeMap.entries()) {
      optimized.push({ scope, files });
    }

    return optimized.sort((a, b) => {
      if (a.scope === 'root') return 1;
      if (b.scope === 'root') return -1;
      return a.scope.localeCompare(b.scope);
    });
  }

  private normalizeScope(scope: string): string {
    const parts = scope.split('/');

    if (parts.length > 2 && parts[0] === 'src') {
      return parts.slice(0, 2).join('/');
    }

    return scope;
  }
}

