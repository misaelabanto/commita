import type { FileGroup } from '@/git/file-grouper.ts';
import type { FileChange } from '@/git/git.service.ts';

/** A group as proposed by the model, before it has been validated. */
export interface ProposedGroup {
  scope: string;
  files: string[];
}

export interface ReconciledGroups {
  /** Null when the proposal was rejected and the caller should fall back. */
  groups: FileGroup[] | null;
  warnings: string[];
}

/**
 * Parse the model's grouping response. The prompt asks for bare JSON, but models
 * routinely wrap it in a markdown fence or add a sentence around it, so the
 * outermost JSON object is extracted before parsing.
 *
 * Returns null when nothing usable can be read out of the response.
 */
export function parseGroupsResponse(text: string): ProposedGroup[] | null {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  const rawGroups = (parsed as { groups?: unknown })?.groups;
  if (!Array.isArray(rawGroups)) {
    return null;
  }

  const groups: ProposedGroup[] = [];

  for (const rawGroup of rawGroups) {
    const scope = (rawGroup as { scope?: unknown })?.scope;
    const files = (rawGroup as { files?: unknown })?.files;

    if (!Array.isArray(files)) {
      continue;
    }

    const paths = files.filter((file): file is string => typeof file === 'string' && file.trim().length > 0).map(file => file.trim());

    if (paths.length === 0) {
      continue;
    }

    groups.push({
      scope: sanitizeScope(typeof scope === 'string' ? scope : ''),
      files: paths,
    });
  }

  return groups.length > 0 ? groups : null;
}

/**
 * Turn proposed groups into real file groups, checked against the change set.
 *
 * A proposal that names a file commita is not committing, or that lists the same
 * file twice, is rejected (groups come back null) so the caller can fall back to
 * folder grouping: a hallucinated path means the response cannot be trusted to
 * describe this change set. Files the model simply forgot are grouped by the
 * provided fallback and appended, so no change is ever silently dropped. The
 * warnings explain what happened either way.
 */
export function reconcileGroups(
  proposed: ProposedGroup[],
  changes: FileChange[],
  groupLeftovers: (files: FileChange[]) => FileGroup[],
): ReconciledGroups {
  const changeByPath = new Map(changes.map(change => [change.path, change]));
  const assigned = new Set<string>();
  const groups: FileGroup[] = [];
  const warnings: string[] = [];

  for (const group of proposed) {
    const files: FileChange[] = [];

    for (const path of group.files) {
      const change = changeByPath.get(path);

      if (!change) {
        warnings.push(`the proposed grouping named unknown file '${path}'`);
        return { groups: null, warnings };
      }

      if (assigned.has(path)) {
        warnings.push(`the proposed grouping put '${path}' in more than one group`);
        return { groups: null, warnings };
      }

      assigned.add(path);
      files.push(change);
    }

    if (files.length > 0) {
      groups.push({ scope: group.scope, files });
    }
  }

  if (groups.length === 0) {
    warnings.push('the proposed grouping contained no files');
    return { groups: null, warnings };
  }

  const leftovers = changes.filter(change => !assigned.has(change.path));

  if (leftovers.length > 0) {
    warnings.push(
      `Semantic grouping left ${leftovers.length} file(s) unassigned; grouping them by folder.`,
    );
    groups.push(...groupLeftovers(leftovers));
  }

  return { groups, warnings };
}

/** Keep scopes to the shape the rest of the tool expects from a folder scope. */
function sanitizeScope(scope: string): string {
  const cleaned = scope
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned.length > 0 ? cleaned : 'changes';
}

/** Extract the outermost {...} block so fences or stray prose do not break parsing. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}
