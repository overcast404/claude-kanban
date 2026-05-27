import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const MAX_GIT_OUTPUT_BYTES = 1024 * 1024 * 6;

export function runGit(cwd: string, args: string[], maxBuffer = MAX_GIT_OUTPUT_BYTES, env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
  }).toString('utf8');
}

export function isGitRepo(cwd: string): boolean {
  if (!fs.existsSync(cwd)) return false;
  try {
    runGit(cwd, ['rev-parse', '--git-dir'], 1024 * 128);
    return true;
  } catch {
    return false;
  }
}

export function resolveCommit(cwd: string, ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    return runGit(cwd, ['rev-parse', '--verify', `${ref}^{commit}`], 1024 * 128).trim();
  } catch {
    return null;
  }
}

export function resolveTree(cwd: string, ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    return runGit(cwd, ['rev-parse', '--verify', `${ref}^{tree}`], 1024 * 128).trim();
  } catch {
    return null;
  }
}

export function getParentCommit(cwd: string, ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    return runGit(cwd, ['rev-parse', '--verify', `${ref}^`], 1024 * 128).trim();
  } catch {
    return null;
  }
}

export function captureWorkingTree(cwd: string): string | null {
  if (!isGitRepo(cwd)) return null;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-git-index-'));
  const indexFile = path.join(tempDir, 'index');
  const env = { GIT_INDEX_FILE: indexFile };

  try {
    const headTree = resolveTree(cwd, 'HEAD');
    if (headTree) {
      runGit(cwd, ['read-tree', headTree], MAX_GIT_OUTPUT_BYTES, env);
    } else {
      runGit(cwd, ['read-tree', '--empty'], MAX_GIT_OUTPUT_BYTES, env);
    }

    runGit(cwd, ['add', '-A'], MAX_GIT_OUTPUT_BYTES, env);
    return runGit(cwd, ['write-tree'], MAX_GIT_OUTPUT_BYTES, env).trim();
  } catch (e) {
    console.error(`[GitSnapshot] Failed to capture working tree at ${cwd}:`, (e as Error).message);
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
