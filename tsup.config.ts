import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library bundles
  {
    entry: {
      'index': 'src/index.ts',
      'schema/index': 'src/schema/index.ts',
      'runtime/index': 'src/runtime/index.ts',
      'adapters/index': 'src/adapters/index.ts',
      'middleware/index': 'src/middleware/index.ts',
      'react/index': 'src/react/index.ts',
      'cli/index': 'src/cli/index.ts',
      'seed/index': 'src/seed/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: [
      'react',
      '@tanstack/react-query',
      '@faker-js/faker',
      'msw',
      'zod',
    ],
  },
  // CLI binary (CJS only, with shebang)
  {
    entry: {
      'cli': 'src/cli.ts',
    },
    format: ['cjs'],
    dts: false,
    sourcemap: false,
    clean: false,
    splitting: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: [
      'react',
      '@tanstack/react-query',
      '@faker-js/faker',
      'msw',
      'zod',
    ],
  },
]);
