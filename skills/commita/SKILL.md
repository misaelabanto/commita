---
name: commita
description: Run the user's personal `commita` binary to create AI-grouped commits and push them. Use whenever the user invokes `/commita`, asks to run commita, says "commitea", or otherwise asks to commit the current changes with commita. Prefer this skill over crafting commits by hand whenever the user signals they want commita to do it.
---

# Commita

`commita` is the user's personal CLI for committing work. It groups the current diff into logical chunks, writes commit messages with an LLM, runs each commit, and pushes the branch. This skill is the wrapper for invoking it inside a session.

## When to invoke

- The user types `/commita`.
- The user says "run commita", "commitea esto", "use commita", "commit with commita", or similar.
- The user asks for grouped or auto commits and has commita installed.

Do not invoke this skill for normal `git commit` requests where the user has not mentioned commita. Commita writes its own messages, groups by folder, and pushes, so use it only when the user has asked for it.

## What to do

1. Confirm there are changes worth committing. Run `git status --short`. If the working tree is clean, tell the user and stop. Do not run commita on nothing.
2. Run `commita -a`. This groups all changes by folder. Pushing is on by default, so do not pass `--no-push` unless the user asks. Do not pass `--no-verify` unless the user explicitly asks to skip hooks. Stream commita's output as it runs.
3. Pass through any user-requested flags from the table below.
4. After commita finishes, run `git log --oneline -n 5` so the user can see the result. If the push failed, surface the error clearly.

| User says | Flag |
| --- | --- |
| "don't push" or "just commit" | `--no-push` |
| "skip hooks" or "no verify" | `--no-verify` |
| "dry run", "show me what it would do", or "preview" | `--dry-run` |
| "ignore X" or "exclude Y" | `--ignore "X,Y"` |
| "use this context", "the intent is", or "tell it that" | `--context "..."` |
| "read the context from &lt;file&gt;" or "context is in &lt;file&gt;" | `--context-file &lt;path&gt;` |
| "just show status" | `--status` |
| "don't ask", "skip the confirmation", or "yes to everything" | `--yes` |
| "make it atomic", "all or nothing", or "roll back if anything fails" | `--atomic` |
| "fail if anything's staged" or "require a clean index" | `--require-clean-index` |
| "include build files" or "don't skip build artifacts" | `--no-default-ignores` |
| "group deeper", "group shallower", or "split by sub-folder" | `--depth N` |
| "cap commits at N files" or "split big groups" | `--max-files-per-group N` |
| "prompt above N files" or "change the confirmation threshold" | `--confirm-threshold N` |

## Important behavior

- Do not pre-stage. Commita manages its own staging based on its grouping logic. Running `git add` beforehand can confuse it.
- Do not write commit messages yourself. That is commita's job.
- Pass `--context "..."` when you know intent that the diff cannot show. Keep it to one or two sentences. It is authoritative where it conflicts with the diff, so make it accurate. Do not pass both `--context` and `--context-file`.
- Respect the working directory. Commita operates on the repository containing the current working directory. Do not change directories unless the user asks.
- If commita exits unsuccessfully, show the error and the current `git status --short`. Do not retry blindly.
- Large runs can require confirmation. In non-interactive sessions, the run aborts unless you pass `--yes`. Use it only when the user has authorized the commit.

## Quick reference

```text
-v, --version                 Show version number
-a, --all                     Process all changes grouped by folders
-i, --ignore <patterns>       Comma-separated globs to exclude
    --no-push                 Skip pushing after commit
    --no-verify               Bypass pre-commit and commit-msg hooks
-c, --config <path>           Custom config file
-x, --context <text>          Free-text intent passed to the LLM for every group
    --context-file <path>     Read context from a file, mutually exclusive with --context
-d, --dry-run                 Show commit groups and messages without committing
-s, --status                  Summary of staged and unstaged changes
    --depth <n>               Grouping depth for files outside a detected project
    --max-files-per-group <n> Auto-split groups larger than n, 0 disables it
    --atomic                  Roll back all commits from this run if any group fails
    --require-clean-index     Abort if the index has pre-staged changes when using --all
-y, --yes                     Skip confirmation prompts for large or pushed runs
    --confirm-threshold <n>   File count at or above which confirmation is required
    --no-default-ignores      Disable the built-in build and VCS noise ignore set
-h, --help                    Show help
```

Use `commita set KEY=value` to configure Commita. Add `--local` to write the project's `.commita` file instead of the global config. Available settings include `PROVIDER`, `MODEL`, `PROMPT_STYLE`, `COMMIT_STYLE`, `GROUP_DEPTH`, `MAX_FILES_PER_GROUP`, `CONFIRM_THRESHOLD`, `DEFAULT_IGNORES`, `ATOMIC`, and `REQUIRE_CLEAN_INDEX`.
