import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export interface ProjectBoundary {
  path: string;
  manifestFile: string;
}

const MANIFEST_FILES = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'pom.xml',
  'build.gradle',
  'composer.json',
  'pubspec.yaml',
  'mix.exs',
  'deno.json',
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  'out',
]);

const MAX_DEPTH = 4;

export class ProjectDetector {
  static detect(rootDir: string): ProjectBoundary[] {
    const boundaries: ProjectBoundary[] = [];
    this.scan(rootDir, rootDir, 0, boundaries);
    return boundaries;
  }

  private static scan(
    dir: string,
    rootDir: string,
    depth: number,
    boundaries: ProjectBoundary[],
  ): void {
    if (depth > MAX_DEPTH) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    const isRoot = dir === rootDir;

    if (!isRoot) {
      const manifest = entries.find(e => MANIFEST_FILES.includes(e));
      if (manifest) {
        boundaries.push({
          path: relative(rootDir, dir),
          manifestFile: manifest,
        });
        return; // Stop recursing into this project's internals
      }
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;

      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          this.scan(fullPath, rootDir, depth + 1, boundaries);
        }
      } catch {
        continue;
      }
    }
  }
}
