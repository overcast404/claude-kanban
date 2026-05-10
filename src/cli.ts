#!/usr/bin/env node
import path from 'path';
import os from 'os';
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

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  const port = parseInt(argv.port as string, 10) || parseInt(process.env.PORT || '14567', 10);
  const dataDir = argv.dev
    ? path.join(__dirname, '..', 'dev-data')
    : (argv.dataDir as string) || path.join(os.homedir(), '.claude-kanban');
  const staticDir = path.join(__dirname, 'public');
  const openBrowser = argv.open !== false;

  const { server, url } = await createApp({ port, dataDir, staticDir });

  console.log(`\n  Claude Kanban is running at:`);
  console.log(`  > Local:   ${url}`);
  console.log(`  > Data:    ${dataDir}`);
  console.log(`\n  Press Ctrl+C to stop.\n`);

  if (openBrowser && !argv.dev) {
    const { execFile } = await import('child_process');
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
