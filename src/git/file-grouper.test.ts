import { describe, expect, test } from 'bun:test';
import { FileGrouper } from '@/git/file-grouper.ts';
import type { FileChange } from '@/git/git.service.ts';
import type { ProjectBoundary } from '@/git/project-detector.ts';

function fc(path: string): FileChange {
  return { path, status: 'modified' };
}

function scopesOf(grouper: FileGrouper, files: FileChange[]): string[] {
  return grouper
    .optimizeGroups(grouper.groupByPath(files))
    .map(g => g.scope)
    .sort();
}

describe('FileGrouper extractScope (P1 root bucket)', () => {
  test('depth=2 splits unrelated dirs into distinct scopes, only README in root', () => {
    const grouper = new FileGrouper([], { depth: 2 });
    const files = [
      fc('apps/backend/server.ts'),
      fc('apps/mobile/main.ts'),
      fc('kotlin_mobile/app/Main.kt'),
      fc('docs/guide/x.md'),
      fc('README.md'),
    ];
    const groups = grouper.optimizeGroups(grouper.groupByPath(files));
    const scopes = groups.map(g => g.scope);

    expect(scopes).toContain('apps/backend');
    expect(scopes).toContain('apps/mobile');
    expect(scopes).toContain('kotlin_mobile/app');
    expect(scopes).toContain('docs/guide');
    expect(scopes).toContain('root');

    // Only README.md should be in root
    const rootGroup = groups.find(g => g.scope === 'root');
    expect(rootGroup?.files.map(f => f.path)).toEqual(['README.md']);

    // No scope swallows unrelated dirs
    const apps = groups.find(g => g.scope === 'apps/backend');
    expect(apps?.files.every(f => f.path.startsWith('apps/backend'))).toBe(true);
  });

  test('depth=1 vs depth=3 change granularity', () => {
    const files = [fc('apps/backend/src/server.ts'), fc('apps/mobile/src/main.ts')];

    const d1 = scopesOf(new FileGrouper([], { depth: 1 }), files);
    expect(d1).toEqual(['apps']);

    const d3 = scopesOf(new FileGrouper([], { depth: 3 }), files);
    expect(d3.length).toBe(2);
  });

  test('project boundary: nearest (longest) boundary wins', () => {
    const boundaries: ProjectBoundary[] = [
      { path: 'apps', manifestFile: 'package.json' },
      { path: 'apps/backend', manifestFile: 'package.json' },
    ];
    const grouper = new FileGrouper(boundaries, { depth: 2 });
    const groups = grouper.optimizeGroups(
      grouper.groupByPath([fc('apps/backend/src/index.ts')]),
    );
    expect(groups[0]?.scope.startsWith('apps/backend')).toBe(true);
  });

  test('maxFilesPerGroup=2 splits a 5-file group into 3 parts and warns', () => {
    const grouper = new FileGrouper([], { depth: 2, maxFilesPerGroup: 2 });
    const files = [
      fc('pkg/x/a.ts'),
      fc('pkg/x/b.ts'),
      fc('pkg/x/c.ts'),
      fc('pkg/x/d.ts'),
      fc('pkg/x/e.ts'),
    ];
    const groups = grouper.optimizeGroups(grouper.groupByPath(files));
    expect(groups.length).toBe(3);
    expect(groups.map(g => g.scope)).toEqual([
      'pkg/x (part 1/3)',
      'pkg/x (part 2/3)',
      'pkg/x (part 3/3)',
    ]);
    expect(grouper.splitWarnings.length).toBe(1);
    expect(grouper.splitWarnings[0]).toContain('pkg/x');
  });

  test('determinism: same input yields identical order/scopes', () => {
    const files = [
      fc('z/one.ts'),
      fc('a/two.ts'),
      fc('m/three.ts'),
      fc('README.md'),
    ];
    const g1 = new FileGrouper([], { depth: 2 });
    const g2 = new FileGrouper([], { depth: 2 });
    const r1 = g1.optimizeGroups(g1.groupByPath(files)).map(g => g.scope);
    const r2 = g2.optimizeGroups(g2.groupByPath(files)).map(g => g.scope);
    expect(r1).toEqual(r2);
    // root must be last
    expect(r1[r1.length - 1]).toBe('root');
  });

  test('sibling files directly under a boundary common dir merge into one group', () => {
    // Regression: findMeaningfulPath must not fold the filename into the scope,
    // otherwise each file gets its own single-file commit inside the project.
    const boundaries: ProjectBoundary[] = [
      { path: 'packages/api', manifestFile: 'package.json' },
    ];
    const grouper = new FileGrouper(boundaries, { depth: 2 });
    const groups = grouper.optimizeGroups(
      grouper.groupByPath([
        fc('packages/api/src/index.ts'),
        fc('packages/api/src/server.ts'),
        fc('packages/api/src/db.ts'),
      ]),
    );
    expect(groups.length).toBe(1);
    expect(groups[0]?.scope).toBe('packages/api/src');
    expect(groups[0]?.files.length).toBe(3);
  });

  test('invalid depth (0 / NaN) is clamped and never recreates the root bucket', () => {
    const files = [
      fc('apps/backend/server.ts'),
      fc('apps/mobile/main.ts'),
      fc('docs/guide/x.md'),
    ];
    for (const depth of [0, -1, Number.NaN]) {
      const scopes = scopesOf(new FileGrouper([], { depth }), files);
      // clamped to the default (2): three distinct scopes, no giant root bucket
      expect(scopes).not.toContain('root');
      expect(scopes.length).toBe(3);
    }
  });

  test('edge: empty input -> [], single-segment path -> root', () => {
    const grouper = new FileGrouper([], { depth: 2 });
    expect(grouper.groupByPath([])).toEqual([]);
    const groups = grouper.optimizeGroups(grouper.groupByPath([fc('LICENSE')]));
    expect(groups[0]?.scope).toBe('root');
  });
});
