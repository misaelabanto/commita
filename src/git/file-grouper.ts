import type { FileChange } from '@/git/git.service.ts';
import type { ProjectBoundary } from '@/git/project-detector.ts';

export interface FileGroup {
  scope: string;
  files: FileChange[];
}

export class FileGrouper {
  private boundaries: ProjectBoundary[];
  private depth: number;
  private maxFilesPerGroup: number;
  splitWarnings: string[] = [];

  constructor(
    boundaries: ProjectBoundary[] = [],
    opts?: { depth?: number; maxFilesPerGroup?: number },
  ) {
    // Sort longest path first so the most specific project matches first
    this.boundaries = [...boundaries].sort(
      (a, b) => b.path.length - a.path.length,
    );
    // Clamp at the single most robust point so an invalid depth (0, negative,
    // or NaN from an unparsed CLI/env value) can never recreate the giant
    // "root" bucket this fix eliminates. Depth is at least 1.
    const depth = opts?.depth;
    this.depth =
      typeof depth === 'number' && Number.isFinite(depth) && depth >= 1
        ? Math.floor(depth)
        : 2;
    const maxFiles = opts?.maxFilesPerGroup;
    this.maxFilesPerGroup =
      typeof maxFiles === 'number' && Number.isFinite(maxFiles) && maxFiles >= 0
        ? Math.floor(maxFiles)
        : 0; // 0 = off
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

  /**
   * Put every file in one group, for --single. The scope is the deepest
   * directory all the files share, so a change confined to one area still reads
   * as that area rather than as 'root'.
   */
  groupAsSingle(files: FileChange[]): FileGroup[] {
    this.splitWarnings = [];

    if (files.length === 0) {
      return [];
    }

    return [{ scope: this.commonDirectory(files.map(file => file.path)), files }];
  }

  /**
   * Apply --max-files-per-group to groups that were built elsewhere (semantic
   * grouping), without running them through folder scope normalization.
   */
  splitGroups(groups: FileGroup[]): FileGroup[] {
    // Deliberately does not reset splitWarnings: semantic grouping may already
    // have collected warnings while folder-grouping leftover files.
    return this.splitOversized(groups);
  }

  private commonDirectory(paths: string[]): string {
    const segmentLists = paths.map(path => path.split('/').filter(part => part.length > 0).slice(0, -1));
    const [first, ...rest] = segmentLists;

    if (!first) {
      return 'root';
    }

    const shared: string[] = [];

    for (let index = 0; index < first.length; index++) {
      const segment = first[index];
      if (rest.every(segments => segments[index] === segment)) {
        shared.push(segment as string);
      } else {
        break;
      }
    }

    return shared.length > 0 ? shared.join('/') : 'root';
  }

  private extractScope(filePath: string): string {
    const parts = filePath.split('/').filter(p => p.length > 0);

    if (parts.length <= 1) {
      return 'root'; // genuine repo-root file only
    }

    const project = this.findProjectForFile(filePath);

    if (project) {
      const relativePath = filePath.slice(project.path.length + 1);
      const relativeParts = relativePath.split('/').filter(p => p.length > 0);

      if (relativeParts.length <= 1) {
        return project.path;
      }

      const meaningful = this.findMeaningfulPath(relativeParts);
      return meaningful.length ? `${project.path}/${meaningful.join('/')}` : project.path;
    }

    // No boundary match: assign by nearest top `depth` dirs (NOT 'root')
    const dirSegs = parts.slice(0, Math.min(this.depth, parts.length - 1));
    return dirSegs.length ? dirSegs.join('/') : 'root';
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
      return parts.slice(0, Math.min(this.depth, parts.length - 1));
    }

    const relevantParts = parts.slice(startIdx);

    if (relevantParts.length === 1) {
      return relevantParts;
    }

    // Cap so the filename is never folded into the scope; sibling files under
    // a common dir (e.g. <project>/src/a.ts, b.ts) must collapse to one group.
    return relevantParts.slice(0, Math.min(this.depth, relevantParts.length - 1));
  }

  optimizeGroups(groups: FileGroup[]): FileGroup[] {
    this.splitWarnings = [];

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

    const sorted = optimized.sort((a, b) => {
      if (a.scope === 'root') return 1;
      if (b.scope === 'root') return -1;
      return a.scope.localeCompare(b.scope);
    });

    return this.splitOversized(sorted);
  }

  private splitOversized(groups: FileGroup[]): FileGroup[] {
    if (this.maxFilesPerGroup <= 0) return groups;
    const out: FileGroup[] = [];
    for (const g of groups) {
      if (g.files.length <= this.maxFilesPerGroup) {
        out.push(g);
        continue;
      }
      const sorted = [...g.files].sort((a, b) => a.path.localeCompare(b.path)); // determinism
      const chunks: FileChange[][] = [];
      for (let i = 0; i < sorted.length; i += this.maxFilesPerGroup) {
        chunks.push(sorted.slice(i, i + this.maxFilesPerGroup));
      }
      const k = chunks.length;
      this.splitWarnings.push(
        `Group ${g.scope} has ${g.files.length} files; split into ${k} commits (--max-files-per-group=${this.maxFilesPerGroup}).`,
      );
      chunks.forEach((files, idx) =>
        out.push({ scope: `${g.scope} (part ${idx + 1}/${k})`, files }),
      );
    }
    return out;
  }

  private normalizeScope(scope: string): string {
    const project = this.findProjectForScope(scope);

    if (project) {
      const subScope = scope.slice(project.path.length + 1);
      const parts = subScope.split('/').filter(p => p.length > 0);

      if (parts.length > this.depth && parts[0] === 'src') {
        return `${project.path}/${parts.slice(0, this.depth).join('/')}`;
      }

      return scope;
    }

    const parts = scope.split('/').filter(p => p.length > 0);

    if (parts.length > this.depth && parts[0] === 'src') {
      return parts.slice(0, this.depth).join('/');
    }

    return scope;
  }

  private findProjectForScope(scope: string): ProjectBoundary | undefined {
    return this.boundaries.find(
      b => scope === b.path || scope.startsWith(`${b.path}/`),
    );
  }
}
