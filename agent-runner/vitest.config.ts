import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Mirror tsconfig.json paths — the engine and contracts are consumed as source.
      '@devdigest/reviewer-core': path.resolve(__dirname, '../reviewer-core/src/index.ts'),
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared/index.ts'),
      zod: path.resolve(__dirname, 'node_modules/zod'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
