import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: resolve(root, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'MeetHunterContent',
      fileName: () => 'content.js',
    },
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});
