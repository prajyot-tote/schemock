# OpenAPI Generation

## Overview

Schemock can generate OpenAPI 3.0 specifications from FE schema definitions. This enables:

1. **Contract sharing** - Export spec for backend team
2. **Documentation** - Auto-generated API docs
3. **Validation** - Ensure FE expectations match BE implementation
4. **Code generation** - Backend can generate server stubs

## Generator

```typescript
// src/generator/openapi.ts

import { registry, EntitySchema, ViewSchema } from '../runtime/resolver/registry';

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterObject>;
  };
}

interface GeneratorOptions {
  title?: string;
  version?: string;
  serverUrl?: string;
  includeRelations?: 'all' | 'eager' | 'none';
}

export function generateOpenAPI(options: GeneratorOptions = {}): OpenAPISpec {
  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: options.title ?? 'Generated API',
      version: options.version ?? '1.0.0',
      description: 'Auto-generated from FE schema definitions',
    },
    paths: {},
    components: {
      schemas: {},
      parameters: {
        includeParam: {
          name: 'include',
          in: 'query',
          description: 'Comma-separated list of relations to include',
          schema: { type: 'string' },
        },
        limitParam: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', default: 20, maximum: 100 },
        },
        offsetParam: {
          name: 'offset',
          in: 'query',
          schema: { type: 'integer', default: 0 },
        },
      },
    },
  };

  if (options.serverUrl) {
    spec.servers = [{ url: options.serverUrl }];
  }

  // Generate for each entity
  for (const entity of registry.getAllEntities()) {
    generateEntitySchemas(spec, entity, options);
    generateEntityPaths(spec, entity);
  }

  // Generate for views
  for (const view of registry.getAllViews()) {
    generateViewSchema(spec, view);
    generateViewPath(spec, view);
  }

  return spec;
}
```

## Schema Generation

For each entity, three schemas are generated:

### 1. Response Schema

Includes all fields, relations, and computed fields:

```yaml
User:
  type: object
  required: [id, name, email, createdAt]
  properties:
    id:
      type: string
      format: uuid
    name:
      type: string
    email:
      type: string
      format: email
    createdAt:
      type: string
      format: date-time
    profile:
      $ref: '#/components/schemas/UserProfile'
    posts:
      type: array
      items:
        $ref: '#/components/schemas/Post'
    postCount:
      type: integer
      readOnly: true
      description: 'Computed field'
```

### 2. Create Schema

Excludes id, readOnly fields, and computed fields:

```yaml
UserCreate:
  type: object
  required: [name, email]
  properties:
    name:
      type: string
    email:
      type: string
      format: email
    role:
      type: string
      enum: [admin, user, guest]
      default: user
```

### 3. Update Schema

All fields optional, excludes id and computed:

```yaml
UserUpdate:
  type: object
  properties:
    name:
      type: string
    email:
      type: string
      format: email
    role:
      type: string
      enum: [admin, user, guest]
```

## Path Generation

Standard CRUD endpoints:

```yaml
paths:
  /api/users:
    get:
      summary: List users
      operationId: listUsers
      tags: [User]
      parameters:
        - $ref: '#/components/parameters/limitParam'
        - $ref: '#/components/parameters/offsetParam'
        - $ref: '#/components/parameters/includeParam'
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
                  total:
                    type: integer
                  limit:
                    type: integer
                  offset:
                    type: integer

    post:
      summary: Create user
      operationId: createUser
      tags: [User]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserCreate'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          description: Validation error

  /api/users/{id}:
    get:
      summary: Get user by ID
      operationId: getUser
      tags: [User]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
        - $ref: '#/components/parameters/includeParam'
        - name: computed
          in: query
          description: Computed fields to include
          schema:
            type: string
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          description: Not found

    put:
      summary: Update user
      operationId: updateUser
      tags: [User]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserUpdate'
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          description: Not found

    delete:
      summary: Delete user
      operationId: deleteUser
      tags: [User]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '204':
          description: Deleted
        '404':
          description: Not found

  /api/users/{id}/posts:
    get:
      summary: Get posts for user
      operationId: getUserPosts
      tags: [User]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Post'
```

## View Endpoints

```yaml
/api/users/{id}/full:
  get:
    summary: Get user full view
    operationId: getUserFull
    tags: [Views]
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    responses:
      '200':
        description: Successful response
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserFull'
      '404':
        description: Not found

components:
  schemas:
    UserFull:
      type: object
      description: 'View: user-full'
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        email:
          type: string
          format: email
        profile:
          $ref: '#/components/schemas/UserProfile'
        recentPosts:
          type: array
          items:
            $ref: '#/components/schemas/Post'
          maxItems: 5
        stats:
          type: object
          properties:
            postCount:
              type: integer
            totalViews:
              type: integer
```

## Field Type Mapping

| Schema Field | OpenAPI Type |
|--------------|--------------|
| `field.uuid()` | `{ type: 'string', format: 'uuid' }` |
| `field.string()` | `{ type: 'string' }` |
| `field.string().min(1).max(100)` | `{ type: 'string', minLength: 1, maxLength: 100 }` |
| `field.internet.email()` | `{ type: 'string', format: 'email' }` |
| `field.internet.url()` | `{ type: 'string', format: 'uri' }` |
| `field.date()` | `{ type: 'string', format: 'date-time' }` |
| `field.boolean()` | `{ type: 'boolean' }` |
| `field.number.int()` | `{ type: 'integer' }` |
| `field.number.float()` | `{ type: 'number' }` |
| `field.enum(['a', 'b'])` | `{ type: 'string', enum: ['a', 'b'] }` |
| `field.array(field.string())` | `{ type: 'array', items: { type: 'string' } }` |
| `field.nullable()` | `{ ..., nullable: true }` |
| `field.computed({...})` | `{ ..., readOnly: true }` |

## CLI Usage

```bash
# Generate OpenAPI spec
npx schemock generate:openapi --output ./openapi.yaml

# With options
npx schemock generate:openapi \
  --output ./openapi.yaml \
  --format yaml \
  --title "My API" \
  --version "1.0.0" \
  --server https://api.example.com

# Generate Postman collection
npx schemock generate:postman --output ./postman.json
```

## Programmatic Usage

```typescript
import { generateOpenAPI } from '@schemock/generator/openapi';
import { writeFileSync } from 'fs';
import { dump as yamlDump } from 'js-yaml';

const spec = generateOpenAPI({
  title: 'My API',
  version: '1.0.0',
  serverUrl: 'https://api.example.com',
});

// Output as YAML
writeFileSync('openapi.yaml', yamlDump(spec));

// Output as JSON
writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
```

## Integration with Backend

### Contract Testing

```typescript
// Use generated spec for contract testing
import { generateOpenAPI } from '@schemock/generator/openapi';
import SwaggerParser from '@apidevtools/swagger-parser';

test('API matches spec', async () => {
  const spec = generateOpenAPI();

  // Validate spec is valid OpenAPI
  await SwaggerParser.validate(spec);

  // Compare with backend's actual spec
  const backendSpec = await fetch('/api/openapi.json').then(r => r.json());

  // Assert schemas match
  expect(spec.components.schemas.User)
    .toMatchObject(backendSpec.components.schemas.User);
});
```

### Server Stub Generation

Backend team can use the generated spec with tools like:

- **OpenAPI Generator** - Generate server stubs for any language
- **Swagger Codegen** - Similar to OpenAPI Generator
- **NestJS** - `@nestjs/swagger` for NestJS
- **FastAPI** - Native OpenAPI support
