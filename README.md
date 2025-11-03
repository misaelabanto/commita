# Commita 🤖

AI-powered git auto-commit tool that intelligently groups your changes and generates meaningful commit messages.

## Features

- **AI-Generated Commit Messages**: Uses OpenAI to analyze diffs and create descriptive commit messages
- **Intelligent File Grouping**: Automatically groups files by their directory structure for organized commits
- **Configurable**: Customize prompts, models, and commit styles
- **Multiple Commit Styles**: Support for conventional commits and emoji commits
- **Bulk Operations**: Process all changes at once with the `--all` flag
- **Pattern Filtering**: Exclude files using glob patterns with `--ignore`
- **Auto-Push**: Automatically pushes commits to remote (can be disabled)

## Installation

### Local Development

```bash
git clone <repository-url>
cd commita
bun install
```

### Global Installation (Coming Soon)

```bash
bun install -g commita
```

## Quick Start

1. Clone and install dependencies:
```bash
git clone <repository-url>
cd commita
bun install
```

2. Create a `.commita` file or set environment variables:
```bash
cp .commita.example .commita
# Edit .commita and add your OpenAI API key
```

3. Navigate to your project and run:
```bash
/path/to/commita/index.ts --all
```

## Configuration

Create a `.commita` file in your project root or use environment variables with the `COMMITA_` prefix.

### `.commita` file format (key=value):

```
MODEL=gpt-4o-mini
PROMPT_STYLE=default
COMMIT_STYLE=conventional
OPENAI_API_KEY=sk-...
```

### Environment Variables:

```bash
export COMMITA_MODEL=gpt-4o-mini
export COMMITA_PROMPT_STYLE=default
export COMMITA_COMMIT_STYLE=emoji
export OPENAI_API_KEY=sk-...
```

### Configuration Options

- **MODEL**: OpenAI model to use (default: `gpt-4o-mini`)
- **PROMPT_STYLE**: One of `default`, `detailed`, `minimal`, or `custom`
- **PROMPT_TEMPLATE**: Custom prompt template (when using custom style)
- **CUSTOM_PROMPT**: Complete custom prompt (when using custom style)
- **COMMIT_STYLE**: Either `conventional` or `emoji`
- **OPENAI_API_KEY**: Your OpenAI API key (required)

### Prompt Styles

- **default**: Balanced analysis with clear instructions
- **detailed**: Deep analysis of code changes with context
- **minimal**: Quick, concise commit messages
- **custom**: Use your own prompt via `PROMPT_TEMPLATE` or `CUSTOM_PROMPT`

#### Using Custom Prompts

You can create your own prompt template using the `{diff}` placeholder:

```
PROMPT_STYLE=custom
CUSTOM_PROMPT=Analyze this diff and create a commit message: {diff}
```

Or use PROMPT_TEMPLATE for longer prompts:
```
PROMPT_STYLE=custom
PROMPT_TEMPLATE=You are an expert developer. Analyze the following changes and generate a clear commit message in conventional commit format. The diff is: {diff}
```

### Commit Styles

**Conventional Commits:**
```
feat(components): add new button component
fix(utils): correct string formatting bug
refactor(services): restructure API client
```

**Emoji Commits:**
```
✨(components): add new button component
🐛(utils): correct string formatting bug
♻️(services): restructure API client
```

Emoji mappings:
- feat → ✨
- fix → 🐛
- refactor → ♻️
- chore → 🔧
- docs → 📝
- style → 💄
- test → ✅
- perf → ⚡

## Usage

**Important**: You must either have staged changes OR use the `--all` flag. The tool requires one of these to proceed.

### Basic Usage (with staged changes)

```bash
git add <files>
bun run index.ts
```

### Process All Changes

Group all unstaged changes by folder and create multiple commits:

```bash
bun run index.ts --all
```

### Ignore Patterns

Exclude files matching patterns:

```bash
bun run index.ts --all --ignore "*.log,node_modules/*,dist/*"
```

### Skip Pushing

Don't push commits to remote:

```bash
bun run index.ts --all --no-push
```

### Custom Config File

Use a different config file:

```bash
bun run index.ts --config .commita.local
```

## How It Works

### Flow Example

Given these changes:
```
src/components/button.tsx
src/components/carousel.tsx
src/utils/url.ts
src/utils/strings.ts
src/services/ai/ai.ts
src/services/profile/profile.ts
```

Running `commita --all` will create commits like:

```
feat(components): add new UI components
- Implement Button component with variants
- Add Carousel with auto-play feature

feat(utils): enhance utility functions
- Add URL parsing helper
- Improve string manipulation utilities

fix(ai): correct API integration
- Fix authentication flow
- Handle rate limiting

refactor(profile): restructure profile service
- Separate types into dedicated file
- Improve error handling
```

### Staged Changes Behavior

**Requirements**: You must provide either:
- Staged changes (via `git add`), OR
- The `--all` flag

**Behavior**:
- If you have **staged changes** and run without `--all`: processes staged files, grouped by folders, and creates multiple commits
- If you have **staged changes** and run with `--all`: ignores staged files and processes all unstaged changes grouped by folders
- If you have **no staged changes** and run without `--all`: exits with error
- **Note**: Commita temporarily unstages the files you selected so it can create one commit per folder, then restages and commits each group for you.
- Use this to control exactly which files get committed together

## Advanced Usage Examples

### Scenario 1: Multiple Feature Commits

You've been working on several features and want to commit them separately:

```bash
bun run index.ts --all
```

This will group files by their directories and create separate commits for each group.

### Scenario 2: Exclude Generated Files

Ignore build artifacts and logs:

```bash
bun run index.ts --all --ignore "dist/*,*.log,coverage/*"
```

### Scenario 3: Local Commits Only

Commit without pushing to remote:

```bash
bun run index.ts --all --no-push
```

### Scenario 4: Using Emoji Style

Set in your `.commita`:
```
COMMIT_STYLE=emoji
```

Then run:
```bash
bun run index.ts --all
```

## Troubleshooting

### "OpenAI API key is required"

Make sure you have set your API key either in:
- `.commita` file: `OPENAI_API_KEY=sk-...`
- Environment variable: `export OPENAI_API_KEY=sk-...`

### "No staged changes found"

This error occurs when you run the tool without the `--all` flag and have no staged changes. Either:
- Stage some changes: `git add <files>`
- Use the `--all` flag: `commita --all`

### Permission Denied

Make sure the script is executable:
```bash
chmod +x index.ts
```

### Import Errors

The project uses Bun's built-in support for `@/` path aliases. Make sure you're running with Bun, not Node.js:
```bash
bun run index.ts  # ✓ Correct
node index.ts     # ✗ Won't work
```

## Development

```bash
bun install
bun run dev
```

### Running Tests

```bash
bun test
```

### Build to Binary

```bash
bun build index.ts --compile --outfile commita
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
