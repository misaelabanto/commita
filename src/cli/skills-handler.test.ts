import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cleanup, writeFile } from '../../test/helpers.ts';
import { SkillsHandler } from '@/cli/skills-handler.ts';

const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(prefix: string): string {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(temporaryDirectory);
  return temporaryDirectory;
}

function makeHandler(): { handler: SkillsHandler; sourceDirectory: string; skillsDirectory: string } {
  const sourceDirectory = makeTemporaryDirectory('commita-skill-source-');
  const skillsDirectory = makeTemporaryDirectory('commita-skills-destination-');

  writeFile(sourceDirectory, 'commita/SKILL.md', '---\nname: commita\ndescription: Commit changes\n---\n');

  return {
    handler: new SkillsHandler({
      sourceSkillDirectory: join(sourceDirectory, 'commita'),
      harnessDirectories: {
        codex: join(skillsDirectory, 'codex', 'skills'),
        'claude-code': join(skillsDirectory, 'claude-code', 'skills'),
        cursor: join(skillsDirectory, 'cursor', 'skills'),
        'gemini-cli': join(skillsDirectory, 'gemini-cli', 'skills'),
        'github-copilot': join(skillsDirectory, 'github-copilot', 'skills'),
        opencode: join(skillsDirectory, 'opencode', 'skills'),
      },
    }),
    sourceDirectory,
    skillsDirectory,
  };
}

afterEach(() => {
  for (const temporaryDirectory of temporaryDirectories.splice(0)) {
    cleanup(temporaryDirectory);
  }
});

describe('SkillsHandler', () => {
  test('exposes a skills install subcommand', () => {
    const command = Bun.spawnSync({
      cmd: ['bun', 'run', 'index.ts', 'skills', 'install', '--help'],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(command.exitCode).toBe(0);
    const help = new TextDecoder().decode(command.stdout);
    expect(help).toContain('install');
    expect(help).toContain('--agent <agents...>');
  });

  test('installs the bundled skill for Codex', async () => {
    const { handler, skillsDirectory } = makeHandler();

    const installation = await handler.install({ agents: ['codex'] });

    expect(installation.destinations).toEqual([join(skillsDirectory, 'codex', 'skills', 'commita')]);
    expect(readFileSync(join(skillsDirectory, 'codex', 'skills', 'commita', 'SKILL.md'), 'utf8')).toContain('name: commita');
  });

  test('installs the skill for every selected harness', async () => {
    const { handler, skillsDirectory } = makeHandler();

    await handler.install({ agents: ['codex', 'claude-code', 'cursor'] });

    expect(existsSync(join(skillsDirectory, 'codex', 'skills', 'commita', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDirectory, 'claude-code', 'skills', 'commita', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(skillsDirectory, 'cursor', 'skills', 'commita', 'SKILL.md'))).toBe(true);
  });

  test('detects harnesses whose configuration directories exist', async () => {
    const { handler, skillsDirectory } = makeHandler();
    writeFile(skillsDirectory, 'codex/config.toml', '');
    writeFile(skillsDirectory, 'cursor/settings.json', '{}');

    await expect(handler.detectInstalledHarnesses()).resolves.toEqual(['codex', 'cursor']);
  });

  test('refuses to replace an existing selected harness without force', async () => {
    const { handler, skillsDirectory } = makeHandler();
    writeFile(skillsDirectory, 'codex/skills/commita/SKILL.md', 'existing skill');

    await expect(handler.install({ agents: ['codex'] })).rejects.toThrow('already exists');
    expect(readFileSync(join(skillsDirectory, 'codex', 'skills', 'commita', 'SKILL.md'), 'utf8')).toBe('existing skill');
  });

  test('replaces existing selected harnesses when force is supplied', async () => {
    const { handler, skillsDirectory } = makeHandler();
    writeFile(skillsDirectory, 'codex/skills/commita/SKILL.md', 'existing skill');

    const installation = await handler.install({ agents: ['codex'], force: true });

    expect(installation.replacedExistingSkill).toBe(true);
    expect(readFileSync(join(skillsDirectory, 'codex', 'skills', 'commita', 'SKILL.md'), 'utf8')).toContain('name: commita');
  });

  test('rejects unknown harnesses before writing skills', async () => {
    const { handler, skillsDirectory } = makeHandler();

    await expect(handler.install({ agents: ['unknown-agent'] })).rejects.toThrow('Unsupported harness');
    expect(existsSync(join(skillsDirectory, 'unknown-agent', 'skills', 'commita'))).toBe(false);
  });
});
