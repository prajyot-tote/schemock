import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    globals: true,
    environment: 'node',

    // Integration tests may need more time (compilation checks)
    testTimeout: 30000,

    // Path aliases
    alias: {
      '@schemock': resolve(__dirname, './src'),
    },

    // Setup file for global test configuration
    setupFiles: ['./src/__tests__/integration/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['src/cli/generators/**/*.ts'],
      exclude: ['src/__tests__/**'],
    },
  },
});
