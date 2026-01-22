/**
 * CLI module exports
 *
 * @module cli
 * @category CLI
 */

// Types
export * from './types';

// Config
export { loadConfig, getDefaultConfig } from './config';

// Discovery
export { discoverSchemas, getRelativePath } from './discover';

// Analysis
export { analyzeSchemas } from './analyze';

// Commands
export { generate } from './commands/generate';
export { setupAI } from './commands/setup-ai';

// Utilities
export { pluralize, toPascalCase, toCamelCase } from './utils/pluralize';
export { fieldToTsType, primitiveToTs } from './utils/type-mapping';
export { fieldToFakerCall } from './utils/faker-mapping';
export { CodeBuilder } from './utils/code-builder';

// Generators
export { generateTypes } from './generators/types';
export { generateHooks } from './generators/hooks';
export { generateMockDb } from './generators/mock/db';
export { generateMockHandlers } from './generators/mock/handlers';
export { generateMockClient } from './generators/mock/client';
export { generateUnifiedSeed, generateUnifiedSeed as generateSeed } from './generators/shared';
export { generateSupabaseClient } from './generators/supabase/client';
export { generateFirebaseClient } from './generators/firebase/client';
export { generateFetchClient } from './generators/fetch/client';
export { generateFormSchemas } from './generators/form-schemas';
export {
  generateClaudeMd,
  generateSchemockSection,
  generateCursorRules,
  mergeClaudeMdContent,
} from './generators/claude-md';
