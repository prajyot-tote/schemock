/**
 * Post-build verification script.
 * Ensures all required JS runtime files exist in dist/ before publishing.
 * Prevents publishing a broken package with only .d.ts files.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

const MIN_SIZE_BYTES = 100;

const requiredFiles = [
  // Root entry
  'index.js',
  'index.mjs',
  'index.d.ts',
  // Schema
  'schema/index.js',
  'schema/index.mjs',
  'schema/index.d.ts',
  // Runtime
  'runtime/index.js',
  'runtime/index.mjs',
  'runtime/index.d.ts',
  // Adapters
  'adapters/index.js',
  'adapters/index.mjs',
  'adapters/index.d.ts',
  // Middleware
  'middleware/index.js',
  'middleware/index.mjs',
  'middleware/index.d.ts',
  // React
  'react/index.js',
  'react/index.mjs',
  'react/index.d.ts',
  // CLI library entry
  'cli/index.js',
  'cli/index.mjs',
  'cli/index.d.ts',
  // CLI binary
  'cli.js',
];

let failed = false;
const missing = [];
const tooSmall = [];

for (const file of requiredFiles) {
  const fullPath = resolve(distDir, file);

  if (!existsSync(fullPath)) {
    missing.push(file);
    failed = true;
    continue;
  }

  const size = statSync(fullPath).size;
  if (size < MIN_SIZE_BYTES) {
    tooSmall.push({ file, size });
    failed = true;
  }
}

if (failed) {
  console.error('\n[verify-dist] BUILD VERIFICATION FAILED\n');

  if (missing.length > 0) {
    console.error(`Missing files (${missing.length}):`);
    for (const f of missing) {
      console.error(`  - dist/${f}`);
    }
  }

  if (tooSmall.length > 0) {
    console.error(`\nFiles too small (<${MIN_SIZE_BYTES} bytes):`);
    for (const { file, size } of tooSmall) {
      console.error(`  - dist/${file} (${size} bytes)`);
    }
  }

  console.error('\nThis likely means the JS bundling step failed silently.');
  console.error('Check tsup/esbuild output above for errors.\n');
  process.exit(1);
}

console.log(`[verify-dist] All ${requiredFiles.length} required files present and valid.`);
