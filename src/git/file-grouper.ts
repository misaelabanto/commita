import type { FileChange } from '@/git/git.service.ts';
import type { ProjectBoundary } from '@/git/project-detector.ts';

export interface FileGroup {
  scope: string;
  files: FileChange[];
}

export class FileGrouper {
  private boundaries: ProjectBoundary[];

  constructor(boundaries: ProjectBoundary[] = []) {
    // Sort longest path first so the most specific project matches first
    this.boundaries = [...boundaries].sort(
      (a, b) => b.path.length - a.path.length,
    );
  }

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

    const project = this.findProjectForFile(filePath);

    if (project) {
      const relativePath = filePath.slice(project.path.length + 1);
      const relativeParts = relativePath.split('/');

      if (relativeParts.length <= 1) {
        return project.path;
      }

      const meaningfulParts = this.findMeaningfulPath(relativeParts);
      return `${project.path}/${meaningfulParts.join('/')}`;
    }

    if (this.boundaries.length > 0) {
      // In a monorepo, root-level files that don't belong to any project
      return 'root';
    }

    const meaningfulParts = this.findMeaningfulPath(parts);
    return meaningfulParts.join('/');
  }

  private findProjectForFile(filePath: string): ProjectBoundary | undefined {
    return this.boundaries.find(
      b => filePath === b.path || filePath.startsWith(`${b.path}/`),
    );
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
    const scopeMap = new Map<string, FileChange[]>();

    for (const group of groups) {
      const normalizedScope = this.normalizeScope(group.scope);
      const existing = scopeMap.get(normalizedScope) || [];
      existing.push(...group.files);
      scopeMap.set(normalizedScope, existing);
    }

    const optimized: FileGroup[] = [];
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
    const project = this.findProjectForScope(scope);

    if (project) {
      const subScope = scope.slice(project.path.length + 1);
      const parts = subScope.split('/');

      if (parts.length > 2 && parts[0] === 'src') {
        return `${project.path}/${parts.slice(0, 2).join('/')}`;
      }

      return scope;
    }

    const parts = scope.split('/');

    if (parts.length > 2 && parts[0] === 'src') {
      return parts.slice(0, 2).join('/');
    }

    return scope;
  }

  private findProjectForScope(scope: string): ProjectBoundary | undefined {
    return this.boundaries.find(
      b => scope === b.path || scope.startsWith(`${b.path}/`),
    );
  }
}
