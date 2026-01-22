/**
 * PGlite adapter generators
 *
 * @module cli/generators/pglite
 * @category CLI
 */

export { generatePGliteDb } from './db';
export { generatePGliteClient } from './client';
export { generatePGliteSeed } from './seed';
export type { SeedConfig as PGliteSeedConfig } from './seed';
export {
  generatePGliteHandlers,
  generatePGliteEndpointHandlers,
  generatePGliteAllHandlersExport,
} from './handlers';
export {
  generatePGliteEndpointTypes,
  generatePGliteEndpointClient,
  generatePGliteEndpointResolvers,
} from './endpoints';
