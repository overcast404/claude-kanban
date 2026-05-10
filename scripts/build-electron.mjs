import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';

// Clean output
rmSync('dist/electron', { recursive: true, force: true });

// Bundle Electron main process (CJS)
await esbuild.build({
  entryPoints: ['client/electron/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/electron/main.js',
  external: ['electron', 'better-sqlite3'],
});

// Bundle preload script (CJS — preload must be CommonJS)
await esbuild.build({
  entryPoints: ['client/electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/electron/preload.js',
  external: ['electron'],
});

console.log('Electron build complete');
