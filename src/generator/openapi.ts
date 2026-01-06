/**
 * OpenAPI Generator - Generate OpenAPI 3.0 specs from schemas
 *
 * Transforms Schemock entity schemas into OpenAPI 3.0 specification
 * for API documentation and client generation.
 *
 * @module generator/openapi
 * @category Generator
 */

import type { EntitySchema, FieldDefinition, RelationDefinition } from '../schema/types';

/**
 * OpenAPI 3.0 Specification type.
 */
export interface OpenAPISpec {
  openapi: '3.0.0';
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterObject>;
    responses?: Record<string, ResponseObject>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

/**
 * OpenAPI Path Item.
 */
interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  parameters?: ParameterObject[];
}

/**
 * OpenAPI Operation.
 */
interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: SchemaObject | RefObject }>;
  };
  responses: Record<string, ResponseObject>;
}

/**
 * OpenAPI Schema Object.
 */
interface SchemaObject {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, SchemaObject | RefObject>;
  required?: string[];
  items?: SchemaObject | RefObject;
  enum?: string[];
  nullable?: boolean;
  readOnly?: boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * OpenAPI Reference Object.
 */
interface RefObject {
  $ref: string;
}

/**
 * OpenAPI Parameter Object.
 */
interface ParameterObject {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema: SchemaObject;
  description?: string;
}

/**
 * OpenAPI Response Object.
 */
interface ResponseObject {
  description: string;
  content?: Record<string, { schema: SchemaObject | RefObject }>;
}

/**
 * Options for OpenAPI generation.
 */
export interface OpenAPIOptions {
  /** API title */
  title?: string;
  /** API version */
  version?: string;
  /** API description */
  description?: string;
  /** Server URL */
  serverUrl?: string;
  /** Additional servers */
  servers?: Array<{ url: string; description?: string }>;
  /** Base path for endpoints */
  basePath?: string;
}

/**
 * Schema registry for holding schemas to generate.
 */
let registeredSchemas: EntitySchema[] = [];

/**
 * Register schemas for OpenAPI generation.
 *
 * @param schemas - Array of entity schemas
 */
export function registerSchemas(schemas: EntitySchema[]): void {
  registeredSchemas = schemas;
}

/**
 * Generate OpenAPI 3.0 specification from registered schemas.
 *
 * @param options - Generation options
 * @returns Complete OpenAPI 3.0 specification
 *
 * @example
 * ```typescript
 * import { generateOpenAPI, registerSchemas } from 'schemock/generator';
 *
 * registerSchemas([userSchema, postSchema]);
 *
 * const spec = generateOpenAPI({
 *   title: 'My API',
 *   version: '1.0.0',
 *   serverUrl: 'https://api.example.com',
 * });
 *
 * // Write to file
 * fs.writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
 * ```
 */
export function generateOpenAPI(options?: OpenAPIOptions): OpenAPISpec {
  const {
    title = 'Schemock API',
    version = '1.0.0',
    description = 'Auto-generated API from Schemock schemas',
    serverUrl,
    servers,
    basePath = '/api',
  } = options ?? {};

  const spec: OpenAPISpec = {
    openapi: '3.0.0',
    info: {
      title,
      version,
      description,
    },
    paths: {},
    components: {
      schemas: {},
    },
    tags: [],
  };

  // Add servers
  if (serverUrl) {
    spec.servers = [{ url: serverUrl }];
  }
  if (servers) {
    spec.servers = servers;
  }

  // Generate schemas and paths for each entity
  for (const schema of registeredSchemas) {
    // Add tag for entity
    spec.tags!.push({
      name: schema.name,
      description: `${capitalize(schema.name)} operations`,
    });

    // Generate component schemas
    spec.components.schemas[capitalize(schema.name)] = entityToSchema(schema);
    spec.components.schemas[`${capitalize(schema.name)}Create`] = entityToCreateSchema(schema);
    spec.components.schemas[`${capitalize(schema.name)}Update`] = entityToUpdateSchema(schema);

    // Generate paths
    const entityPath = `${basePath}/${pluralize(schema.name)}`;
    const itemPath = `${entityPath}/{id}`;

    // Collection endpoints (list, create)
    spec.paths[entityPath] = {
      get: createListOperation(schema),
      post: createCreateOperation(schema),
    };

    // Item endpoints (get, update, delete)
    spec.paths[itemPath] = {
      get: createGetOperation(schema),
      put: createUpdateOperation(schema),
      patch: createPatchOperation(schema),
      delete: createDeleteOperation(schema),
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: `${capitalize(schema.name)} ID`,
        },
      ],
    };
  }

  return spec;
}

/**
 * Convert entity schema to OpenAPI schema object.
 */
function entityToSchema(entity: EntitySchema): SchemaObject {
  const properties: Record<string, SchemaObject | RefObject> = {};
  const required: string[] = [];

  for (const [name, field] of Object.entries(entity.fields)) {
    properties[name] = fieldToSchema(field);
    if (!field.nullable && field.default === undefined) {
      required.push(name);
    }
  }

  // Add relation placeholders
  if (entity.relations) {
    for (const [name, relation] of Object.entries(entity.relations)) {
      properties[name] = relationToSchema(relation);
    }
  }

  // Add timestamps
  if (entity.timestamps) {
    properties.createdAt = { type: 'string', format: 'date-time' };
    properties.updatedAt = { type: 'string', format: 'date-time' };
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Convert entity schema to create schema (no id, no readOnly).
 */
function entityToCreateSchema(entity: EntitySchema): SchemaObject {
  const properties: Record<string, SchemaObject | RefObject> = {};
  const required: string[] = [];

  for (const [name, field] of Object.entries(entity.fields)) {
    // Skip id and readOnly fields
    if (name === 'id' || field.readOnly) continue;

    properties[name] = fieldToSchema(field);
    if (!field.nullable && field.default === undefined) {
      required.push(name);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Convert entity schema to update schema (all optional).
 */
function entityToUpdateSchema(entity: EntitySchema): SchemaObject {
  const properties: Record<string, SchemaObject | RefObject> = {};

  for (const [name, field] of Object.entries(entity.fields)) {
    // Skip id and readOnly fields
    if (name === 'id' || field.readOnly) continue;

    properties[name] = fieldToSchema(field);
  }

  return {
    type: 'object',
    properties,
    // No required fields for update
  };
}

/**
 * Convert field definition to OpenAPI schema.
 */
function fieldToSchema(field: FieldDefinition): SchemaObject {
  const schema: SchemaObject = {};

  // Map field type to OpenAPI type
  switch (field.type) {
    case 'string':
      schema.type = 'string';
      break;
    case 'uuid':
      schema.type = 'string';
      schema.format = 'uuid';
      break;
    case 'email':
      schema.type = 'string';
      schema.format = 'email';
      break;
    case 'url':
      schema.type = 'string';
      schema.format = 'uri';
      break;
    case 'number':
    case 'float':
      schema.type = 'number';
      break;
    case 'int':
      schema.type = 'integer';
      break;
    case 'boolean':
      schema.type = 'boolean';
      break;
    case 'date':
      schema.type = 'string';
      schema.format = 'date-time';
      break;
    case 'array':
      schema.type = 'array';
      schema.items = field.items ? fieldToSchema(field.items) : { type: 'string' };
      break;
    case 'object':
      schema.type = 'object';
      if (field.shape) {
        schema.properties = {};
        for (const [name, shapeDef] of Object.entries(field.shape)) {
          schema.properties[name] = fieldToSchema(shapeDef);
        }
      }
      break;
    case 'ref':
      schema.type = 'string';
      schema.format = 'uuid';
      schema.description = `Reference to ${field.target}`;
      break;
    default:
      schema.type = 'string';
  }

  // Add enum values
  if (field.values) {
    schema.enum = field.values as string[];
  }

  // Add nullable
  if (field.nullable) {
    schema.nullable = true;
  }

  // Add readOnly
  if (field.readOnly) {
    schema.readOnly = true;
  }

  // Add default
  if (field.default !== undefined) {
    schema.default = field.default;
  }

  // Add constraints
  if (field.constraints) {
    if (field.constraints.min !== undefined) {
      if (field.type === 'string') {
        schema.minLength = field.constraints.min;
      } else {
        schema.minimum = field.constraints.min;
      }
    }
    if (field.constraints.max !== undefined) {
      if (field.type === 'string') {
        schema.maxLength = field.constraints.max;
      } else {
        schema.maximum = field.constraints.max;
      }
    }
    if (field.constraints.pattern) {
      schema.pattern = field.constraints.pattern.source;
    }
  }

  return schema;
}

/**
 * Convert relation to OpenAPI schema.
 */
function relationToSchema(relation: RelationDefinition): SchemaObject | RefObject {
  const targetSchema = capitalize(relation.target);

  switch (relation.type) {
    case 'hasMany':
      return {
        type: 'array',
        items: { $ref: `#/components/schemas/${targetSchema}` },
      };
    case 'belongsTo':
    case 'hasOne':
      return { $ref: `#/components/schemas/${targetSchema}` };
    default:
      return { type: 'object' };
  }
}

// Operation creators
function createListOperation(entity: EntitySchema): OperationObject {
  const name = capitalize(entity.name);
  return {
    tags: [entity.name],
    summary: `List all ${pluralize(entity.name)}`,
    operationId: `list${pluralize(name)}`,
    parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: 'Number of items to return' },
      { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Number of items to skip' },
    ],
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { type: 'array', items: { $ref: `#/components/schemas/${name}` } },
                meta: { type: 'object', properties: { total: { type: 'integer' } } },
              },
            },
          },
        },
      },
    },
  };
}

function createGetOperation(entity: EntitySchema): OperationObject {
  const name = capitalize(entity.name);
  return {
    tags: [entity.name],
    summary: `Get a ${entity.name}`,
    operationId: `get${name}`,
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { data: { $ref: `#/components/schemas/${name}` } },
            },
          },
        },
      },
      '404': { description: 'Not found' },
    },
  };
}

function createCreateOperation(entity: EntitySchema): OperationObject {
  const name = capitalize(entity.name);
  return {
    tags: [entity.name],
    summary: `Create a ${entity.name}`,
    operationId: `create${name}`,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${name}Create` },
        },
      },
    },
    responses: {
      '201': {
        description: 'Created',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { data: { $ref: `#/components/schemas/${name}` } },
            },
          },
        },
      },
      '400': { description: 'Invalid input' },
    },
  };
}

function createUpdateOperation(entity: EntitySchema): OperationObject {
  const name = capitalize(entity.name);
  return {
    tags: [entity.name],
    summary: `Update a ${entity.name}`,
    operationId: `update${name}`,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${name}Update` },
        },
      },
    },
    responses: {
      '200': {
        description: 'Updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { data: { $ref: `#/components/schemas/${name}` } },
            },
          },
        },
      },
      '404': { description: 'Not found' },
    },
  };
}

function createPatchOperation(entity: EntitySchema): OperationObject {
  return {
    ...createUpdateOperation(entity),
    operationId: `patch${capitalize(entity.name)}`,
    summary: `Partially update a ${entity.name}`,
  };
}

function createDeleteOperation(entity: EntitySchema): OperationObject {
  return {
    tags: [entity.name],
    summary: `Delete a ${entity.name}`,
    operationId: `delete${capitalize(entity.name)}`,
    responses: {
      '204': { description: 'Deleted' },
      '404': { description: 'Not found' },
    },
  };
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
