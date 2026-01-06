/**
 * Schemock Generator - API documentation and collection generators
 *
 * @module generator
 * @category Generator
 */

// OpenAPI generation
export {
  generateOpenAPI,
  registerSchemas,
} from './openapi';
export type { OpenAPISpec, OpenAPIOptions } from './openapi';

// Postman collection generation
export {
  generatePostmanCollection,
  registerSchemasForPostman,
} from './postman';
export type { PostmanCollection, PostmanOptions } from './postman';
