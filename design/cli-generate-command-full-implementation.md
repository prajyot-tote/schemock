# CLI Generate Command - Full Implementation Spec

> **Status**: NOT IMPLEMENTED - This is the core missing feature of Schemock
> **Priority**: CRITICAL - Without this, the library doesn't work as designed
> **Created**: 2025-12-15 from deep analysis session

---

## Executive Summary

The `schemock generate` command is the CORE of the entire library. It reads schema definitions and generates:
- TypeScript types
- Adapter-specific client code (Mock, Supabase, Firebase, Fetch, GraphQL)
- React Query hooks
- MSW handlers (mock only)
- Seed utilities (mock only)

**Current State**: Only `generate:openapi` and `generate:postman` exist. The main `generate` command is a stub.

---

## Table of Contents

1. [CLI Interface](#1-cli-interface)
2. [Configuration](#2-configuration)
3. [Schema Discovery](#3-schema-discovery)
4. [Schema Analysis](#4-schema-analysis)
5. [Utilities](#5-utilities)
6. [Type Generation](#6-type-generation)
7. [Mock Adapter Generation](#7-mock-adapter-generation)
8. [Supabase Adapter Generation](#8-supabase-adapter-generation)
9. [Firebase Adapter Generation](#9-firebase-adapter-generation)
10. [Fetch Adapter Generation](#10-fetch-adapter-generation)
11. [Hooks Generation](#11-hooks-generation)
12. [Main Generate Command](#12-main-generate-command)
13. [File Structure](#13-file-structure)
14. [Testing Plan](#14-testing-plan)

---

## 1. CLI Interface

### Command Signature

```bash
npx schemock generate [options]

Options:
  --adapter, -a <type>    Adapter type: mock|supabase|firebase|fetch|graphql (default: mock)
  --output, -o <dir>      Output directory (default: ./src/generated)
  --config, -c <file>     Config file path (default: ./schemock.config.ts)
  --watch, -w             Watch mode - regenerate on schema changes
  --dry-run               Show what would be generated without writing files
  --verbose, -v           Verbose output
```

### Expected Output

```
$ npx schemock generate --adapter mock

🔍 Schemock Generate

  Adapter: mock
  Output:  ./src/generated

📦 Discovering schemas...
   Found: User (src/schemas/user.ts)
   Found: Post (src/schemas/post.ts)
   Found: Comment (src/schemas/comment.ts)
   Found: Tag (src/schemas/tag.ts)
   Found: PostTag (src/schemas/post-tag.ts)
   Total: 5 schemas

📝 Generating types...
   ✓ types.ts (User, Post, Comment, Tag + Create/Update/Filter types)

🔌 Generating mock adapter...
   ✓ db.ts (@mswjs/data factory with 5 entities)
   ✓ handlers.ts (25 MSW handlers)
   ✓ seed.ts (seed/reset utilities)
   ✓ client.ts (API client with relations support)

⚛️  Generating React hooks...
   ✓ hooks.ts (25 hooks: useUsers, useUser, useCreateUser, ...)

📦 Generating barrel exports...
   ✓ index.ts

✅ Generated mock adapter in ./src/generated

Usage:
  import { useUsers, useCreateUser } from './src/generated';
```

---

## 2. Configuration

### File: `schemock.config.ts`

```typescript
// Types for configuration
export interface SchemockConfig {
  // Schema discovery
  schemas: string;                    // Glob pattern, default: './src/schemas/**/*.ts'

  // Output
  output: string;                     // Output directory, default: './src/generated'

  // Default adapter
  adapter: 'mock' | 'supabase' | 'firebase' | 'fetch' | 'graphql';

  // API configuration
  apiPrefix: string;                  // Default: '/api'

  // Pluralization overrides
  pluralization?: {
    custom?: Record<string, string>;  // e.g., { person: 'people' }
  };

  // Custom faker mappings (extend defaults)
  fakerMappings?: FakerMapping[];

  // Adapter-specific configuration
  adapters?: {
    mock?: MockAdapterConfig;
    supabase?: SupabaseAdapterConfig;
    firebase?: FirebaseAdapterConfig;
    fetch?: FetchAdapterConfig;
    graphql?: GraphQLAdapterConfig;
  };
}

export interface MockAdapterConfig {
  seed?: Record<string, number>;      // Default seed counts per entity
  delay?: number;                     // Simulated network delay (ms)
  fakerSeed?: number;                 // For reproducible data
}

export interface SupabaseAdapterConfig {
  tableMap?: Record<string, string>;  // Schema name -> table name
  envPrefix?: string;                 // Env var prefix, default: 'NEXT_PUBLIC_SUPABASE'
}

export interface FirebaseAdapterConfig {
  collectionMap?: Record<string, string>;  // Schema name -> collection name
}

export interface FetchAdapterConfig {
  baseUrl?: string;                   // API base URL
  endpointPattern?: string;           // Pattern for endpoints, default: '{apiPrefix}/{plural}'
}

export interface GraphQLAdapterConfig {
  operations?: {
    findOne?: string;                 // Query name pattern
    findMany?: string;
    create?: string;
    update?: string;
    delete?: string;
  };
}

export interface FakerMapping {
  hint?: string;                      // Match field.hint
  type?: string;                      // Match field.type
  fieldName?: RegExp;                 // Match field name
  call: string;                       // Faker call to generate
}

// Helper function for type-safe config
export function defineConfig(config: Partial<SchemockConfig>): SchemockConfig {
  return {
    schemas: './src/schemas/**/*.ts',
    output: './src/generated',
    adapter: 'mock',
    apiPrefix: '/api',
    ...config,
  };
}
```

### Config Loading

```typescript
// cli/config.ts

import { existsSync } from 'fs';
import { resolve } from 'path';
import type { SchemockConfig } from './types';

const CONFIG_FILES = [
  'schemock.config.ts',
  'schemock.config.js',
  'schemock.config.mjs',
];

export async function loadConfig(configPath?: string): Promise<SchemockConfig> {
  // If explicit path provided, use it
  if (configPath) {
    const fullPath = resolve(configPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    const module = await import(fullPath);
    return module.default || module;
  }

  // Search for config file
  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(filename);
    if (existsSync(fullPath)) {
      const module = await import(fullPath);
      return module.default || module;
    }
  }

  // Return defaults
  return {
    schemas: './src/schemas/**/*.ts',
    output: './src/generated',
    adapter: 'mock',
    apiPrefix: '/api',
  };
}
```

---

## 3. Schema Discovery

```typescript
// cli/discover.ts

import { glob } from 'glob';
import { resolve } from 'path';
import type { EntitySchema } from '../schema/types';

export interface DiscoveryResult {
  schemas: EntitySchema[];
  files: string[];
}

export async function discoverSchemas(pattern: string): Promise<DiscoveryResult> {
  // Find all matching files
  const files = await glob(pattern, {
    absolute: true,
    ignore: ['**/node_modules/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
  });

  if (files.length === 0) {
    throw new Error(`No schema files found matching: ${pattern}`);
  }

  const schemas: EntitySchema[] = [];

  for (const file of files) {
    try {
      // Import the module
      const module = await import(file);

      // Find all exports that are EntitySchema
      for (const [exportName, value] of Object.entries(module)) {
        if (isEntitySchema(value)) {
          schemas.push(value as EntitySchema);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not import ${file}: ${error}`);
    }
  }

  if (schemas.length === 0) {
    throw new Error('No schemas found. Make sure your schema files export defineData() results.');
  }

  return { schemas, files };
}

function isEntitySchema(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.fields === 'object' &&
    obj.fields !== null
  );
}
```

---

## 4. Schema Analysis

```typescript
// cli/analyze.ts

import type { EntitySchema, FieldDefinition, RelationDefinition } from '../schema/types';
import type { SchemockConfig } from './types';
import { pluralize } from './utils/pluralize';
import { fieldToFakerCall } from './utils/faker-mapping';
import { fieldToTsType } from './utils/type-mapping';

// ==================== TYPES ====================

export interface AnalyzedSchema {
  // Names
  name: string;                       // Original: 'user'
  pluralName: string;                 // Pluralized: 'users'
  pascalName: string;                 // PascalCase: 'User'
  pascalPluralName: string;           // PascalCase plural: 'Users'
  tableName: string;                  // DB table: 'users' (from config or pluralName)
  endpoint: string;                   // API endpoint: '/api/users'

  // Structure
  fields: AnalyzedField[];
  relations: AnalyzedRelation[];
  computed: AnalyzedComputed[];

  // Dependencies (for topological sort)
  dependsOn: string[];                // Entities this depends on (via refs)

  // Flags
  hasTimestamps: boolean;
  isJunctionTable: boolean;           // Only refs + maybe enum

  // Original schema reference
  original: EntitySchema;
}

export interface AnalyzedField {
  name: string;
  type: string;                       // Original type
  tsType: string;                     // TypeScript type
  fakerCall: string;                  // Faker.js call for mock generation

  // Flags
  nullable: boolean;
  unique: boolean;
  readOnly: boolean;
  hasDefault: boolean;
  defaultValue: unknown;

  // Reference info
  isRef: boolean;
  refTarget?: string;                 // Target entity name

  // Enum info
  isEnum: boolean;
  enumValues?: string[];

  // Array/Object info
  isArray: boolean;
  isObject: boolean;
  itemType?: AnalyzedField;           // For arrays
  shape?: Record<string, AnalyzedField>; // For objects

  // Constraints
  min?: number;
  max?: number;
  pattern?: string;
}

export interface AnalyzedRelation {
  name: string;                       // Field name: 'posts'
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany';
  target: string;                     // Target entity: 'post'
  targetPascal: string;               // Target PascalCase: 'Post'
  foreignKey: string;                 // FK field: 'authorId' or 'userId'

  // For belongsTo - FK is on this entity
  localField?: string;

  // For manyToMany
  through?: string;                   // Junction table: 'postTag'
  otherKey?: string;                  // Other FK: 'tagId'

  // Flags
  eager: boolean;                     // Always load
}

export interface AnalyzedComputed {
  name: string;
  type: string;
  tsType: string;
}

// ==================== MAIN FUNCTION ====================

export function analyzeSchemas(
  schemas: EntitySchema[],
  config: SchemockConfig
): AnalyzedSchema[] {
  const schemaMap = new Map(schemas.map(s => [s.name, s]));
  const analyzed: AnalyzedSchema[] = [];

  for (const schema of schemas) {
    analyzed.push(analyzeSchema(schema, schemaMap, config));
  }

  // Sort by dependencies (schemas with no deps first)
  return topologicalSort(analyzed);
}

function analyzeSchema(
  schema: EntitySchema,
  schemaMap: Map<string, EntitySchema>,
  config: SchemockConfig
): AnalyzedSchema {
  const plural = pluralize(schema.name, config.pluralization);
  const adapterConfig = config.adapters?.[config.adapter];

  // Determine table name from config or default
  let tableName = plural;
  if (config.adapter === 'supabase' && adapterConfig?.tableMap?.[schema.name]) {
    tableName = adapterConfig.tableMap[schema.name];
  } else if (config.adapter === 'firebase' && adapterConfig?.collectionMap?.[schema.name]) {
    tableName = adapterConfig.collectionMap[schema.name];
  }

  const result: AnalyzedSchema = {
    name: schema.name,
    pluralName: plural,
    pascalName: toPascalCase(schema.name),
    pascalPluralName: toPascalCase(plural),
    tableName,
    endpoint: `${config.apiPrefix}/${plural}`,

    fields: [],
    relations: [],
    computed: [],

    dependsOn: [],

    hasTimestamps: schema.timestamps ?? true,
    isJunctionTable: false,

    original: schema,
  };

  // Analyze fields
  let refCount = 0;
  let nonRefNonIdCount = 0;

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    const analyzedField = analyzeField(fieldName, field, config);
    result.fields.push(analyzedField);

    if (analyzedField.isRef) {
      refCount++;
      if (analyzedField.refTarget) {
        result.dependsOn.push(analyzedField.refTarget);
      }
    } else if (fieldName !== 'id') {
      nonRefNonIdCount++;
    }
  }

  // Detect junction table (2+ refs, 0-1 other fields like 'role')
  result.isJunctionTable = refCount >= 2 && nonRefNonIdCount <= 1;

  // Analyze relations
  if (schema.relations) {
    for (const [relName, rel] of Object.entries(schema.relations)) {
      result.relations.push(analyzeRelation(relName, rel));
    }
  }

  // Analyze computed fields
  if (schema.computed) {
    for (const [compName, comp] of Object.entries(schema.computed)) {
      result.computed.push({
        name: compName,
        type: comp.type,
        tsType: primitiveToTs(comp.type),
      });
    }
  }

  return result;
}

function analyzeField(
  name: string,
  field: FieldDefinition,
  config: SchemockConfig
): AnalyzedField {
  const result: AnalyzedField = {
    name,
    type: field.type,
    tsType: fieldToTsType(field),
    fakerCall: fieldToFakerCall(name, field, config),

    nullable: field.nullable ?? false,
    unique: field.unique ?? false,
    readOnly: field.readOnly ?? false,
    hasDefault: field.default !== undefined,
    defaultValue: field.default,

    isRef: field.type === 'ref',
    refTarget: field.type === 'ref' ? field.target : undefined,

    isEnum: field.type === 'enum' || (field.values?.length ?? 0) > 0,
    enumValues: field.values as string[] | undefined,

    isArray: field.type === 'array',
    isObject: field.type === 'object',

    min: field.constraints?.min,
    max: field.constraints?.max,
    pattern: field.constraints?.pattern,
  };

  // Handle nested types
  if (field.type === 'array' && field.items) {
    result.itemType = analyzeField('item', field.items, config);
  }
  if (field.type === 'object' && field.shape) {
    result.shape = {};
    for (const [k, v] of Object.entries(field.shape)) {
      result.shape[k] = analyzeField(k, v, config);
    }
  }

  return result;
}

function analyzeRelation(name: string, rel: RelationDefinition): AnalyzedRelation {
  const result: AnalyzedRelation = {
    name,
    type: rel.type,
    target: rel.target,
    targetPascal: toPascalCase(rel.target),
    foreignKey: rel.foreignKey,
    eager: rel.eager ?? false,
  };

  if (rel.type === 'belongsTo') {
    result.localField = rel.foreignKey;
  }

  if (rel.type === 'hasMany' && rel.through) {
    result.type = 'manyToMany';
    result.through = rel.through;
    result.otherKey = rel.otherKey;
  }

  return result;
}

// ==================== HELPERS ====================

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function primitiveToTs(type: string): string {
  switch (type) {
    case 'string': return 'string';
    case 'number':
    case 'int':
    case 'float': return 'number';
    case 'boolean': return 'boolean';
    case 'date': return 'Date';
    default: return 'unknown';
  }
}

function topologicalSort(schemas: AnalyzedSchema[]): AnalyzedSchema[] {
  const sorted: AnalyzedSchema[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const schemaMap = new Map(schemas.map(s => [s.name, s]));

  function visit(schema: AnalyzedSchema) {
    if (visited.has(schema.name)) return;
    if (visiting.has(schema.name)) {
      // Circular dependency - just add it
      console.warn(`Warning: Circular dependency involving ${schema.name}`);
      return;
    }

    visiting.add(schema.name);

    for (const dep of schema.dependsOn) {
      const depSchema = schemaMap.get(dep);
      if (depSchema) {
        visit(depSchema);
      }
    }

    visiting.delete(schema.name);
    visited.add(schema.name);
    sorted.push(schema);
  }

  for (const schema of schemas) {
    visit(schema);
  }

  return sorted;
}
```

---

## 5. Utilities

### 5.1 Pluralization

```typescript
// cli/utils/pluralize.ts

const irregulars: Record<string, string> = {
  person: 'people',
  child: 'children',
  man: 'men',
  woman: 'women',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  goose: 'geese',
  ox: 'oxen',
  leaf: 'leaves',
  life: 'lives',
  knife: 'knives',
  wife: 'wives',
  self: 'selves',
  elf: 'elves',
  loaf: 'loaves',
  potato: 'potatoes',
  tomato: 'tomatoes',
  cactus: 'cacti',
  focus: 'foci',
  fungus: 'fungi',
  nucleus: 'nuclei',
  syllabus: 'syllabi',
  analysis: 'analyses',
  diagnosis: 'diagnoses',
  thesis: 'theses',
  crisis: 'crises',
  phenomenon: 'phenomena',
  criterion: 'criteria',
  datum: 'data',
};

const uncountables = new Set([
  'sheep', 'fish', 'deer', 'species', 'series',
  'news', 'money', 'rice', 'information', 'equipment',
]);

export interface PluralizeConfig {
  custom?: Record<string, string>;
}

export function pluralize(word: string, config?: PluralizeConfig): string {
  const lower = word.toLowerCase();

  // Check custom overrides first
  if (config?.custom?.[lower]) {
    return config.custom[lower];
  }

  // Check irregulars
  if (irregulars[lower]) {
    return irregulars[lower];
  }

  // Check uncountables
  if (uncountables.has(lower)) {
    return lower;
  }

  // Apply rules
  if (lower.endsWith('y') && !isVowel(lower[lower.length - 2])) {
    return lower.slice(0, -1) + 'ies';
  }
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z') ||
      lower.endsWith('ch') || lower.endsWith('sh')) {
    return lower + 'es';
  }
  if (lower.endsWith('f')) {
    return lower.slice(0, -1) + 'ves';
  }
  if (lower.endsWith('fe')) {
    return lower.slice(0, -2) + 'ves';
  }

  return lower + 's';
}

function isVowel(char: string): boolean {
  return 'aeiou'.includes(char?.toLowerCase() ?? '');
}
```

### 5.2 Type Mapping

```typescript
// cli/utils/type-mapping.ts

import type { FieldDefinition } from '../../schema/types';

export function fieldToTsType(field: FieldDefinition): string {
  switch (field.type) {
    case 'uuid':
    case 'string':
    case 'email':
    case 'url':
      return 'string';

    case 'number':
    case 'int':
    case 'float':
      return 'number';

    case 'boolean':
      return 'boolean';

    case 'date':
      return 'Date';

    case 'enum':
      if (field.values && field.values.length > 0) {
        return field.values.map(v => `'${v}'`).join(' | ');
      }
      return 'string';

    case 'array':
      if (field.items) {
        return `${fieldToTsType(field.items)}[]`;
      }
      return 'unknown[]';

    case 'object':
      if (field.shape) {
        const props = Object.entries(field.shape)
          .map(([k, v]) => `${k}: ${fieldToTsType(v)}`)
          .join('; ');
        return `{ ${props} }`;
      }
      return 'Record<string, unknown>';

    case 'json':
      return 'unknown';

    case 'ref':
      return 'string'; // FK is always string UUID

    default:
      return 'unknown';
  }
}
```

### 5.3 Faker Mapping

```typescript
// cli/utils/faker-mapping.ts

import type { FieldDefinition } from '../../schema/types';
import type { SchemockConfig, FakerMapping } from '../types';

// Default mappings
const defaultMappings: FakerMapping[] = [
  // By hint - Person
  { hint: 'person.fullName', call: 'faker.person.fullName()' },
  { hint: 'person.firstName', call: 'faker.person.firstName()' },
  { hint: 'person.lastName', call: 'faker.person.lastName()' },
  { hint: 'person.bio', call: 'faker.lorem.paragraph()' },
  { hint: 'person.jobTitle', call: 'faker.person.jobTitle()' },

  // By hint - Internet
  { hint: 'internet.email', call: 'faker.internet.email()' },
  { hint: 'internet.url', call: 'faker.internet.url()' },
  { hint: 'internet.avatar', call: 'faker.image.avatar()' },
  { hint: 'internet.username', call: 'faker.internet.username()' },
  { hint: 'internet.password', call: 'faker.internet.password()' },

  // By hint - Lorem
  { hint: 'lorem.word', call: 'faker.lorem.word()' },
  { hint: 'lorem.sentence', call: 'faker.lorem.sentence()' },
  { hint: 'lorem.paragraph', call: 'faker.lorem.paragraph()' },
  { hint: 'lorem.paragraphs', call: 'faker.lorem.paragraphs(3)' },
  { hint: 'lorem.text', call: 'faker.lorem.text()' },

  // By hint - Image
  { hint: 'image.avatar', call: 'faker.image.avatar()' },
  { hint: 'image.url', call: 'faker.image.url()' },

  // By hint - Location
  { hint: 'location.city', call: 'faker.location.city()' },
  { hint: 'location.country', call: 'faker.location.country()' },
  { hint: 'location.streetAddress', call: 'faker.location.streetAddress()' },
  { hint: 'location.zipCode', call: 'faker.location.zipCode()' },
  { hint: 'location.latitude', call: 'faker.location.latitude()' },
  { hint: 'location.longitude', call: 'faker.location.longitude()' },

  // By hint - Commerce
  { hint: 'commerce.price', call: 'parseFloat(faker.commerce.price())' },
  { hint: 'commerce.productName', call: 'faker.commerce.productName()' },
  { hint: 'commerce.department', call: 'faker.commerce.department()' },

  // By hint - Company
  { hint: 'company.name', call: 'faker.company.name()' },
  { hint: 'company.catchPhrase', call: 'faker.company.catchPhrase()' },

  // By hint - Color
  { hint: 'color.rgb', call: 'faker.color.rgb()' },
  { hint: 'color.human', call: 'faker.color.human()' },

  // By hint - Date
  { hint: 'date.past', call: 'faker.date.past()' },
  { hint: 'date.future', call: 'faker.date.future()' },
  { hint: 'date.recent', call: 'faker.date.recent()' },
  { hint: 'date.birthdate', call: 'faker.date.birthdate()' },

  // By field name patterns
  { fieldName: /^email$/i, call: 'faker.internet.email()' },
  { fieldName: /^name$/i, call: 'faker.person.fullName()' },
  { fieldName: /firstName/i, call: 'faker.person.firstName()' },
  { fieldName: /lastName/i, call: 'faker.person.lastName()' },
  { fieldName: /phone/i, call: 'faker.phone.number()' },
  { fieldName: /avatar/i, call: 'faker.image.avatar()' },
  { fieldName: /image|photo|picture/i, call: 'faker.image.url()' },
  { fieldName: /url|link|website/i, call: 'faker.internet.url()' },
  { fieldName: /address/i, call: 'faker.location.streetAddress()' },
  { fieldName: /city/i, call: 'faker.location.city()' },
  { fieldName: /country/i, call: 'faker.location.country()' },
  { fieldName: /zip|postal/i, call: 'faker.location.zipCode()' },
  { fieldName: /price|cost|amount/i, call: 'parseFloat(faker.commerce.price())' },
  { fieldName: /title/i, call: 'faker.lorem.sentence({ min: 3, max: 8 })' },
  { fieldName: /description|content|body|text/i, call: 'faker.lorem.paragraphs(2)' },
  { fieldName: /bio|about/i, call: 'faker.lorem.paragraph()' },
  { fieldName: /color/i, call: 'faker.color.rgb()' },
  { fieldName: /slug/i, call: 'faker.helpers.slugify(faker.lorem.words(3))' },
  { fieldName: /token|key|secret/i, call: 'faker.string.alphanumeric(32)' },

  // By type (fallback)
  { type: 'uuid', call: 'faker.string.uuid()' },
  { type: 'email', call: 'faker.internet.email()' },
  { type: 'url', call: 'faker.internet.url()' },
  { type: 'string', call: 'faker.lorem.word()' },
  { type: 'number', call: 'faker.number.int({ min: 1, max: 1000 })' },
  { type: 'int', call: 'faker.number.int({ min: 1, max: 1000 })' },
  { type: 'float', call: 'faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })' },
  { type: 'boolean', call: 'faker.datatype.boolean()' },
  { type: 'date', call: 'faker.date.recent()' },
  { type: 'json', call: '{}' },
  { type: 'ref', call: 'faker.string.uuid()' },
];

export function fieldToFakerCall(
  fieldName: string,
  field: FieldDefinition,
  config: SchemockConfig
): string {
  // Merge custom mappings with defaults (custom takes priority)
  const mappings = [
    ...(config.fakerMappings || []),
    ...defaultMappings,
  ];

  // Handle special types first

  // Enum
  if (field.type === 'enum' || (field.values && field.values.length > 0)) {
    const values = (field.values as string[]).map(v => `'${v}'`).join(', ');
    return `faker.helpers.arrayElement([${values}])`;
  }

  // Array
  if (field.type === 'array') {
    const itemCall = field.items
      ? fieldToFakerCall('item', field.items, config)
      : 'faker.lorem.word()';
    const min = field.constraints?.min ?? 1;
    const max = field.constraints?.max ?? 5;
    return `Array.from({ length: faker.number.int({ min: ${min}, max: ${max} }) }, () => ${itemCall})`;
  }

  // Object
  if (field.type === 'object' && field.shape) {
    const props = Object.entries(field.shape)
      .map(([k, v]) => `${k}: ${fieldToFakerCall(k, v, config)}`)
      .join(', ');
    return `({ ${props} })`;
  }

  // Try hint first (highest priority)
  if (field.hint) {
    const match = mappings.find(m => m.hint === field.hint);
    if (match) return match.call;
  }

  // Try field name pattern
  for (const mapping of mappings) {
    if (mapping.fieldName && mapping.fieldName.test(fieldName)) {
      return mapping.call;
    }
  }

  // Try type with constraints
  if (field.type === 'number' || field.type === 'int') {
    const min = field.constraints?.min ?? 1;
    const max = field.constraints?.max ?? 1000;
    return `faker.number.int({ min: ${min}, max: ${max} })`;
  }
  if (field.type === 'float') {
    const min = field.constraints?.min ?? 0;
    const max = field.constraints?.max ?? 1000;
    return `faker.number.float({ min: ${min}, max: ${max}, fractionDigits: 2 })`;
  }
  if (field.type === 'string' && (field.constraints?.min || field.constraints?.max)) {
    const min = field.constraints?.min ?? 1;
    const max = field.constraints?.max ?? 100;
    return `faker.string.alphanumeric({ length: { min: ${min}, max: ${max} } })`;
  }

  // Try type fallback
  const typeMatch = mappings.find(m => m.type === field.type);
  if (typeMatch) return typeMatch.call;

  // Ultimate fallback
  return 'faker.lorem.word()';
}
```

### 5.4 Code Builder

```typescript
// cli/utils/code-builder.ts

/**
 * Helper class for building generated code with proper indentation
 */
export class CodeBuilder {
  private lines: string[] = [];
  private indentLevel = 0;
  private indentStr = '  '; // 2 spaces

  indent(): this {
    this.indentLevel++;
    return this;
  }

  dedent(): this {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
    return this;
  }

  line(content: string = ''): this {
    if (content === '') {
      this.lines.push('');
    } else {
      this.lines.push(this.indentStr.repeat(this.indentLevel) + content);
    }
    return this;
  }

  comment(text: string): this {
    return this.line(`// ${text}`);
  }

  docComment(text: string): this {
    return this.line(`/** ${text} */`);
  }

  block(opener: string, fn: () => void, closer: string = '}'): this {
    this.line(opener);
    this.indent();
    fn();
    this.dedent();
    this.line(closer);
    return this;
  }

  toString(): string {
    return this.lines.join('\n');
  }
}
```

---

## 6. Type Generation

```typescript
// cli/generators/types.ts

import type { AnalyzedSchema, AnalyzedField, AnalyzedRelation } from '../analyze';
import { CodeBuilder } from '../utils/code-builder';

export function generateTypes(schemas: AnalyzedSchema[]): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.comment('Regenerate with: npx schemock generate');
  code.line();

  // Generate types for each non-junction schema
  for (const schema of schemas) {
    if (schema.isJunctionTable) continue;
    generateEntityTypes(code, schema, schemas);
  }

  // Generate common types
  generateCommonTypes(code);

  return code.toString();
}

function generateEntityTypes(
  code: CodeBuilder,
  schema: AnalyzedSchema,
  allSchemas: AnalyzedSchema[]
): void {
  const { pascalName, fields, relations, computed, hasTimestamps } = schema;

  // ========== Main Entity Type ==========
  code.docComment(`${pascalName} entity`);
  code.block(`export interface ${pascalName} {`, () => {
    // Fields
    for (const field of fields) {
      const opt = field.nullable ? '?' : '';
      code.line(`${field.name}${opt}: ${field.tsType};`);
    }

    // Timestamps
    if (hasTimestamps) {
      code.line('createdAt: Date;');
      code.line('updatedAt: Date;');
    }

    // Computed
    for (const comp of computed) {
      code.line(`${comp.name}: ${comp.tsType};`);
    }

    // Relations (optional - loaded on demand)
    for (const rel of relations) {
      const relType = rel.type === 'hasMany' || rel.type === 'manyToMany'
        ? `${rel.targetPascal}[]`
        : rel.targetPascal;
      code.line(`${rel.name}?: ${relType};`);
    }
  });
  code.line();

  // ========== With-Relation Types ==========
  for (const rel of relations) {
    const relType = rel.type === 'hasMany' || rel.type === 'manyToMany'
      ? `${rel.targetPascal}[]`
      : rel.targetPascal;
    const typeName = `${pascalName}With${toPascalCase(rel.name)}`;

    code.docComment(`${pascalName} with ${rel.name} loaded`);
    code.block(`export interface ${typeName} extends Omit<${pascalName}, '${rel.name}'> {`, () => {
      code.line(`${rel.name}: ${relType};`);
    });
    code.line();
  }

  // ========== Create Type ==========
  code.docComment(`Data for creating a ${pascalName}`);
  code.block(`export interface ${pascalName}Create {`, () => {
    for (const field of fields) {
      if (field.name === 'id' || field.readOnly) continue;
      const opt = field.nullable || field.hasDefault ? '?' : '';
      code.line(`${field.name}${opt}: ${field.tsType};`);
    }

    // Nested creates for hasMany/hasOne
    for (const rel of relations) {
      if (rel.type === 'hasMany') {
        code.line(`${rel.name}?: ${rel.targetPascal}Create[];`);
      } else if (rel.type === 'hasOne') {
        code.line(`${rel.name}?: ${rel.targetPascal}Create;`);
      }
    }
  });
  code.line();

  // ========== Update Type ==========
  code.docComment(`Data for updating a ${pascalName}`);
  code.block(`export interface ${pascalName}Update {`, () => {
    for (const field of fields) {
      if (field.name === 'id' || field.readOnly) continue;
      code.line(`${field.name}?: ${field.tsType};`);
    }
  });
  code.line();

  // ========== Filter Type ==========
  code.docComment(`Filter options for querying ${pascalName}`);
  code.block(`export interface ${pascalName}Filter {`, () => {
    for (const field of fields) {
      code.line(`${field.name}?: ${field.tsType} | ${pascalName}FieldFilter<${field.tsType}>;`);
    }
  });
  code.line();

  // ========== Include Type ==========
  if (relations.length > 0) {
    const relNames = relations.map(r => `'${r.name}'`).join(' | ');
    code.docComment(`Relations that can be included when fetching ${pascalName}`);
    code.line(`export type ${pascalName}Include = ${relNames};`);
    code.line();
  }
}

function generateCommonTypes(code: CodeBuilder): void {
  // Field filter type
  code.docComment('Generic field filter for complex queries');
  code.block('export interface FieldFilter<T> {', () => {
    code.line('equals?: T;');
    code.line('not?: T;');
    code.line('in?: T[];');
    code.line('notIn?: T[];');
    code.line('lt?: T;');
    code.line('lte?: T;');
    code.line('gt?: T;');
    code.line('gte?: T;');
    code.line('contains?: string;');
    code.line('startsWith?: string;');
    code.line('endsWith?: string;');
    code.line('isNull?: boolean;');
  });
  code.line();

  // Alias for consistency
  code.line('export type { FieldFilter as UserFieldFilter };');
  code.line();

  // Query options
  code.docComment('Common query options');
  code.block('export interface QueryOptions<TFilter, TInclude extends string = never> {', () => {
    code.line('where?: TFilter;');
    code.line('include?: TInclude[];');
    code.line('orderBy?: Record<string, "asc" | "desc">;');
    code.line('limit?: number;');
    code.line('offset?: number;');
    code.line('cursor?: string;');
  });
  code.line();

  // List response
  code.docComment('Paginated list response');
  code.block('export interface ListResponse<T> {', () => {
    code.line('data: T[];');
    code.block('meta: {', () => {
      code.line('total: number;');
      code.line('limit: number;');
      code.line('offset: number;');
      code.line('hasMore: boolean;');
      code.line('nextCursor?: string;');
    });
  });
  code.line();

  // Item response
  code.docComment('Single item response');
  code.block('export interface ItemResponse<T> {', () => {
    code.line('data: T;');
  });
  code.line();
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
```

---

## 7. Mock Adapter Generation

### 7.1 Database Factory (`db.ts`)

```typescript
// cli/generators/mock/db.ts

import type { AnalyzedSchema } from '../../analyze';
import type { MockAdapterConfig } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

export function generateMockDb(
  schemas: AnalyzedSchema[],
  config: MockAdapterConfig
): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import { factory, primaryKey, nullable } from '@mswjs/data';");
  code.line("import { faker } from '@faker-js/faker';");
  code.line();

  // Set faker seed
  const seed = config.fakerSeed ?? 'Date.now()';
  code.line(`faker.seed(${seed});`);
  code.line();

  // Generate factory
  code.block('export const db = factory({', () => {
    for (const schema of schemas) {
      generateEntityFactory(code, schema);
    }
  }, '});');
  code.line();

  code.line('export type Database = typeof db;');

  return code.toString();
}

function generateEntityFactory(code: CodeBuilder, schema: AnalyzedSchema): void {
  code.block(`${schema.name}: {`, () => {
    for (const field of schema.fields) {
      if (field.name === 'id') {
        code.line('id: primaryKey(faker.string.uuid),');
      } else if (field.nullable) {
        code.line(`${field.name}: nullable(() => ${field.fakerCall}),`);
      } else {
        code.line(`${field.name}: () => ${field.fakerCall},`);
      }
    }

    if (schema.hasTimestamps) {
      code.line('createdAt: () => faker.date.recent({ days: 30 }),');
      code.line('updatedAt: () => new Date(),');
    }
  }, '},');
}
```

### 7.2 MSW Handlers (`handlers.ts`)

```typescript
// cli/generators/mock/handlers.ts

import type { AnalyzedSchema } from '../../analyze';
import { CodeBuilder } from '../../utils/code-builder';

export function generateMockHandlers(
  schemas: AnalyzedSchema[],
  apiPrefix: string
): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import { http, HttpResponse } from 'msw';");
  code.line("import { db } from './db';");
  code.line();

  code.block('export const handlers = [', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      generateEntityHandlers(code, schema, apiPrefix);
    }
  }, '];');

  return code.toString();
}

function generateEntityHandlers(
  code: CodeBuilder,
  schema: AnalyzedSchema,
  apiPrefix: string
): void {
  const { name, pascalName, endpoint } = schema;

  code.comment(`${pascalName} handlers`);

  // GET list
  code.block(`http.get('${endpoint}', ({ request }) => {`, () => {
    code.line('const url = new URL(request.url);');
    code.line("const limit = parseInt(url.searchParams.get('limit') || '20');");
    code.line("const offset = parseInt(url.searchParams.get('offset') || '0');");
    code.line(`const all = db.${name}.getAll();`);
    code.line('const data = all.slice(offset, offset + limit);');
    code.line('return HttpResponse.json({');
    code.indent();
    code.line('data,');
    code.line('meta: { total: all.length, limit, offset, hasMore: offset + limit < all.length },');
    code.dedent();
    code.line('});');
  }, '}),');
  code.line();

  // GET single
  code.block(`http.get('${endpoint}/:id', ({ params }) => {`, () => {
    code.line(`const item = db.${name}.findFirst({`);
    code.line('  where: { id: { equals: params.id as string } }');
    code.line('});');
    code.line('if (!item) return new HttpResponse(null, { status: 404 });');
    code.line('return HttpResponse.json({ data: item });');
  }, '}),');
  code.line();

  // POST create
  code.block(`http.post('${endpoint}', async ({ request }) => {`, () => {
    code.line('const body = await request.json() as Record<string, unknown>;');
    code.line(`const item = db.${name}.create(body);`);
    code.line('return HttpResponse.json({ data: item }, { status: 201 });');
  }, '}),');
  code.line();

  // PUT update
  code.block(`http.put('${endpoint}/:id', async ({ params, request }) => {`, () => {
    code.line('const body = await request.json() as Record<string, unknown>;');
    code.line(`const item = db.${name}.update({`);
    code.line('  where: { id: { equals: params.id as string } },');
    code.line('  data: { ...body, updatedAt: new Date() },');
    code.line('});');
    code.line('if (!item) return new HttpResponse(null, { status: 404 });');
    code.line('return HttpResponse.json({ data: item });');
  }, '}),');
  code.line();

  // DELETE
  code.block(`http.delete('${endpoint}/:id', ({ params }) => {`, () => {
    code.line(`const item = db.${name}.delete({`);
    code.line('  where: { id: { equals: params.id as string } }');
    code.line('});');
    code.line('if (!item) return new HttpResponse(null, { status: 404 });');
    code.line('return new HttpResponse(null, { status: 204 });');
  }, '}),');
  code.line();
}
```

### 7.3 Seed Utilities (`seed.ts`)

```typescript
// cli/generators/mock/seed.ts

import type { AnalyzedSchema } from '../../analyze';
import type { MockAdapterConfig } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

export function generateSeed(
  schemas: AnalyzedSchema[],
  config: MockAdapterConfig
): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import { db } from './db';");
  code.line();

  // Type for seed counts
  code.block('export interface SeedCounts {', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      code.line(`${schema.name}?: number;`);
    }
  });
  code.line();

  // Default counts
  code.block('const defaultCounts: Required<SeedCounts> = {', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      const count = config.seed?.[schema.name] ?? 10;
      code.line(`${schema.name}: ${count},`);
    }
  }, '};');
  code.line();

  // Seed function
  code.block('export function seed(counts: SeedCounts = {}): void {', () => {
    code.line('const merged = { ...defaultCounts, ...counts };');
    code.line();

    // Generate in dependency order (schemas are already sorted)
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      code.block(`for (let i = 0; i < merged.${schema.name}; i++) {`, () => {
        code.line(`db.${schema.name}.create({});`);
      });
    }
  });
  code.line();

  // Reset function
  code.block('export function reset(): void {', () => {
    // Delete in reverse order (dependents first)
    for (const schema of [...schemas].reverse()) {
      code.line(`db.${schema.name}.deleteMany({ where: {} });`);
    }
  });
  code.line();

  // Get all function (for debugging)
  code.block('export function getAll(): Record<string, unknown[]> {', () => {
    code.block('return {', () => {
      for (const schema of schemas) {
        code.line(`${schema.name}: db.${schema.name}.getAll(),`);
      }
    }, '};');
  });

  return code.toString();
}
```

### 7.4 Mock Client (`client.ts`)

```typescript
// cli/generators/mock/client.ts

import type { AnalyzedSchema } from '../../analyze';
import { CodeBuilder } from '../../utils/code-builder';

export function generateMockClient(schemas: AnalyzedSchema[]): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import { db } from './db';");
  code.line("import type * as Types from './types';");
  code.line();

  // Helper for filtering
  code.block('function applyFilter<T>(items: T[], filter: Record<string, unknown>): T[] {', () => {
    code.block('return items.filter(item => {', () => {
      code.block('for (const [key, value] of Object.entries(filter)) {', () => {
        code.line('const itemValue = (item as Record<string, unknown>)[key];');
        code.block('if (typeof value === "object" && value !== null) {', () => {
          code.line('const f = value as Record<string, unknown>;');
          code.line("if ('equals' in f && itemValue !== f.equals) return false;");
          code.line("if ('not' in f && itemValue === f.not) return false;");
          code.line("if ('in' in f && !(f.in as unknown[]).includes(itemValue)) return false;");
          code.line("if ('contains' in f && !String(itemValue).includes(f.contains as string)) return false;");
          code.line("if ('gt' in f && (itemValue as number) <= (f.gt as number)) return false;");
          code.line("if ('lt' in f && (itemValue as number) >= (f.lt as number)) return false;");
          code.line("if ('gte' in f && (itemValue as number) < (f.gte as number)) return false;");
          code.line("if ('lte' in f && (itemValue as number) > (f.lte as number)) return false;");
        }, '} else {');
        code.indent();
        code.line('if (itemValue !== value) return false;');
        code.dedent();
        code.line('}');
      });
      code.line('return true;');
    }, '});');
  });
  code.line();

  // Generate API
  code.block('export const api = {', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      generateEntityApi(code, schema, schemas);
    }
  }, '};');

  return code.toString();
}

function generateEntityApi(
  code: CodeBuilder,
  schema: AnalyzedSchema,
  allSchemas: AnalyzedSchema[]
): void {
  const { name, pascalName, relations } = schema;
  const hasRelations = relations.length > 0;

  code.block(`${name}: {`, () => {
    // LIST
    code.block(`list: async (options?: Types.QueryOptions<Types.${pascalName}Filter${hasRelations ? `, Types.${pascalName}Include` : ''}>): Promise<Types.ListResponse<Types.${pascalName}>> => {`, () => {
      code.line(`let items = db.${name}.getAll() as Types.${pascalName}[];`);
      code.line();

      // Filter
      code.block('if (options?.where) {', () => {
        code.line('items = applyFilter(items, options.where);');
      });
      code.line();

      code.line('const total = items.length;');
      code.line();

      // Sort
      code.block('if (options?.orderBy) {', () => {
        code.line('const [field, dir] = Object.entries(options.orderBy)[0];');
        code.block('items = [...items].sort((a, b) => {', () => {
          code.line('const aVal = (a as Record<string, unknown>)[field];');
          code.line('const bVal = (b as Record<string, unknown>)[field];');
          code.line("if (aVal < bVal) return dir === 'asc' ? -1 : 1;");
          code.line("if (aVal > bVal) return dir === 'asc' ? 1 : -1;");
          code.line('return 0;');
        }, '});');
      });
      code.line();

      // Paginate
      code.line('const limit = options?.limit ?? 20;');
      code.line('const offset = options?.offset ?? 0;');
      code.line('items = items.slice(offset, offset + limit);');
      code.line();

      // Load relations
      if (hasRelations) {
        code.block('if (options?.include?.length) {', () => {
          code.block('items = items.map(item => {', () => {
            code.line('const result = { ...item } as Record<string, unknown>;');

            for (const rel of relations) {
              code.block(`if (options.include!.includes('${rel.name}')) {`, () => {
                generateRelationLoad(code, schema, rel);
              });
            }

            code.line(`return result as Types.${pascalName};`);
          }, '});');
        });
        code.line();
      }

      code.line('return { data: items, meta: { total, limit, offset, hasMore: offset + limit < total } };');
    }, '},');
    code.line();

    // GET
    code.block(`get: async (id: string, options?: { include?: ${hasRelations ? `Types.${pascalName}Include[]` : 'never[]'} }): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`const item = db.${name}.findFirst({ where: { id: { equals: id } } }) as Types.${pascalName} | null;`);
      code.line(`if (!item) throw new Error('${pascalName} not found');`);
      code.line();

      if (hasRelations) {
        code.line('const result = { ...item } as Record<string, unknown>;');
        code.line();
        code.block('if (options?.include?.length) {', () => {
          for (const rel of relations) {
            code.block(`if (options.include.includes('${rel.name}')) {`, () => {
              generateRelationLoad(code, schema, rel);
            });
          }
        });
        code.line();
        code.line(`return { data: result as Types.${pascalName} };`);
      } else {
        code.line('return { data: item };');
      }
    }, '},');
    code.line();

    // CREATE
    generateCreateMethod(code, schema);
    code.line();

    // UPDATE
    code.block(`update: async (id: string, input: Types.${pascalName}Update): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`const item = db.${name}.update({`);
      code.line('  where: { id: { equals: id } },');
      code.line('  data: { ...input, updatedAt: new Date() },');
      code.line(`}) as Types.${pascalName} | null;`);
      code.line(`if (!item) throw new Error('${pascalName} not found');`);
      code.line('return { data: item };');
    }, '},');
    code.line();

    // DELETE
    code.block('delete: async (id: string): Promise<void> => {', () => {
      code.line(`const item = db.${name}.delete({ where: { id: { equals: id } } });`);
      code.line(`if (!item) throw new Error('${pascalName} not found');`);
    }, '},');
  }, '},');
  code.line();
}

function generateRelationLoad(
  code: CodeBuilder,
  schema: AnalyzedSchema,
  rel: AnalyzedRelation
): void {
  if (rel.type === 'hasMany') {
    code.line(`result.${rel.name} = db.${rel.target}.findMany({`);
    code.line(`  where: { ${rel.foreignKey}: { equals: item.id } }`);
    code.line('});');
  } else if (rel.type === 'hasOne') {
    code.line(`result.${rel.name} = db.${rel.target}.findFirst({`);
    code.line(`  where: { ${rel.foreignKey}: { equals: item.id } }`);
    code.line('});');
  } else if (rel.type === 'belongsTo') {
    code.line(`result.${rel.name} = db.${rel.target}.findFirst({`);
    code.line(`  where: { id: { equals: (item as Record<string, unknown>).${rel.localField} as string } }`);
    code.line('});');
  } else if (rel.type === 'manyToMany') {
    code.line(`const junctions = db.${rel.through}.findMany({`);
    code.line(`  where: { ${schema.name}Id: { equals: item.id } }`);
    code.line('});');
    code.line(`result.${rel.name} = junctions`);
    code.line(`  .map(j => db.${rel.target}.findFirst({`);
    code.line(`    where: { id: { equals: (j as Record<string, unknown>).${rel.otherKey} as string } }`);
    code.line('  }))');
    code.line('  .filter(Boolean);');
  }
}

function generateCreateMethod(code: CodeBuilder, schema: AnalyzedSchema): void {
  const { name, pascalName, relations } = schema;
  const nestedRels = relations.filter(r => r.type === 'hasMany' || r.type === 'hasOne');

  code.block(`create: async (input: Types.${pascalName}Create): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
    if (nestedRels.length > 0) {
      // Extract nested creates
      const relNames = nestedRels.map(r => r.name).join(', ');
      code.line(`const { ${relNames}, ...data } = input;`);
      code.line();
      code.line(`const item = db.${name}.create(data) as Types.${pascalName};`);
      code.line();

      for (const rel of nestedRels) {
        code.block(`if (${rel.name}) {`, () => {
          if (rel.type === 'hasMany') {
            code.block(`for (const nested of ${rel.name}) {`, () => {
              code.line(`db.${rel.target}.create({ ...nested, ${rel.foreignKey}: item.id });`);
            });
          } else {
            code.line(`db.${rel.target}.create({ ...${rel.name}, ${rel.foreignKey}: item.id });`);
          }
        });
      }

      code.line();
      code.line('return { data: item };');
    } else {
      code.line(`const item = db.${name}.create(input) as Types.${pascalName};`);
      code.line('return { data: item };');
    }
  }, '},');
}
```

---

## 8. Supabase Adapter Generation

```typescript
// cli/generators/supabase/client.ts

import type { AnalyzedSchema } from '../../analyze';
import type { SupabaseAdapterConfig } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

export function generateSupabaseClient(
  schemas: AnalyzedSchema[],
  config: SupabaseAdapterConfig
): string {
  const code = new CodeBuilder();
  const envPrefix = config.envPrefix ?? 'NEXT_PUBLIC_SUPABASE';

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import { createClient } from '@supabase/supabase-js';");
  code.line("import type * as Types from './types';");
  code.line();

  code.line(`const supabaseUrl = process.env.${envPrefix}_URL!;`);
  code.line(`const supabaseKey = process.env.${envPrefix}_ANON_KEY!;`);
  code.line();

  code.line('export const supabase = createClient(supabaseUrl, supabaseKey);');
  code.line();

  // Helper for building select with relations
  code.block("function buildSelect(include?: string[]): string {", () => {
    code.line("if (!include?.length) return '*';");
    code.line("return `*, ${include.map(rel => `${rel}(*)`).join(', ')}`;");
  });
  code.line();

  // Generate API
  code.block('export const api = {', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      generateSupabaseEntityApi(code, schema);
    }
  }, '};');

  return code.toString();
}

function generateSupabaseEntityApi(code: CodeBuilder, schema: AnalyzedSchema): void {
  const { name, pascalName, tableName, relations } = schema;
  const hasRelations = relations.length > 0;

  code.block(`${name}: {`, () => {
    // LIST
    code.block(`list: async (options?: Types.QueryOptions<Types.${pascalName}Filter${hasRelations ? `, Types.${pascalName}Include` : ''}>): Promise<Types.ListResponse<Types.${pascalName}>> => {`, () => {
      code.line('const select = buildSelect(options?.include);');
      code.line(`let query = supabase.from('${tableName}').select(select, { count: 'exact' });`);
      code.line();

      // Filters
      code.block('if (options?.where) {', () => {
        code.block('for (const [key, value] of Object.entries(options.where)) {', () => {
          code.block('if (typeof value === "object" && value !== null) {', () => {
            code.line('const f = value as Record<string, unknown>;');
            code.line("if ('equals' in f) query = query.eq(key, f.equals);");
            code.line("if ('not' in f) query = query.neq(key, f.not);");
            code.line("if ('in' in f) query = query.in(key, f.in as unknown[]);");
            code.line("if ('contains' in f) query = query.ilike(key, `%${f.contains}%`);");
            code.line("if ('startsWith' in f) query = query.ilike(key, `${f.startsWith}%`);");
            code.line("if ('gt' in f) query = query.gt(key, f.gt);");
            code.line("if ('gte' in f) query = query.gte(key, f.gte);");
            code.line("if ('lt' in f) query = query.lt(key, f.lt);");
            code.line("if ('lte' in f) query = query.lte(key, f.lte);");
            code.line("if ('isNull' in f) f.isNull ? query = query.is(key, null) : query = query.not(key, 'is', null);");
          }, '} else {');
          code.indent();
          code.line('query = query.eq(key, value);');
          code.dedent();
          code.line('}');
        });
      });
      code.line();

      // Ordering
      code.block('if (options?.orderBy) {', () => {
        code.block('for (const [field, dir] of Object.entries(options.orderBy)) {', () => {
          code.line("query = query.order(field, { ascending: dir === 'asc' });");
        });
      });
      code.line();

      // Pagination
      code.line('const limit = options?.limit ?? 20;');
      code.line('const offset = options?.offset ?? 0;');
      code.line('query = query.range(offset, offset + limit - 1);');
      code.line();

      code.line('const { data, error, count } = await query;');
      code.line('if (error) throw error;');
      code.line();
      code.line('return {');
      code.line(`  data: (data || []) as Types.${pascalName}[],`);
      code.line('  meta: { total: count || 0, limit, offset, hasMore: offset + limit < (count || 0) },');
      code.line('};');
    }, '},');
    code.line();

    // GET
    code.block(`get: async (id: string, options?: { include?: ${hasRelations ? `Types.${pascalName}Include[]` : 'never[]'} }): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line('const select = buildSelect(options?.include);');
      code.line(`const { data, error } = await supabase.from('${tableName}').select(select).eq('id', id).single();`);
      code.line('if (error) throw error;');
      code.line(`return { data: data as Types.${pascalName} };`);
    }, '},');
    code.line();

    // CREATE
    code.block(`create: async (input: Types.${pascalName}Create): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`const { data, error } = await supabase.from('${tableName}').insert(input).select().single();`);
      code.line('if (error) throw error;');
      code.line(`return { data: data as Types.${pascalName} };`);
    }, '},');
    code.line();

    // UPDATE
    code.block(`update: async (id: string, input: Types.${pascalName}Update): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`const { data, error } = await supabase.from('${tableName}').update(input).eq('id', id).select().single();`);
      code.line('if (error) throw error;');
      code.line(`return { data: data as Types.${pascalName} };`);
    }, '},');
    code.line();

    // DELETE
    code.block('delete: async (id: string): Promise<void> => {', () => {
      code.line(`const { error } = await supabase.from('${tableName}').delete().eq('id', id);`);
      code.line('if (error) throw error;');
    }, '},');
  }, '},');
  code.line();
}
```

---

## 9. Firebase Adapter Generation

```typescript
// cli/generators/firebase/client.ts

import type { AnalyzedSchema } from '../../analyze';
import type { FirebaseAdapterConfig } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

export function generateFirebaseClient(
  schemas: AnalyzedSchema[],
  config: FirebaseAdapterConfig
): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import {");
  code.line("  collection,");
  code.line("  doc,");
  code.line("  getDoc,");
  code.line("  getDocs,");
  code.line("  addDoc,");
  code.line("  updateDoc,");
  code.line("  deleteDoc,");
  code.line("  query,");
  code.line("  where,");
  code.line("  orderBy,");
  code.line("  limit as fbLimit,");
  code.line("  startAfter,");
  code.line("  Firestore,");
  code.line("} from 'firebase/firestore';");
  code.line("import type * as Types from './types';");
  code.line();

  code.comment('Import your Firebase instance');
  code.line("import { db as firestore } from '../lib/firebase';");
  code.line();

  code.block('export const api = {', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      generateFirebaseEntityApi(code, schema, config, schemas);
    }
  }, '};');

  return code.toString();
}

function generateFirebaseEntityApi(
  code: CodeBuilder,
  schema: AnalyzedSchema,
  config: FirebaseAdapterConfig,
  allSchemas: AnalyzedSchema[]
): void {
  const { name, pascalName, relations } = schema;
  const collectionName = config.collectionMap?.[name] ?? schema.pluralName;
  const hasRelations = relations.length > 0;

  code.block(`${name}: {`, () => {
    // LIST
    code.block(`list: async (options?: Types.QueryOptions<Types.${pascalName}Filter${hasRelations ? `, Types.${pascalName}Include` : ''}>): Promise<Types.ListResponse<Types.${pascalName}>> => {`, () => {
      code.line(`let q = query(collection(firestore, '${collectionName}'));`);
      code.line();

      // Filters (Firebase has limitations - can only use one inequality filter)
      code.block('if (options?.where) {', () => {
        code.block('for (const [key, value] of Object.entries(options.where)) {', () => {
          code.block('if (typeof value === "object" && value !== null) {', () => {
            code.line('const f = value as Record<string, unknown>;');
            code.line("if ('equals' in f) q = query(q, where(key, '==', f.equals));");
            code.line("if ('gt' in f) q = query(q, where(key, '>', f.gt));");
            code.line("if ('gte' in f) q = query(q, where(key, '>=', f.gte));");
            code.line("if ('lt' in f) q = query(q, where(key, '<', f.lt));");
            code.line("if ('lte' in f) q = query(q, where(key, '<=', f.lte));");
            code.line("if ('in' in f) q = query(q, where(key, 'in', f.in));");
          }, '} else {');
          code.indent();
          code.line("q = query(q, where(key, '==', value));");
          code.dedent();
          code.line('}');
        });
      });
      code.line();

      // Ordering
      code.block('if (options?.orderBy) {', () => {
        code.block('for (const [field, dir] of Object.entries(options.orderBy)) {', () => {
          code.line("q = query(q, orderBy(field, dir as 'asc' | 'desc'));");
        });
      });
      code.line();

      // Pagination
      code.line('const queryLimit = options?.limit ?? 20;');
      code.line('q = query(q, fbLimit(queryLimit));');
      code.line();

      code.line('const snapshot = await getDocs(q);');
      code.line(`let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Types.${pascalName}[];`);
      code.line();

      // Load relations (Firebase requires separate queries)
      if (hasRelations) {
        code.block('if (options?.include?.length) {', () => {
          code.block('items = await Promise.all(items.map(async (item) => {', () => {
            code.line('const result = { ...item } as Record<string, unknown>;');

            for (const rel of relations) {
              code.block(`if (options.include!.includes('${rel.name}')) {`, () => {
                generateFirebaseRelationLoad(code, schema, rel, config);
              });
            }

            code.line(`return result as Types.${pascalName};`);
          }, '}));');
        });
      }
      code.line();

      code.line('return {');
      code.line('  data: items,');
      code.line('  meta: { total: items.length, limit: queryLimit, offset: 0, hasMore: items.length === queryLimit },');
      code.line('};');
    }, '},');
    code.line();

    // GET
    code.block(`get: async (id: string, options?: { include?: ${hasRelations ? `Types.${pascalName}Include[]` : 'never[]'} }): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`const docRef = doc(firestore, '${collectionName}', id);`);
      code.line('const snapshot = await getDoc(docRef);');
      code.line(`if (!snapshot.exists()) throw new Error('${pascalName} not found');`);
      code.line(`let item = { id: snapshot.id, ...snapshot.data() } as Types.${pascalName};`);

      if (hasRelations) {
        code.line();
        code.block('if (options?.include?.length) {', () => {
          code.line('const result = { ...item } as Record<string, unknown>;');

          for (const rel of relations) {
            code.block(`if (options.include.includes('${rel.name}')) {`, () => {
              generateFirebaseRelationLoad(code, schema, rel, config);
            });
          }

          code.line(`item = result as Types.${pascalName};`);
        });
      }

      code.line();
      code.line('return { data: item };');
    }, '},');
    code.line();

    // CREATE
    code.block(`create: async (input: Types.${pascalName}Create): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line('const data = { ...input, createdAt: new Date(), updatedAt: new Date() };');
      code.line(`const docRef = await addDoc(collection(firestore, '${collectionName}'), data);`);
      code.line(`return { data: { id: docRef.id, ...data } as Types.${pascalName} };`);
    }, '},');
    code.line();

    // UPDATE
    code.block(`update: async (id: string, input: Types.${pascalName}Update): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`const docRef = doc(firestore, '${collectionName}', id);`);
      code.line('await updateDoc(docRef, { ...input, updatedAt: new Date() });');
      code.line('const snapshot = await getDoc(docRef);');
      code.line(`return { data: { id: snapshot.id, ...snapshot.data() } as Types.${pascalName} };`);
    }, '},');
    code.line();

    // DELETE
    code.block('delete: async (id: string): Promise<void> => {', () => {
      code.line(`await deleteDoc(doc(firestore, '${collectionName}', id));`);
    }, '},');
  }, '},');
  code.line();
}

function generateFirebaseRelationLoad(
  code: CodeBuilder,
  schema: AnalyzedSchema,
  rel: AnalyzedRelation,
  config: FirebaseAdapterConfig
): void {
  const targetCollection = config.collectionMap?.[rel.target] ?? rel.target + 's';

  if (rel.type === 'hasMany') {
    code.line(`const ${rel.name}Query = query(`);
    code.line(`  collection(firestore, '${targetCollection}'),`);
    code.line(`  where('${rel.foreignKey}', '==', item.id)`);
    code.line(');');
    code.line(`const ${rel.name}Snapshot = await getDocs(${rel.name}Query);`);
    code.line(`result.${rel.name} = ${rel.name}Snapshot.docs.map(d => ({ id: d.id, ...d.data() }));`);
  } else if (rel.type === 'hasOne') {
    code.line(`const ${rel.name}Query = query(`);
    code.line(`  collection(firestore, '${targetCollection}'),`);
    code.line(`  where('${rel.foreignKey}', '==', item.id),`);
    code.line('  fbLimit(1)');
    code.line(');');
    code.line(`const ${rel.name}Snapshot = await getDocs(${rel.name}Query);`);
    code.line(`result.${rel.name} = ${rel.name}Snapshot.docs[0] ? { id: ${rel.name}Snapshot.docs[0].id, ...${rel.name}Snapshot.docs[0].data() } : null;`);
  } else if (rel.type === 'belongsTo') {
    code.line(`const ${rel.name}Ref = doc(firestore, '${targetCollection}', (item as Record<string, unknown>).${rel.localField} as string);`);
    code.line(`const ${rel.name}Snapshot = await getDoc(${rel.name}Ref);`);
    code.line(`result.${rel.name} = ${rel.name}Snapshot.exists() ? { id: ${rel.name}Snapshot.id, ...${rel.name}Snapshot.data() } : null;`);
  }
}
```

---

## 10. Fetch Adapter Generation

```typescript
// cli/generators/fetch/client.ts

import type { AnalyzedSchema } from '../../analyze';
import type { FetchAdapterConfig } from '../../types';
import { CodeBuilder } from '../../utils/code-builder';

export function generateFetchClient(
  schemas: AnalyzedSchema[],
  config: FetchAdapterConfig
): string {
  const code = new CodeBuilder();
  const baseUrl = config.baseUrl ?? '';

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import type * as Types from './types';");
  code.line();

  code.line(`const BASE_URL = '${baseUrl}';`);
  code.line();

  // Fetch helper
  code.block('async function request<T>(path: string, options?: RequestInit): Promise<T> {', () => {
    code.line('const response = await fetch(`${BASE_URL}${path}`, {');
    code.line("  headers: { 'Content-Type': 'application/json', ...options?.headers },");
    code.line('  ...options,');
    code.line('});');
    code.line('if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);');
    code.line('if (response.status === 204) return undefined as T;');
    code.line('return response.json();');
  });
  code.line();

  // Build query string helper
  code.block('function buildQuery(options?: Record<string, unknown>): string {', () => {
    code.line("if (!options) return '';");
    code.line('const params = new URLSearchParams();');
    code.block('for (const [key, value] of Object.entries(options)) {', () => {
      code.line('if (value !== undefined) {');
      code.line("  params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));");
      code.line('}');
    });
    code.line("const str = params.toString();");
    code.line("return str ? `?${str}` : '';");
  });
  code.line();

  // Generate API
  code.block('export const api = {', () => {
    for (const schema of schemas) {
      if (schema.isJunctionTable) continue;
      generateFetchEntityApi(code, schema);
    }
  }, '};');

  return code.toString();
}

function generateFetchEntityApi(code: CodeBuilder, schema: AnalyzedSchema): void {
  const { name, pascalName, endpoint, relations } = schema;
  const hasRelations = relations.length > 0;

  code.block(`${name}: {`, () => {
    // LIST
    code.block(`list: async (options?: Types.QueryOptions<Types.${pascalName}Filter${hasRelations ? `, Types.${pascalName}Include` : ''}>): Promise<Types.ListResponse<Types.${pascalName}>> => {`, () => {
      code.line(`return request('${endpoint}' + buildQuery(options));`);
    }, '},');
    code.line();

    // GET
    code.block(`get: async (id: string, options?: { include?: ${hasRelations ? `Types.${pascalName}Include[]` : 'never[]'} }): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`return request(\`${endpoint}/\${id}\` + buildQuery(options));`);
    }, '},');
    code.line();

    // CREATE
    code.block(`create: async (input: Types.${pascalName}Create): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`return request('${endpoint}', {`);
      code.line("  method: 'POST',");
      code.line('  body: JSON.stringify(input),');
      code.line('});');
    }, '},');
    code.line();

    // UPDATE
    code.block(`update: async (id: string, input: Types.${pascalName}Update): Promise<Types.ItemResponse<Types.${pascalName}>> => {`, () => {
      code.line(`return request(\`${endpoint}/\${id}\`, {`);
      code.line("  method: 'PUT',");
      code.line('  body: JSON.stringify(input),');
      code.line('});');
    }, '},');
    code.line();

    // DELETE
    code.block('delete: async (id: string): Promise<void> => {', () => {
      code.line(`await request(\`${endpoint}/\${id}\`, { method: 'DELETE' });`);
    }, '},');
  }, '},');
  code.line();
}
```

---

## 11. Hooks Generation

```typescript
// cli/generators/hooks.ts

import type { AnalyzedSchema } from '../analyze';
import { CodeBuilder } from '../utils/code-builder';

export function generateHooks(schemas: AnalyzedSchema[]): string {
  const code = new CodeBuilder();

  code.comment('GENERATED BY SCHEMOCK - DO NOT EDIT');
  code.line("import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';");
  code.line("import { api } from './client';");
  code.line("import type * as Types from './types';");
  code.line();

  for (const schema of schemas) {
    if (schema.isJunctionTable) continue;
    generateEntityHooks(code, schema);
  }

  return code.toString();
}

function generateEntityHooks(code: CodeBuilder, schema: AnalyzedSchema): void {
  const { name, pascalName, pluralName, relations } = schema;
  const hasRelations = relations.length > 0;

  code.comment(`==================== ${pascalName} Hooks ====================`);
  code.line();

  // useEntities (list)
  code.docComment(`Fetch list of ${pluralName}`);
  code.block(`export function use${pascalName}s(options?: {`, () => {
    code.line(`where?: Types.${pascalName}Filter;`);
    if (hasRelations) {
      code.line(`include?: Types.${pascalName}Include[];`);
    }
    code.line("orderBy?: Record<string, 'asc' | 'desc'>;");
    code.line('limit?: number;');
    code.line('offset?: number;');
    code.line('enabled?: boolean;');
  }, '}) {');
  code.indent();
  code.block('return useQuery({', () => {
    code.line(`queryKey: ['${name}s', options],`);
    code.line(`queryFn: () => api.${name}.list(options),`);
    code.line('enabled: options?.enabled ?? true,');
  }, '});');
  code.dedent();
  code.line('}');
  code.line();

  // useEntity (single)
  code.docComment(`Fetch single ${pascalName} by ID`);
  code.block(`export function use${pascalName}(id: string | undefined, options?: {`, () => {
    if (hasRelations) {
      code.line(`include?: Types.${pascalName}Include[];`);
    }
    code.line('enabled?: boolean;');
  }, '}) {');
  code.indent();
  code.block('return useQuery({', () => {
    code.line(`queryKey: ['${name}s', id, options?.include],`);
    code.line(`queryFn: () => api.${name}.get(id!, { include: options?.include }),`);
    code.line('enabled: (options?.enabled ?? true) && !!id,');
  }, '});');
  code.dedent();
  code.line('}');
  code.line();

  // Convenience hooks for common includes
  for (const rel of relations) {
    const hookName = `use${pascalName}With${toPascalCase(rel.name)}`;
    code.docComment(`Fetch ${pascalName} with ${rel.name} included`);
    code.block(`export function ${hookName}(id: string | undefined) {`, () => {
      code.line(`return use${pascalName}(id, { include: ['${rel.name}'] });`);
    });
    code.line();
  }

  // useCreateEntity
  code.docComment(`Create a new ${pascalName}`);
  code.block(`export function useCreate${pascalName}() {`, () => {
    code.line('const queryClient = useQueryClient();');
    code.block('return useMutation({', () => {
      code.line(`mutationFn: (data: Types.${pascalName}Create) => api.${name}.create(data),`);
      code.block('onSuccess: () => {', () => {
        code.line(`queryClient.invalidateQueries({ queryKey: ['${name}s'] });`);
      }, '},');
    }, '});');
  });
  code.line();

  // useUpdateEntity
  code.docComment(`Update an existing ${pascalName}`);
  code.block(`export function useUpdate${pascalName}() {`, () => {
    code.line('const queryClient = useQueryClient();');
    code.block('return useMutation({', () => {
      code.line(`mutationFn: ({ id, data }: { id: string; data: Types.${pascalName}Update }) =>`);
      code.line(`  api.${name}.update(id, data),`);
      code.block('onSuccess: (_, { id }) => {', () => {
        code.line(`queryClient.invalidateQueries({ queryKey: ['${name}s'] });`);
        code.line(`queryClient.invalidateQueries({ queryKey: ['${name}s', id] });`);
      }, '},');
    }, '});');
  });
  code.line();

  // useDeleteEntity
  code.docComment(`Delete a ${pascalName}`);
  code.block(`export function useDelete${pascalName}() {`, () => {
    code.line('const queryClient = useQueryClient();');
    code.block('return useMutation({', () => {
      code.line(`mutationFn: (id: string) => api.${name}.delete(id),`);
      code.block('onSuccess: () => {', () => {
        code.line(`queryClient.invalidateQueries({ queryKey: ['${name}s'] });`);
      }, '},');
    }, '});');
  });
  code.line();
}

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

---

## 12. Main Generate Command

```typescript
// cli/commands/generate.ts

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { loadConfig } from '../config';
import { discoverSchemas } from '../discover';
import { analyzeSchemas } from '../analyze';
import { generateTypes } from '../generators/types';
import { generateMockDb } from '../generators/mock/db';
import { generateMockHandlers } from '../generators/mock/handlers';
import { generateMockClient } from '../generators/mock/client';
import { generateSeed } from '../generators/mock/seed';
import { generateSupabaseClient } from '../generators/supabase/client';
import { generateFirebaseClient } from '../generators/firebase/client';
import { generateFetchClient } from '../generators/fetch/client';
import { generateHooks } from '../generators/hooks';

export interface GenerateOptions {
  adapter?: string;
  output?: string;
  config?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function generate(options: GenerateOptions): Promise<void> {
  console.log('\n🔍 Schemock Generate\n');

  // 1. Load config
  const config = await loadConfig(options.config);
  const adapter = options.adapter || config.adapter || 'mock';
  const outputDir = options.output || config.output || './src/generated';

  console.log(`  Adapter: ${adapter}`);
  console.log(`  Output:  ${outputDir}\n`);

  // 2. Discover schemas
  console.log('📦 Discovering schemas...');
  const { schemas, files } = await discoverSchemas(config.schemas);

  for (const schema of schemas) {
    console.log(`   Found: ${schema.name}`);
  }
  console.log(`   Total: ${schemas.length} schemas\n`);

  // 3. Analyze schemas
  const analyzed = analyzeSchemas(schemas, config);

  // 4. Create output directory
  if (!options.dryRun) {
    await mkdir(outputDir, { recursive: true });
  }

  // 5. Generate types (always)
  console.log('📝 Generating types...');
  const typesCode = generateTypes(analyzed);
  await writeOutput(join(outputDir, 'types.ts'), typesCode, options.dryRun);
  console.log('   ✓ types.ts\n');

  // 6. Generate adapter-specific code
  console.log(`🔌 Generating ${adapter} adapter...`);

  switch (adapter) {
    case 'mock':
      await generateMockAdapter(analyzed, outputDir, config, options);
      break;
    case 'supabase':
      await generateSupabaseAdapter(analyzed, outputDir, config, options);
      break;
    case 'firebase':
      await generateFirebaseAdapter(analyzed, outputDir, config, options);
      break;
    case 'fetch':
      await generateFetchAdapter(analyzed, outputDir, config, options);
      break;
    default:
      throw new Error(`Unknown adapter: ${adapter}`);
  }

  // 7. Generate hooks (always)
  console.log('\n⚛️  Generating React hooks...');
  const hooksCode = generateHooks(analyzed);
  await writeOutput(join(outputDir, 'hooks.ts'), hooksCode, options.dryRun);
  console.log('   ✓ hooks.ts');

  // 8. Generate index.ts
  console.log('\n📦 Generating barrel exports...');
  const indexCode = generateIndex(adapter);
  await writeOutput(join(outputDir, 'index.ts'), indexCode, options.dryRun);
  console.log('   ✓ index.ts');

  // Done
  console.log(`\n✅ Generated ${adapter} adapter in ${outputDir}\n`);

  const firstSchema = analyzed.find(s => !s.isJunctionTable);
  if (firstSchema) {
    console.log('Usage:');
    console.log(`  import { use${firstSchema.pascalName}s, useCreate${firstSchema.pascalName} } from '${outputDir.replace('./', '')}';`);
    console.log('');
  }
}

async function generateMockAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const mockConfig = config.adapters?.mock || {};

  const dbCode = generateMockDb(schemas, mockConfig);
  await writeOutput(join(outputDir, 'db.ts'), dbCode, options.dryRun);
  console.log('   ✓ db.ts');

  const handlersCode = generateMockHandlers(schemas, config.apiPrefix || '/api');
  await writeOutput(join(outputDir, 'handlers.ts'), handlersCode, options.dryRun);
  console.log('   ✓ handlers.ts');

  const seedCode = generateSeed(schemas, mockConfig);
  await writeOutput(join(outputDir, 'seed.ts'), seedCode, options.dryRun);
  console.log('   ✓ seed.ts');

  const clientCode = generateMockClient(schemas);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts');
}

async function generateSupabaseAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const supabaseConfig = config.adapters?.supabase || {};
  const clientCode = generateSupabaseClient(schemas, supabaseConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts');
}

async function generateFirebaseAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const firebaseConfig = config.adapters?.firebase || {};
  const clientCode = generateFirebaseClient(schemas, firebaseConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts');
}

async function generateFetchAdapter(
  schemas: AnalyzedSchema[],
  outputDir: string,
  config: SchemockConfig,
  options: GenerateOptions
): Promise<void> {
  const fetchConfig = config.adapters?.fetch || {};
  const clientCode = generateFetchClient(schemas, fetchConfig);
  await writeOutput(join(outputDir, 'client.ts'), clientCode, options.dryRun);
  console.log('   ✓ client.ts');
}

function generateIndex(adapter: string): string {
  const lines = [
    '// GENERATED BY SCHEMOCK - DO NOT EDIT',
    '',
    "export * from './types';",
    "export * from './hooks';",
    "export { api } from './client';",
  ];

  if (adapter === 'mock') {
    lines.push("export { db } from './db';");
    lines.push("export { handlers } from './handlers';");
    lines.push("export { seed, reset, getAll } from './seed';");
  }

  return lines.join('\n');
}

async function writeOutput(path: string, content: string, dryRun?: boolean): Promise<void> {
  if (dryRun) {
    console.log(`   [DRY RUN] Would write: ${path}`);
    return;
  }
  await writeFile(path, content, 'utf-8');
}
```

---

## 13. File Structure

After implementation, the CLI module should look like:

```
src/
├── cli/
│   ├── index.ts              # CLI entry point
│   ├── config.ts             # Config loading
│   ├── discover.ts           # Schema discovery
│   ├── analyze.ts            # Schema analysis
│   ├── types.ts              # CLI type definitions
│   │
│   ├── utils/
│   │   ├── pluralize.ts      # Pluralization
│   │   ├── type-mapping.ts   # Field → TypeScript type
│   │   ├── faker-mapping.ts  # Field → Faker call
│   │   └── code-builder.ts   # Code generation helper
│   │
│   ├── generators/
│   │   ├── types.ts          # TypeScript types generator
│   │   ├── hooks.ts          # React hooks generator
│   │   │
│   │   ├── mock/
│   │   │   ├── db.ts         # @mswjs/data factory
│   │   │   ├── handlers.ts   # MSW handlers
│   │   │   ├── client.ts     # Mock API client
│   │   │   └── seed.ts       # Seed utilities
│   │   │
│   │   ├── supabase/
│   │   │   └── client.ts     # Supabase client
│   │   │
│   │   ├── firebase/
│   │   │   └── client.ts     # Firebase client
│   │   │
│   │   └── fetch/
│   │       └── client.ts     # Fetch client
│   │
│   └── commands/
│       └── generate.ts       # Main generate command
```

---

## 14. Testing Plan

### Unit Tests

```typescript
// tests/cli/pluralize.test.ts
describe('pluralize', () => {
  it('handles regular plurals', () => {
    expect(pluralize('user')).toBe('users');
    expect(pluralize('post')).toBe('posts');
  });

  it('handles irregulars', () => {
    expect(pluralize('person')).toBe('people');
    expect(pluralize('child')).toBe('children');
  });

  it('handles -y endings', () => {
    expect(pluralize('category')).toBe('categories');
    expect(pluralize('key')).toBe('keys'); // vowel before y
  });

  it('respects custom overrides', () => {
    expect(pluralize('staff', { custom: { staff: 'staff' } })).toBe('staff');
  });
});

// tests/cli/faker-mapping.test.ts
describe('fieldToFakerCall', () => {
  it('maps hints to faker calls', () => {
    const field = { type: 'string', hint: 'person.fullName' };
    expect(fieldToFakerCall('name', field, {})).toBe('faker.person.fullName()');
  });

  it('maps field names to faker calls', () => {
    const field = { type: 'string' };
    expect(fieldToFakerCall('email', field, {})).toBe('faker.internet.email()');
  });

  it('handles enums', () => {
    const field = { type: 'enum', values: ['a', 'b', 'c'] };
    expect(fieldToFakerCall('status', field, {})).toBe("faker.helpers.arrayElement(['a', 'b', 'c'])");
  });

  it('handles number constraints', () => {
    const field = { type: 'number', constraints: { min: 10, max: 100 } };
    expect(fieldToFakerCall('age', field, {})).toBe('faker.number.int({ min: 10, max: 100 })');
  });
});

// tests/cli/analyze.test.ts
describe('analyzeSchemas', () => {
  it('detects junction tables', () => {
    const schema = defineData('postTag', {
      id: field.uuid(),
      postId: field.ref('post'),
      tagId: field.ref('tag'),
    });

    const [analyzed] = analyzeSchemas([schema], defaultConfig);
    expect(analyzed.isJunctionTable).toBe(true);
  });

  it('extracts relations', () => {
    const schema = defineData('user', {
      id: field.uuid(),
    }, {
      relations: {
        posts: hasMany('post', 'authorId'),
      },
    });

    const [analyzed] = analyzeSchemas([schema], defaultConfig);
    expect(analyzed.relations).toHaveLength(1);
    expect(analyzed.relations[0].type).toBe('hasMany');
  });
});
```

### Integration Tests

```typescript
// tests/cli/generate.integration.test.ts
describe('generate command', () => {
  it('generates mock adapter files', async () => {
    const tmpDir = await createTempDir();

    await generate({
      adapter: 'mock',
      output: tmpDir,
      config: './fixtures/schemock.config.ts',
    });

    expect(await fileExists(join(tmpDir, 'types.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'db.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'handlers.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'client.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'seed.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'hooks.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'index.ts'))).toBe(true);
  });

  it('generates supabase adapter files', async () => {
    const tmpDir = await createTempDir();

    await generate({
      adapter: 'supabase',
      output: tmpDir,
      config: './fixtures/schemock.config.ts',
    });

    expect(await fileExists(join(tmpDir, 'types.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'client.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'hooks.ts'))).toBe(true);
    expect(await fileExists(join(tmpDir, 'index.ts'))).toBe(true);

    // Mock-specific files should NOT exist
    expect(await fileExists(join(tmpDir, 'db.ts'))).toBe(false);
    expect(await fileExists(join(tmpDir, 'handlers.ts'))).toBe(false);
  });

  it('generates valid TypeScript', async () => {
    const tmpDir = await createTempDir();

    await generate({
      adapter: 'mock',
      output: tmpDir,
      config: './fixtures/schemock.config.ts',
    });

    // Type-check generated files
    const result = await exec(`npx tsc --noEmit ${join(tmpDir, '*.ts')}`);
    expect(result.exitCode).toBe(0);
  });
});
```

---

## Summary

This document contains the complete implementation spec for the `schemock generate` command - the core missing feature of Schemock.

**Key components:**
1. CLI interface with options
2. Configuration system
3. Schema discovery and analysis
4. Pluralization, type mapping, faker mapping utilities
5. Type generation with relations support
6. Mock adapter generation (db, handlers, client, seed)
7. Supabase adapter generation
8. Firebase adapter generation
9. Fetch adapter generation
10. React hooks generation with include support
11. Main command orchestration

**Estimated effort:** 3-5 days for full implementation with tests.

**Priority order:**
1. Config + Discovery + Analysis (foundation)
2. Types + Mock adapter (core functionality)
3. Hooks (developer experience)
4. Supabase/Firebase/Fetch adapters (production targets)
5. Tests (quality assurance)
