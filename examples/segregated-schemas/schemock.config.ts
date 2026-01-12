/**
 * Schemock configuration for segregated schemas example
 *
 * This demonstrates that a SINGLE glob pattern can discover
 * schemas from multiple directories:
 *   - entities/   → User, Post, Comment
 *   - endpoints/  → Search, BulkDelete, etc.
 *   - views/      → UserProfile, PostDetail
 *
 * All are merged before analysis, so cross-references work.
 */
import type { SchemockConfig } from '../../src/cli/types';

const config: SchemockConfig = {
  // Single glob catches ALL .ts files in all subdirectories
  // Excludes this config file and README
  schemas: './examples/segregated-schemas/**/*.ts',

  // Output directory for generated files
  output: './examples/segregated-schemas/generated',

  // Default adapter
  adapter: 'mock',

  // API prefix
  apiPrefix: '/api',

  // Adapter-specific config
  adapters: {
    mock: {
      seed: {
        user: 5,
        post: 15,
        comment: 30,
      },
      delay: 100,
      persist: false,
    },
  },
};

export default config;
