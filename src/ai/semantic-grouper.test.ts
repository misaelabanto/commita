import { describe, expect, test } from 'bun:test';
import { parseGroupsResponse, reconcileGroups } from '@/ai/semantic-grouper.ts';
import type { FileChange } from '@/git/git.service.ts';

function changes(...paths: string[]): FileChange[] {
  return paths.map(path => ({ path, status: 'modified' }));
}

// Leftovers are grouped by their top directory, standing in for the real
// folder grouper so these tests stay independent of FileGrouper's internals.
function groupLeftoversByTopDir(files: FileChange[]) {
  const byDir = new Map<string, FileChange[]>();

  for (const file of files) {
    const dir = file.path.split('/')[0] ?? 'root';
    byDir.set(dir, [...(byDir.get(dir) ?? []), file]);
  }

  return Array.from(byDir.entries()).map(([scope, groupFiles]) => ({ scope, files: groupFiles }));
}

describe('parseGroupsResponse', () => {
  test('parses a bare JSON object', () => {
    const parsed = parseGroupsResponse('{"groups":[{"scope":"ios","files":["ios/Podfile"]}]}');
    expect(parsed).toEqual([{ scope: 'ios', files: ['ios/Podfile'] }]);
  });

  test('parses JSON wrapped in a markdown fence with commentary', () => {
    const response = 'Here you go:\n```json\n{"groups":[{"scope":"Play Compliance","files":["a.ts"]}]}\n```\nHope that helps.';
    expect(parseGroupsResponse(response)).toEqual([{ scope: 'play-compliance', files: ['a.ts'] }]);
  });

  test('falls back to a default scope when the model omits one', () => {
    expect(parseGroupsResponse('{"groups":[{"files":["a.ts"]}]}')).toEqual([
      { scope: 'changes', files: ['a.ts'] },
    ]);
  });

  test('returns null for unparseable or empty responses', () => {
    expect(parseGroupsResponse('sorry, I cannot help with that')).toBeNull();
    expect(parseGroupsResponse('{"groups":[]}')).toBeNull();
    expect(parseGroupsResponse('{"groups":"everything"}')).toBeNull();
    expect(parseGroupsResponse('{"groups":[{"scope":"a","files":[]}]}')).toBeNull();
  });
});

describe('reconcileGroups', () => {
  test('honours a proposal that covers every file exactly once', () => {
    const files = changes('ios/Podfile', 'ios/Runner.xcodeproj/project.pbxproj', 'lib/main.dart');
    const result = reconcileGroups(
      [
        { scope: 'ios-deployment-target', files: ['ios/Podfile', 'ios/Runner.xcodeproj/project.pbxproj'] },
        { scope: 'app', files: ['lib/main.dart'] },
      ],
      files,
      groupLeftoversByTopDir,
    );

    expect(result.warnings).toEqual([]);
    expect(result.groups?.map(group => group.scope)).toEqual(['ios-deployment-target', 'app']);
    expect(result.groups?.[0]?.files.map(file => file.path)).toEqual([
      'ios/Podfile',
      'ios/Runner.xcodeproj/project.pbxproj',
    ]);
  });

  test('rejects a proposal naming a file that is not being committed', () => {
    const result = reconcileGroups(
      [{ scope: 'ios', files: ['ios/Podfile', 'ios/Imaginary.swift'] }],
      changes('ios/Podfile'),
      groupLeftoversByTopDir,
    );

    expect(result.groups).toBeNull();
    expect(result.warnings[0]).toContain("unknown file 'ios/Imaginary.swift'");
  });

  test('rejects a proposal that puts the same file in two groups', () => {
    const result = reconcileGroups(
      [
        { scope: 'one', files: ['a/x.ts'] },
        { scope: 'two', files: ['a/x.ts'] },
      ],
      changes('a/x.ts'),
      groupLeftoversByTopDir,
    );

    expect(result.groups).toBeNull();
    expect(result.warnings[0]).toContain('more than one group');
  });

  test('appends folder-grouped leftovers so no file is dropped', () => {
    const result = reconcileGroups(
      [{ scope: 'ios', files: ['ios/Podfile'] }],
      changes('ios/Podfile', 'android/build.gradle', 'android/settings.gradle'),
      groupLeftoversByTopDir,
    );

    expect(result.groups?.map(group => group.scope)).toEqual(['ios', 'android']);
    expect(result.warnings[0]).toContain('2 file(s) unassigned');
    const covered = result.groups?.flatMap(group => group.files.map(file => file.path)) ?? [];
    expect(covered.sort()).toEqual(['android/build.gradle', 'android/settings.gradle', 'ios/Podfile']);
  });
});
