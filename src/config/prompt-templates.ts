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

