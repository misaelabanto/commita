import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';

export interface FileChange {
  path: string;
  status: string;
}

export class GitService {
  private git: SimpleGit;

  constructor(workingDir?: string) {
    this.git = simpleGit(workingDir || process.cwd());
  }

  async getStagedChanges(): Promise<FileChange[]> {
    const status = await this.git.status();
    return status.staged.map(path => ({
      path,
      status: 'staged',
    }));
  }

  async getUnstagedChanges(): Promise<FileChange[]> {
    const status = await this.git.status();
    const modified = status.modified.map(path => ({ path, status: 'modified' }));
    const notAdded = status.not_added.map(path => ({ path, status: 'new' }));
    const deleted = status.deleted.map(path => ({ path, status: 'deleted' }));

    return [...modified, ...notAdded, ...deleted];
  }

  async getAllChanges(): Promise<FileChange[]> {
    const staged = await this.getStagedChanges();
    const unstaged = await this.getUnstagedChanges();
    return [...staged, ...unstaged];
  }

  async getDiff(files: string[], staged: boolean = false): Promise<string> {
    if (files.length === 0) {
      return '';
    }

    try {
      const status = await this.git.status();
      const newFiles = status.not_added;
      const diffs: string[] = [];

      for (const file of files) {
        if (newFiles.includes(file) && !staged) {
          const newFileDiff = await this.getNewFileDiff(file);
          if (newFileDiff) {
            diffs.push(newFileDiff);
          }
        } else {
          const diffArgs = staged ? ['--cached', '--', file] : ['--', file];
          const diff = await this.git.diff(diffArgs);
          if (diff) {
            diffs.push(diff);
          }
        }
      }

      return diffs.join('\n');
    } catch (error) {
      console.error('Error getting diff:', error);
      return '';
    }
  }

  private async getNewFileDiff(filePath: string): Promise<string> {
    try {
      const fullPath = join(process.cwd(), filePath);
      if (!existsSync(fullPath)) {
        return '';
      }

      const content = await readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      const diffHeader = `diff --git a/${filePath} b/${filePath}
new file mode 100644
index 0000000..0000000
--- /dev/null
+++ b/${filePath}
`;

      const diffLines = lines.map(line => `+${line}`).join('\n');
      return diffHeader + diffLines;
    } catch (error) {
      console.error(`Error reading new file ${filePath}:`, error);
      return '';
    }
  }

  async stageFiles(files: string[]): Promise<void> {
    if (files.length === 0) return;
    await this.git.add(files);
  }

  async unstageFiles(files: string[]): Promise<void> {
    if (files.length === 0) return;
    await this.git.reset(['HEAD', '--', ...files]);
  }

  async commit(message: string): Promise<void> {
    await this.git.commit(message);
  }

  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'main';
  }

  async push(): Promise<void> {
    const branch = await this.getCurrentBranch();
    await this.git.push('origin', branch);
  }

  async hasRemote(): Promise<boolean> {
    try {
      const remotes = await this.git.getRemotes();
      return remotes.length > 0;
    } catch {
      return false;
    }
  }
}

