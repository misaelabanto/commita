const CONTEXT_BLOCK = `<context>
The author provided the following intent for this change. Treat it as authoritative where it conflicts with your reading of the diff. Only describe changes that are present in the diff below; do not mention work from this context that does not appear in these files.

{context}
</context>`;

/**
 * Prepend an author-provided context block above a base prompt. The block is
 * only added when context has meaningful content; empty or whitespace-only
 * context returns the prompt unchanged.
 */
export function applyContext(prompt: string, context?: string): string {
  const trimmed = context?.trim();
  if (!trimmed) {
    return prompt;
  }

  return `${CONTEXT_BLOCK.replace('{context}', trimmed)}\n\n${prompt}`;
}

export const PROMPT_TEMPLATES = {
  default: `You are a helpful assistant that generates git commit messages.

Analyze the following git diff and generate a commit message following this format:
<type>(<scope>): <short description>

- Change 1
- Change 2
- Change 3

Rules:
1. Determine the commit type from: feat, fix, refactor, chore, docs, style, test, perf
2. The scope should be extracted from the common path (e.g., "components", "utils", "services")
3. Keep the short description under 50 characters
4. List 2-5 key changes as bullet points
5. Be concise and clear

Git diff:
{diff}`,

  detailed: `You are an expert developer analyzing code changes for commit message generation.

Your task is to deeply analyze the following git diff and create a comprehensive commit message.

Context Analysis:
- Identify what problem is being solved or feature being added
- Understand the broader context of changes
- Note any patterns, architectural decisions, or technical debt addressed

Format your commit message as:
<type>(<scope>): <short description>

- Detailed change 1 with context
- Detailed change 2 with context
- Detailed change 3 with context

Commit types: feat, fix, refactor, chore, docs, style, test, perf
The scope should reflect the affected module/area.

Git diff:
{diff}`,

  minimal: `Generate a short commit message for this diff.

Format: <type>(<scope>): <description>

- Key change 1
- Key change 2

Types: feat, fix, refactor, chore, docs, style, test, perf

Diff:
{diff}`,
};


/**
 * Prompt used by semantic grouping. The model receives the complete list of
 * changed files plus a truncated combined diff and returns the groups it thinks
 * should become individual commits.
 */
export const GROUPING_PROMPT = `You are grouping changed files into git commits.

Split the changed files below into the smallest number of groups such that each
group is one self-contained, logically complete change that could be committed,
reviewed, and reverted on its own.

Rules:
1. Every file listed must appear in exactly one group. Never invent file paths.
2. Files that only make sense together belong in the same group, even when they
   live in different directories. A change that spans directories is still one
   change.
3. Only create separate groups for changes that are genuinely independent of one
   another, not merely for files that sit in different folders.
4. Prefer few large groups over many small ones. A single group for everything is
   correct when the whole change set is one unit of work.
5. Give each group a short lowercase scope naming what the change is about, such
   as "auth", "build-config" or "ios-deployment-target".

Respond with JSON only, no markdown fences and no commentary, in this shape:
{"groups":[{"scope":"<scope>","files":["<path>","<path>"]}]}

Changed files:
{files}

Combined diff:
{diff}`;
