/**
 * Postman Collection Generator - Generate Postman collections from schemas
 *
 * Transforms Schemock entity schemas into Postman collections
 * for API testing and exploration.
 *
 * @module generator/postman
 * @category Generator
 */

import type { EntitySchema, FieldDefinition } from '../schema/types';

/**
 * Postman Collection 2.1 Format.
 */
export interface PostmanCollection {
  info: {
    name: string;
    description?: string;
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
    _postman_id?: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
}

/**
 * Postman Item (folder or request).
 */
interface PostmanItem {
  name: string;
  description?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  response?: PostmanResponse[];
}

/**
 * Postman Request.
 */
interface PostmanRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  header?: PostmanHeader[];
  body?: {
    mode: 'raw' | 'urlencoded' | 'formdata';
    raw?: string;
    options?: { raw: { language: 'json' } };
  };
  url: {
    raw: string;
    host?: string[];
    path?: string[];
    query?: PostmanQuery[];
    variable?: PostmanVariable[];
  };
  description?: string;
}

/**
 * Postman Header.
 */
interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
}

/**
 * Postman Query Parameter.
 */
interface PostmanQuery {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

/**
 * Postman Variable.
 */
interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  description?: string;
}

/**
 * Postman Auth.
 */
interface PostmanAuth {
  type: 'bearer' | 'basic' | 'apikey';
  bearer?: Array<{ key: string; value: string }>;
  basic?: Array<{ key: string; value: string }>;
  apikey?: Array<{ key: string; value: string }>;
}

/**
 * Postman Response.
 */
interface PostmanResponse {
  name: string;
  status: string;
  code: number;
  body?: string;
  header?: PostmanHeader[];
}

/**
 * Options for Postman collection generation.
 */
export interface PostmanOptions {
  /** Collection name */
  name?: string;
  /** Collection description */
  description?: string;
  /** Base URL for requests */
  baseUrl?: string;
  /** Include example responses */
  includeExamples?: boolean;
  /** Auth configuration */
  auth?: {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
}

/**
 * Schema registry.
 */
let registeredSchemas: EntitySchema[] = [];

/**
 * Register schemas for Postman generation.
 *
 * @param schemas - Array of entity schemas
 */
export function registerSchemasForPostman(schemas: EntitySchema[]): void {
  registeredSchemas = schemas;
}

/**
 * Generate Postman collection from registered schemas.
 *
 * @param options - Generation options
 * @returns Postman Collection 2.1 object
 *
 * @example
 * ```typescript
 * import { generatePostmanCollection, registerSchemasForPostman } from 'schemock/generator';
 *
 * registerSchemasForPostman([userSchema, postSchema]);
 *
 * const collection = generatePostmanCollection({
 *   name: 'My API',
 *   baseUrl: '{{baseUrl}}',
 *   auth: { type: 'bearer', token: '{{token}}' },
 * });
 *
 * // Export to file
 * fs.writeFileSync('collection.json', JSON.stringify(collection, null, 2));
 * ```
 */
export function generatePostmanCollection(options?: PostmanOptions): PostmanCollection {
  const {
    name = 'Schemock API',
    description = 'Auto-generated Postman collection from Schemock schemas',
    baseUrl = '{{baseUrl}}',
    includeExamples = true,
    auth,
  } = options ?? {};

  const collection: PostmanCollection = {
    info: {
      name,
      description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _postman_id: generateId(),
    },
    item: [],
    variable: [
      { key: 'baseUrl', value: 'http://localhost:3000/api', description: 'Base API URL' },
    ],
  };

  // Add auth configuration
  if (auth) {
    collection.auth = createAuth(auth);
    if (auth.type === 'bearer') {
      collection.variable!.push({
        key: 'token',
        value: auth.token ?? '',
        description: 'Bearer token',
      });
    }
  }

  // Generate items for each entity
  for (const schema of registeredSchemas) {
    const folder = createEntityFolder(schema, baseUrl, includeExamples);
    collection.item.push(folder);
  }

  return collection;
}

/**
 * Create auth configuration.
 */
function createAuth(config: PostmanOptions['auth']): PostmanAuth | undefined {
  if (!config) return undefined;

  switch (config.type) {
    case 'bearer':
      return {
        type: 'bearer',
        bearer: [{ key: 'token', value: config.token ?? '{{token}}' }],
      };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: config.username ?? '' },
          { key: 'password', value: config.password ?? '' },
        ],
      };
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: config.apiKeyHeader ?? 'X-API-Key' },
          { key: 'value', value: config.apiKey ?? '{{apiKey}}' },
        ],
      };
  }
}

/**
 * Create a folder for an entity with all CRUD operations.
 */
function createEntityFolder(
  entity: EntitySchema,
  baseUrl: string,
  includeExamples: boolean
): PostmanItem {
  const entityPath = `${baseUrl}/${pluralize(entity.name)}`;

  const folder: PostmanItem = {
    name: capitalize(entity.name),
    description: `${capitalize(entity.name)} CRUD operations`,
    item: [
      createListRequest(entity, entityPath, includeExamples),
      createGetRequest(entity, entityPath, includeExamples),
      createCreateRequest(entity, entityPath, includeExamples),
      createUpdateRequest(entity, entityPath, includeExamples),
      createDeleteRequest(entity, entityPath),
    ],
  };

  return folder;
}

/**
 * Create List request.
 */
function createListRequest(
  entity: EntitySchema,
  basePath: string,
  includeExamples: boolean
): PostmanItem {
  const request: PostmanItem = {
    name: `List ${pluralize(entity.name)}`,
    request: {
      method: 'GET',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: {
        raw: `${basePath}?limit=20&offset=0`,
        path: basePath.split('/').filter(Boolean),
        query: [
          { key: 'limit', value: '20', description: 'Number of items to return' },
          { key: 'offset', value: '0', description: 'Number of items to skip' },
        ],
      },
      description: `Get a list of ${pluralize(entity.name)}`,
    },
  };

  if (includeExamples) {
    request.response = [
      {
        name: 'Success',
        status: 'OK',
        code: 200,
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: JSON.stringify(
          {
            data: [generateExampleEntity(entity)],
            meta: { total: 1 },
          },
          null,
          2
        ),
      },
    ];
  }

  return request;
}

/**
 * Create Get request.
 */
function createGetRequest(
  entity: EntitySchema,
  basePath: string,
  includeExamples: boolean
): PostmanItem {
  const request: PostmanItem = {
    name: `Get ${entity.name}`,
    request: {
      method: 'GET',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: {
        raw: `${basePath}/:id`,
        path: [...basePath.split('/').filter(Boolean), ':id'],
        variable: [
          { key: 'id', value: '{{id}}', description: `${capitalize(entity.name)} ID` },
        ],
      },
      description: `Get a single ${entity.name} by ID`,
    },
  };

  if (includeExamples) {
    request.response = [
      {
        name: 'Success',
        status: 'OK',
        code: 200,
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: JSON.stringify({ data: generateExampleEntity(entity) }, null, 2),
      },
      {
        name: 'Not Found',
        status: 'Not Found',
        code: 404,
        body: JSON.stringify({ error: `${capitalize(entity.name)} not found` }, null, 2),
      },
    ];
  }

  return request;
}

/**
 * Create Create request.
 */
function createCreateRequest(
  entity: EntitySchema,
  basePath: string,
  includeExamples: boolean
): PostmanItem {
  const requestBody = generateCreateBody(entity);

  const request: PostmanItem = {
    name: `Create ${entity.name}`,
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify(requestBody, null, 2),
        options: { raw: { language: 'json' } },
      },
      url: {
        raw: basePath,
        path: basePath.split('/').filter(Boolean),
      },
      description: `Create a new ${entity.name}`,
    },
  };

  if (includeExamples) {
    request.response = [
      {
        name: 'Created',
        status: 'Created',
        code: 201,
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: JSON.stringify({ data: generateExampleEntity(entity) }, null, 2),
      },
    ];
  }

  return request;
}

/**
 * Create Update request.
 */
function createUpdateRequest(
  entity: EntitySchema,
  basePath: string,
  includeExamples: boolean
): PostmanItem {
  const requestBody = generateCreateBody(entity);

  const request: PostmanItem = {
    name: `Update ${entity.name}`,
    request: {
      method: 'PUT',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: {
        mode: 'raw',
        raw: JSON.stringify(requestBody, null, 2),
        options: { raw: { language: 'json' } },
      },
      url: {
        raw: `${basePath}/:id`,
        path: [...basePath.split('/').filter(Boolean), ':id'],
        variable: [
          { key: 'id', value: '{{id}}', description: `${capitalize(entity.name)} ID` },
        ],
      },
      description: `Update an existing ${entity.name}`,
    },
  };

  if (includeExamples) {
    request.response = [
      {
        name: 'Updated',
        status: 'OK',
        code: 200,
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: JSON.stringify({ data: generateExampleEntity(entity) }, null, 2),
      },
    ];
  }

  return request;
}

/**
 * Create Delete request.
 */
function createDeleteRequest(entity: EntitySchema, basePath: string): PostmanItem {
  return {
    name: `Delete ${entity.name}`,
    request: {
      method: 'DELETE',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: {
        raw: `${basePath}/:id`,
        path: [...basePath.split('/').filter(Boolean), ':id'],
        variable: [
          { key: 'id', value: '{{id}}', description: `${capitalize(entity.name)} ID` },
        ],
      },
      description: `Delete a ${entity.name}`,
    },
    response: [
      {
        name: 'Deleted',
        status: 'No Content',
        code: 204,
      },
    ],
  };
}

/**
 * Generate example entity data.
 */
function generateExampleEntity(entity: EntitySchema): Record<string, unknown> {
  const example: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(entity.fields)) {
    example[name] = generateFieldExample(field);
  }

  if (entity.timestamps) {
    example.createdAt = new Date().toISOString();
    example.updatedAt = new Date().toISOString();
  }

  return example;
}

/**
 * Generate example field value.
 */
function generateFieldExample(field: FieldDefinition): unknown {
  if (field.default !== undefined) return field.default;
  if (field.values?.length) return field.values[0];

  switch (field.type) {
    case 'string':
      return 'example';
    case 'uuid':
      return '550e8400-e29b-41d4-a716-446655440000';
    case 'email':
      return 'user@example.com';
    case 'url':
      return 'https://example.com';
    case 'number':
    case 'int':
      return 42;
    case 'float':
      return 3.14;
    case 'boolean':
      return true;
    case 'date':
      return new Date().toISOString();
    case 'array':
      return [];
    case 'object':
      return {};
    case 'ref':
      return '550e8400-e29b-41d4-a716-446655440000';
    default:
      return null;
  }
}

/**
 * Generate create request body.
 */
function generateCreateBody(entity: EntitySchema): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(entity.fields)) {
    if (name === 'id' || field.readOnly) continue;
    body[name] = generateFieldExample(field);
  }

  return body;
}

// Utility functions
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pluralize(str: string): string {
  if (str.endsWith('s')) return str;
  if (str.endsWith('y')) return str.slice(0, -1) + 'ies';
  return str + 's';
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
