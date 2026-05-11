#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { execFile, execSync } from 'child_process';
import { createApp } from './index';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--port':
        args.port = argv[++i];
        break;
      case '--data-dir':
        args.dataDir = argv[++i];
        break;
      case '--no-open':
        args.open = false;
        break;
      case '--dev':
        args.dev = true;
        break;
      case '--version':
      case '-v':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        console.log(require('../package.json').version);
        process.exit(0);
      case '--help':
      case '-h':
        console.log(`
  Claude Kanban - Claude Code task management panel

  Usage: ck [options]

  Options:
    --port <number>     Port to listen on (default: 14567)
    --data-dir <path>   Data directory (default: ~/.claude-kanban)
    --no-open           Do not open browser on start
    --dev               Development mode (use local dev-data/)
    --version, -v       Show version
    --help, -h          Show this help
        `);
        process.exit(0);
    }
  }
  return args;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findPortPid(port: number): number | null {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
      const match = out.match(/LISTENING\s+(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    } else {
      const out = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' });
      const pid = parseInt(out.trim(), 10);
      return pid || null;
    }
  } catch {
    return null;
  }
}

function killPid(pid: number) {
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F /T >nul 2>&1`, { stdio: 'ignore' });
  } else {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
}

async function killPortProcess(port: number) {
  const pid = findPortPid(port);
  if (!pid || pid === process.pid) return;
  console.log(`Port ${port} is occupied by PID ${pid}, killing...`);
  killPid(pid);
  await sleep(500);
}

async function killExistingProcess(pidFile: string) {
  try {
    const pidStr = fs.readFileSync(pidFile, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);
    if (!pid || pid === process.pid) return;

    console.log('Stopping existing instance...');

    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F /T >nul 2>&1`, { stdio: 'ignore' });
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }

    await sleep(500);
  } catch {
    // PID file doesn't exist, process already gone, or kill failed
  }
}

function writePidFile(pidFile: string) {
  try {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(process.pid));
  } catch {}
}

function removePidFile(pidFile: string) {
  try { fs.unlinkSync(pidFile); } catch {}
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  const port = parseInt(argv.port as string, 10) || parseInt(process.env.PORT || '14567', 10);
  const dataDir = argv.dev
    ? path.join(__dirname, '..', 'dev-data')
    : (argv.dataDir as string) || path.join(os.homedir(), '.claude-kanban');
  const staticDir = path.join(__dirname, 'public');
  const openBrowser = argv.open !== false;

  const pidFile = path.join(dataDir, 'server.pid');
  await killExistingProcess(pidFile);

  let server: http.Server;
  let url: string;

  try {
    ({ server, url } = await createApp({ port, dataDir, staticDir }));
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      await killPortProcess(port);
      ({ server, url } = await createApp({ port, dataDir, staticDir }));
    } else {
      throw err;
    }
  }

  writePidFile(pidFile);

  console.log(`\n  Claude Kanban is running at:`);
  console.log(`  > Local:   ${url}`);
  console.log(`  > Data:    ${dataDir}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);

  if (openBrowser && !argv.dev) {
    if (process.platform === 'darwin') {
      execFile('open', [url]);
    } else if (process.platform === 'win32') {
      execFile('cmd', ['/c', 'start', url]);
    } else {
      execFile('xdg-open', [url]);
    }
  }

  const shutdown = () => {
    console.log('\nShutting down...');
    removePidFile(pidFile);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
