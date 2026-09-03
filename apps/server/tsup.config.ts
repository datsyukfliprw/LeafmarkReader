import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  clean: true,
  noExternal: [/^@leafmark\//],
});
