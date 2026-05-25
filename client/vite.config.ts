import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.CLAUDE_KANBAN_PORT || '14567'}`,
      '/ws': {
        target: `ws://localhost:${process.env.CLAUDE_KANBAN_PORT || '14567'}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
});
