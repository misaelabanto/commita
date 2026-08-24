import bundledSkillContent from '../../skills/commita/SKILL.md' with { type: 'text' };
import { access, cp, lstat, mkdir, rm, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export const SUPPORTED_HARNESSES = [
  'claude-code',
  'codex',
  'cursor',
  'gemini-cli',
  'github-copilot',
  'opencode',
] as const;

export type HarnessName = (typeof SUPPORTED_HARNESSES)[number];

export const HARNESS_DISPLAY_NAMES: Record<HarnessName, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  'gemini-cli': 'Gemini CLI',
  'github-copilot': 'GitHub Copilot',
  opencode: 'OpenCode',
};

export interface SkillInstallOptions {
  agents: string[];
  force?: boolean;
}

export interface SkillInstallation {
  destinations: string[];
  replacedExistingSkill: boolean;
}

export interface SkillsHandlerOptions {
  sourceSkillDirectory?: string;
  harnessDirectories?: Partial<Record<HarnessName, string>>;
}

export class SkillsHandler {
  private sourceSkillDirectory?: string;
  private harnessDirectories: Record<HarnessName, string>;

  constructor(options: SkillsHandlerOptions = {}) {
    this.sourceSkillDirectory = options.sourceSkillDirectory;
    this.harnessDirectories = {
      ...this.getDefaultHarnessDirectories(),
      ...options.harnessDirectories,
    };
  }

  async install(options: SkillInstallOptions): Promise<SkillInstallation> {
    const selectedHarnesses = this.resolveHarnesses(options.agents);
    const destinations = selectedHarnesses.map(harness => join(this.harnessDirectories[harness], 'commita'));
    const existingDestinations = await Promise.all(
      destinations.map(async destination => ({ destination, exists: await this.pathExists(destination) })),
    );
    const destinationsToReplace = existingDestinations.filter(destination => destination.exists);

    if (destinationsToReplace.length > 0 && !options.force) {
      throw new Error(
        `Commita skill already exists at ${destinationsToReplace[0]!.destination}. Re-run with --force to replace it.`,
      );
    }

    for (const existingDestination of destinationsToReplace) {
      const destinationStatus = await lstat(existingDestination.destination);
      if (!destinationStatus.isDirectory() && !destinationStatus.isSymbolicLink()) {
        throw new Error(`Cannot replace ${existingDestination.destination} because it is not a skill directory.`);
      }
    }

    for (const destination of destinations) {
      if (destinationsToReplace.some(existingDestination => existingDestination.destination === destination)) {
        await rm(destination, { recursive: true, force: true });
      }
      await this.writeSkill(destination);
    }

    return {
      destinations,
      replacedExistingSkill: destinationsToReplace.length > 0,
    };
  }

  async detectInstalledHarnesses(): Promise<HarnessName[]> {
    const detectedHarnesses: HarnessName[] = [];

    for (const harness of SUPPORTED_HARNESSES) {
      const configurationDirectory = join(this.harnessDirectories[harness], '..');
      if (await this.pathExists(configurationDirectory)) {
        detectedHarnesses.push(harness);
      }
    }

    return detectedHarnesses;
  }

  private getDefaultHarnessDirectories(): Record<HarnessName, string> {
    const homeDirectory = homedir();
    const xdgConfigDirectory = process.env.XDG_CONFIG_HOME?.trim() || join(homeDirectory, '.config');
    const claudeConfigDirectory = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homeDirectory, '.claude');
    const codexConfigDirectory = process.env.CODEX_HOME?.trim() || join(homeDirectory, '.codex');

    return {
      'claude-code': join(claudeConfigDirectory, 'skills'),
      codex: join(codexConfigDirectory, 'skills'),
      cursor: join(homeDirectory, '.cursor', 'skills'),
      'gemini-cli': join(homeDirectory, '.gemini', 'skills'),
      'github-copilot': join(homeDirectory, '.copilot', 'skills'),
      opencode: join(xdgConfigDirectory, 'opencode', 'skills'),
    };
  }

  private resolveHarnesses(agentNames: string[]): HarnessName[] {
    if (agentNames.length === 0) {
      throw new Error('Select at least one harness to install the Commita skill.');
    }

    const selectedHarnesses: HarnessName[] = [];
    for (const agentName of agentNames) {
      if (!SUPPORTED_HARNESSES.includes(agentName as HarnessName)) {
        throw new Error(`Unsupported harness: ${agentName}.`);
      }
      const harness = agentName as HarnessName;
      if (!selectedHarnesses.includes(harness)) {
        selectedHarnesses.push(harness);
      }
    }

    return selectedHarnesses;
  }

  private async writeSkill(destination: string): Promise<void> {
    await mkdir(destination, { recursive: true });

    if (this.sourceSkillDirectory) {
      await cp(this.sourceSkillDirectory, destination, { recursive: true });
      return;
    }

    await writeFile(join(destination, 'SKILL.md'), bundledSkillContent, 'utf8');
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
