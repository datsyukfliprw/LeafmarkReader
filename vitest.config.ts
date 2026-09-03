import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: {
    '@leafmark/schemas': fileURLToPath(new URL('./packages/schemas/src/index.ts', import.meta.url)),
    '@leafmark/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    '@leafmark/pedagogy': fileURLToPath(new URL('./packages/pedagogy/src/index.ts', import.meta.url)),
    '@leafmark/ai': fileURLToPath(new URL('./packages/ai/src/index.ts', import.meta.url))
  }},
  test: { include: ['packages/**/*.test.ts','apps/**/*.test.ts','tests/**/*.test.ts'], environment: 'node' }
});
