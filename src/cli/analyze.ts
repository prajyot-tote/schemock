/**
 * Schema analysis for Schemock CLI
 *
 * @module cli/analyze
 * @category CLI
 */

import type { EntitySchema, FieldDefinition, RelationDefinition, RLSConfig, IndexConfig, RPCConfig } from '../schema/types';
import type { SchemockConfig, AnalyzedSchema, AnalyzedField, AnalyzedRelation, AnalyzedComputed, AnalyzedRLS, AnalyzedIndex, AnalyzedRPC } from './types';
import { pluralize, singularize, toPascalCase, toSnakeCase } from './utils/pluralize';
import { fieldToFakerCall } from './utils/faker-mapping';
import { fieldToTsType, primitiveToTs } from './utils/type-mapping';

/**
 * Infer computed field type from naming convention
 *
 * Uses a comprehensive set of naming patterns to infer types:
 * - Numeric: count, total, sum, avg, min, max, amount, price, etc.
 * - Boolean: is*, has*, can*, should*, was*, will*, etc.
 * - String: name, title, label, description, get*Name, *Str, etc.
 * - Date: *At, *Date, *Time, *Timestamp
 * - Array: *List, *Array, *Items, *Collection, all*, get*s
 *
 * @param name - The computed field name to analyze
 * @returns Inferred TypeScript type
 */
function inferComputedType(name: string): string {
  const lowerName = name.toLowerCase();

  // ================== Date patterns (check FIRST - more specific) ==================
  // Date patterns should be checked before number patterns because
  // words like "expirationDate" contain "ration" which matches "ratio"
  if (lowerName.endsWith('at') || lowerName.endsWith('date') ||
      lowerName.endsWith('time') || lowerName.endsWith('timestamp') ||
      lowerName.endsWith('datetime') || lowerName.endsWith('since') ||
      lowerName.endsWith('until') || lowerName.endsWith('deadline') ||
      lowerName.startsWith('date') || lowerName.startsWith('time')) {
    return 'Date';
  }

  // ================== Number patterns ==================
  // Aggregation suffixes
  if (lowerName.endsWith('count') || lowerName.endsWith('total') ||
      lowerName.endsWith('sum') || lowerName.endsWith('avg') ||
      lowerName.endsWith('average') || lowerName.endsWith('min') ||
      lowerName.endsWith('max') || lowerName.endsWith('length') ||
      lowerName.endsWith('size') || lowerName.endsWith('index')) {
    return 'number';
  }

  // Numeric value patterns
  if (lowerName.includes('amount') || lowerName.includes('price') ||
      lowerName.includes('cost') || lowerName.includes('fee') ||
      lowerName.includes('balance') || lowerName.includes('score') ||
      lowerName.includes('rating') || lowerName.includes('rank') ||
      lowerName.includes('level') || lowerName.includes('age') ||
      lowerName.includes('weight') || lowerName.includes('height') ||
      lowerName.includes('width') || lowerName.includes('depth') ||
      lowerName.includes('quantity') || lowerName.includes('percent') ||
      lowerName.includes('ratio') || lowerName.includes('progress') ||
      lowerName.includes('position') || lowerName.includes('order') ||
      lowerName.includes('duration') || lowerName.includes('offset') ||
      lowerName.includes('limit')) {
    return 'number';
  }

  // ================== Boolean patterns ==================
  // Common prefixes
  if (lowerName.startsWith('is') || lowerName.startsWith('has') ||
      lowerName.startsWith('can') || lowerName.startsWith('should') ||
      lowerName.startsWith('will') || lowerName.startsWith('was') ||
      lowerName.startsWith('did') || lowerName.startsWith('does') ||
      lowerName.startsWith('allow') || lowerName.startsWith('enable') ||
      lowerName.startsWith('disable')) {
    return 'boolean';
  }

  // Boolean suffixes
  if (lowerName.endsWith('enabled') || lowerName.endsWith('disabled') ||
      lowerName.endsWith('active') || lowerName.endsWith('visible') ||
      lowerName.endsWith('hidden') || lowerName.endsWith('valid') ||
      lowerName.endsWith('invalid') || lowerName.endsWith('complete') ||
      lowerName.endsWith('empty') || lowerName.endsWith('loading') ||
      lowerName.endsWith('loaded') || lowerName.endsWith('ready') ||
      lowerName.endsWith('available') || lowerName.endsWith('exists') ||
      lowerName.endsWith('selected') || lowerName.endsWith('checked') ||
      lowerName.endsWith('required') || lowerName.endsWith('optional')) {
    return 'boolean';
  }

  // ================== String patterns ==================
  if (lowerName.endsWith('name') || lowerName.endsWith('title') ||
      lowerName.endsWith('label') || lowerName.endsWith('description') ||
      lowerName.endsWith('text') || lowerName.endsWith('content') ||
      lowerName.endsWith('message') || lowerName.endsWith('str') ||
      lowerName.endsWith('string') || lowerName.endsWith('slug') ||
      lowerName.endsWith('path') || lowerName.endsWith('url') ||
      lowerName.endsWith('uri') || lowerName.endsWith('email') ||
      lowerName.endsWith('phone') || lowerName.endsWith('address') ||
      lowerName.endsWith('display') || lowerName.endsWith('format') ||
      lowerName.endsWith('html') || lowerName.endsWith('json') ||
      lowerName.endsWith('type') || lowerName.endsWith('status') ||
      lowerName.endsWith('key') || lowerName.endsWith('id') ||
      lowerName.endsWith('code') || lowerName.endsWith('token') ||
      lowerName.endsWith('hash') || lowerName.endsWith('signature')) {
    return 'string';
  }

  // Common getters that return strings
  if (lowerName.startsWith('get') && (
      lowerName.includes('name') || lowerName.includes('title') ||
      lowerName.includes('label') || lowerName.includes('display') ||
      lowerName.includes('format') || lowerName.includes('string'))) {
    return 'string';
  }

  // ================== Array patterns ==================
  if (lowerName.endsWith('list') || lowerName.endsWith('array') ||
      lowerName.endsWith('items') || lowerName.endsWith('collection') ||
      lowerName.endsWith('all') || lowerName.endsWith('entries') ||
      lowerName.endsWith('values') || lowerName.endsWith('keys') ||
      lowerName.endsWith('ids') || lowerName.endsWith('names') ||
      lowerName.startsWith('all') || lowerName.startsWith('list')) {
    return 'unknown[]';
  }

  // Plural getter patterns (e.g., getUsers, fetchPosts)
  if ((lowerName.startsWith('get') || lowerName.startsWith('fetch') ||
       lowerName.startsWith('load') || lowerName.startsWith('find')) &&
      (lowerName.endsWith('s') && !lowerName.endsWith('ss'))) {
    return 'unknown[]';
  }

  // ================== Object patterns ==================
  if (lowerName.endsWith('config') || lowerName.endsWith('options') ||
      lowerName.endsWith('settings') || lowerName.endsWith('props') ||
      lowerName.endsWith('properties') || lowerName.endsWith('data') ||
      lowerName.endsWith('info') || lowerName.endsWith('meta') ||
      lowerName.endsWith('metadata') || lowerName.endsWith('attrs') ||
      lowerName.endsWith('attributes') || lowerName.endsWith('context') ||
      lowerName.endsWith('state') || lowerName.endsWith('result') ||
      lowerName.endsWith('response') || lowerName.endsWith('payload')) {
    return 'Record<string, unknown>';
  }

  // Default to string for simple getters (safest assumption)
  if (lowerName.startsWith('get') || lowerName.startsWith('compute') ||
      lowerName.startsWith('calculate') || lowerName.startsWith('derive')) {
    // Look for more hints in the name
    const withoutPrefix = lowerName.replace(/^(get|compute|calculate|derive)/, '');
    if (withoutPrefix) {
      return inferComputedType(withoutPrefix);
    }
  }

  // Default to unknown for unrecognized patterns
  return 'unknown';
}

/**
 * Find a schema by name, trying multiple naming variations.
 * This handles cases where relation targets don't exactly match schema names.
 *
 * @param schemaMap - Map of schema names to schemas
 * @param name - The name to search for
 * @returns The matching schema, or undefined if not found
 */
function findSchemaByName(
  schemaMap: Map<string, EntitySchema>,
  name: string
): EntitySchema | undefined {
  // Try exact match first
  const exact = schemaMap.get(name);
  if (exact) return exact;

  // Try singular form
  const singular = singularize(name);
  const singularMatch = schemaMap.get(singular);
  if (singularMatch) return singularMatch;

  // Try plural form
  const plural = pluralize(name);
  const pluralMatch = schemaMap.get(plural);
  if (pluralMatch) return pluralMatch;

  // Try case-insensitive match
  const lowerName = name.toLowerCase();
  for (const [schemaName, schema] of schemaMap) {
    if (schemaName.toLowerCase() === lowerName) return schema;
    if (singularize(schemaName).toLowerCase() === lowerName) return schema;
    if (pluralize(schemaName).toLowerCase() === lowerName) return schema;
  }

  return undefined;
}

/**
 * Analyze multiple schemas and return fully analyzed versions
 *
 * @param schemas - Raw entity schemas
 * @param config - Schemock configuration
 * @returns Analyzed schemas sorted by dependencies (topological order)
 *
 * @example
 * ```typescript
 * const analyzed = analyzeSchemas([userSchema, postSchema], config);
 * // Returns schemas sorted so dependencies come first
 * ```
 */
export function analyzeSchemas(schemas: EntitySchema[], config: SchemockConfig): AnalyzedSchema[] {
  const schemaMap = new Map(schemas.map((s) => [s.name, s]));
  const analyzed: AnalyzedSchema[] = [];

  for (const schema of schemas) {
    analyzed.push(analyzeSchema(schema, schemaMap, config));
  }

  // Sort by dependencies (schemas with no deps first)
  return topologicalSort(analyzed);
}

/**
 * Analyze a single schema
 */
function analyzeSchema(
  schema: EntitySchema,
  schemaMap: Map<string, EntitySchema>,
  config: SchemockConfig
): AnalyzedSchema {
  // Compute both singular and plural forms (handles both user->users and users->users)
  const singular = singularize(schema.name);
  const plural = pluralize(schema.name, config.pluralization);
  const adapterConfig = config.adapters?.[config.adapter];

  // Determine table name from config or default
  let tableName = plural;
  if (config.adapter === 'supabase' && adapterConfig && 'tableMap' in adapterConfig) {
    tableName = adapterConfig.tableMap?.[schema.name] ?? plural;
  } else if (config.adapter === 'firebase' && adapterConfig && 'collectionMap' in adapterConfig) {
    tableName = adapterConfig.collectionMap?.[schema.name] ?? plural;
  }

  const result: AnalyzedSchema = {
    name: schema.name,
    singularName: singular,
    pluralName: plural,
    pascalName: toPascalCase(singular), // Use singular for PascalCase (User, not Users)
    pascalSingularName: toPascalCase(singular),
    pascalPluralName: toPascalCase(plural),
    tableName,
    endpoint: `${config.apiPrefix}/${plural}`,

    fields: [],
    relations: [],
    computed: [],

    dependsOn: [],

    hasTimestamps: schema.timestamps ?? true,
    isJunctionTable: false,

    rls: analyzeRLS(schema.rls),
    indexes: [], // Will be populated after fields analysis
    rpc: [], // Will be populated after RPC analysis

    // Entity Organization & Tagging
    tags: schema.tags ?? [],
    module: schema.module,
    group: schema.group,
    metadata: schema.metadata,

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
      const analyzedRel = analyzeRelation(relName, rel, singular, schema.fields, schemaMap, schema.name);
      result.relations.push(analyzedRel);

      // Add belongsTo targets to dependencies (for topological sort)
      if (analyzedRel.type === 'belongsTo' && !result.dependsOn.includes(analyzedRel.target)) {
        result.dependsOn.push(analyzedRel.target);
      }
    }
  }

  // Analyze computed fields
  if (schema.computed) {
    for (const [compName, comp] of Object.entries(schema.computed)) {
      // Infer type from naming convention since computed fields don't have explicit types
      const inferredType = inferComputedType(compName);
      result.computed.push({
        name: compName,
        type: inferredType,
        tsType: primitiveToTs(inferredType),
      });
    }
  }

  // Analyze indexes (user-defined + auto-generated for FKs and unique fields)
  result.indexes = analyzeIndexes(schema, result.fields, tableName);

  // Analyze RPC functions
  result.rpc = analyzeRPC(schema, tableName, schemaMap);

  return result;
}

/**
 * Analyze a single field
 */
function analyzeField(name: string, field: FieldDefinition, config: SchemockConfig): AnalyzedField {
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
    pattern: field.constraints?.pattern?.source,
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

/**
 * Find a foreign key field in a set of fields that references a target entity.
 *
 * Matching strategy (in order of preference):
 * 1. Find a ref field with target matching the entity (e.g., field.ref('failoverconfig'))
 * 2. Find a field with name matching common patterns (entityId, entity_id, entityID)
 *
 * @param fields - Record of field definitions to search
 * @param entityName - The entity name to match (e.g., 'project', 'user', 'failoverconfig')
 * @returns The matching field name, or undefined if not found
 */
function findForeignKeyField(
  fields: Record<string, FieldDefinition>,
  entityName: string
): string | undefined {
  const lowerEntity = entityName.toLowerCase();
  const singularEntity = singularize(entityName).toLowerCase();
  const pluralEntity = pluralize(entityName).toLowerCase();

  // Strategy 1: Find a ref field that targets this entity
  // This handles cases like: config_id: field.ref('failoverconfig')
  for (const [fieldName, field] of Object.entries(fields)) {
    if (field.type === 'ref' && field.target) {
      const targetLower = field.target.toLowerCase();
      const targetSingular = singularize(field.target).toLowerCase();
      const targetPlural = pluralize(field.target).toLowerCase();

      // Match if target matches entity name in any form (singular/plural)
      if (targetLower === lowerEntity ||
          targetLower === singularEntity ||
          targetLower === pluralEntity ||
          targetSingular === singularEntity ||
          targetPlural === pluralEntity) {
        return fieldName;
      }
    }
  }

  // Strategy 2: Match by field name patterns (legacy behavior)
  // Patterns to match: projectId, project_id, projectID
  const fieldNames = Object.keys(fields);
  const patterns = [
    `${singularEntity}Id`,      // projectId
    `${singularEntity}_id`,     // project_id
    `${singularEntity}ID`,      // projectID
    `${pluralEntity}Id`,        // projectsId (less common but possible)
    `${pluralEntity}_id`,       // projects_id
  ];

  for (const pattern of patterns) {
    const match = fieldNames.find(f => f.toLowerCase() === pattern.toLowerCase());
    if (match) {
      return match; // Return the actual field name (preserving original case)
    }
  }

  return undefined;
}

/**
 * Analyze a relation definition
 *
 * Foreign key inference:
 * - belongsTo: Look for FK field in THIS schema's fields (e.g., project_id, projectId)
 * - hasMany/hasOne: Look for FK field in TARGET schema's fields
 *
 * Falls back to camelCase convention if no matching field is found.
 *
 * @param name - Relation name (e.g., 'posts', 'author')
 * @param rel - Relation definition from schema
 * @param sourceEntitySingular - Singularized name of the entity defining this relation
 * @param localFields - Fields defined on this schema (for belongsTo FK lookup)
 * @param schemaMap - Map of all schemas (for hasMany/hasOne FK lookup in target)
 * @param sourceEntityName - The source entity name (for warning messages)
 */
function analyzeRelation(
  name: string,
  rel: RelationDefinition,
  sourceEntitySingular: string,
  localFields: Record<string, FieldDefinition>,
  schemaMap: Map<string, EntitySchema>,
  sourceEntityName?: string
): AnalyzedRelation {
  const singularTarget = singularize(rel.target);
  let foreignKey: string;
  let fkInferred = false;
  let fkDefaultFallback = false;

  if (rel.foreignKey) {
    // User explicitly specified the FK - use it as-is
    foreignKey = rel.foreignKey;
  } else if (rel.type === 'belongsTo') {
    // FK is on THIS entity, pointing to target
    // Look for existing field that matches the target entity name
    const foundField = findForeignKeyField(localFields, singularTarget);
    if (foundField) {
      foreignKey = foundField;
      fkInferred = true;
    } else {
      foreignKey = `${singularTarget}Id`;
      fkDefaultFallback = true;
    }
  } else {
    // hasMany/hasOne: FK is on the TARGET entity, pointing back to source
    const targetSchema = findSchemaByName(schemaMap, rel.target);
    const targetFields = targetSchema?.fields ?? {};
    const targetRelations = targetSchema?.relations ?? {};
    let foundField: string | undefined;

    // Strategy 1: Look for a belongsTo relation on the target that points back to source
    for (const [, targetRel] of Object.entries(targetRelations)) {
      if (targetRel.type === 'belongsTo') {
        // Check if this belongsTo points back to our source entity
        const belongsToTarget = targetRel.target.toLowerCase();
        const sourceVariants = [
          sourceEntitySingular.toLowerCase(),
          singularize(sourceEntitySingular).toLowerCase(),
          pluralize(sourceEntitySingular).toLowerCase(),
        ];

        const targetMatches = sourceVariants.includes(belongsToTarget) ||
            sourceVariants.includes(singularize(belongsToTarget).toLowerCase()) ||
            sourceVariants.includes(pluralize(belongsToTarget).toLowerCase());

        if (targetMatches) {
          // Found a belongsTo pointing back to source
          if (targetRel.foreignKey) {
            // Use explicitly specified foreignKey
            foundField = targetRel.foreignKey;
          } else {
            // Run the same FK inference logic used for belongsTo
            // Look for a field that matches the belongsTo target
            const belongsToSingular = singularize(targetRel.target);
            foundField = findForeignKeyField(targetFields, belongsToSingular);
          }
          if (foundField) break;
        }
      }
    }

    // Strategy 2: Look for a ref field in target schema that references source
    if (!foundField) {
      foundField = findForeignKeyField(targetFields, sourceEntitySingular);
    }

    if (foundField) {
      foreignKey = foundField;
      fkInferred = true;
    } else {
      foreignKey = `${sourceEntitySingular}Id`;
      fkDefaultFallback = true;
    }
  }

  // Emit warning if FK was not found and we fell back to default naming
  if (fkDefaultFallback) {
    const entityContext = sourceEntityName ? ` in '${sourceEntityName}'` : '';
    const targetInfo = rel.type === 'belongsTo'
      ? `Could not find a field matching '${singularTarget}' (tried: ${singularTarget}Id, ${singularTarget}_id, ref fields targeting ${rel.target})`
      : `Could not find a field in '${rel.target}' pointing back to '${sourceEntitySingular}'`;

    console.warn(
      `\x1b[33m⚠ FK Inference Warning:\x1b[0m Relation '${name}'${entityContext} (${rel.type} → ${rel.target})\n` +
      `  ${targetInfo}\n` +
      `  Using default: '${foreignKey}'\n` +
      `  \x1b[2mTo fix: Add 'foreignKey' option to the relation, e.g.: ${rel.type}('${rel.target}', { foreignKey: 'yourFieldName' })\x1b[0m`
    );
  }

  const result: AnalyzedRelation = {
    name,
    type: rel.type,
    target: rel.target,
    targetPascal: toPascalCase(singularize(rel.target)),
    foreignKey,
    eager: rel.eager ?? false,
    inferred: fkInferred,  // Track whether FK was inferred vs explicit
  };

  if (rel.type === 'belongsTo') {
    result.localField = foreignKey;
  }

  // Check for many-to-many (hasMany with through)
  if (rel.type === 'hasMany' && rel.through) {
    result.type = 'manyToMany';
    result.through = rel.through;
    result.otherKey = rel.otherKey;
  }

  return result;
}

/**
 * Analyze indexes for a schema
 *
 * Generates:
 * 1. User-defined indexes from schema.indexes
 * 2. Auto-generated indexes for FK fields (ref types)
 * 3. Auto-generated indexes for unique fields
 */
function analyzeIndexes(
  schema: EntitySchema,
  fields: AnalyzedField[],
  tableName: string
): AnalyzedIndex[] {
  const indexes: AnalyzedIndex[] = [];
  const existingIndexFields = new Set<string>();

  // 1. Process user-defined indexes
  if (schema.indexes) {
    for (const indexConfig of schema.indexes) {
      const indexName = indexConfig.name ?? `idx_${tableName}_${indexConfig.fields.join('_')}`;

      indexes.push({
        name: indexName,
        tableName,
        fields: indexConfig.fields,
        type: indexConfig.type ?? 'btree',
        unique: indexConfig.unique ?? false,
        using: indexConfig.using,
        where: indexConfig.where,
        concurrently: indexConfig.concurrently ?? false,
        autoGenerated: false,
      });

      // Track which fields already have indexes
      indexConfig.fields.forEach((f) => existingIndexFields.add(f));
    }
  }

  // 2. Auto-generate indexes for FK fields (ref types)
  for (const field of fields) {
    if (field.isRef && !existingIndexFields.has(field.name)) {
      indexes.push({
        name: `idx_${tableName}_${toSnakeCase(field.name)}`,
        tableName,
        fields: [field.name],
        type: 'btree',
        unique: false,
        concurrently: false,
        autoGenerated: true,
      });
      existingIndexFields.add(field.name);
    }
  }

  // 3. Auto-generate indexes for unique fields (except 'id' and 'email' which often have unique constraints)
  for (const field of fields) {
    if (field.unique && field.name !== 'id' && !existingIndexFields.has(field.name)) {
      indexes.push({
        name: `idx_${tableName}_${toSnakeCase(field.name)}_unique`,
        tableName,
        fields: [field.name],
        type: 'btree',
        unique: true,
        concurrently: false,
        autoGenerated: true,
      });
      existingIndexFields.add(field.name);
    }
  }

  return indexes;
}

/**
 * Map common schema types to PostgreSQL types
 */
function schemaToPgType(type: string): string {
  const typeMap: Record<string, string> = {
    uuid: 'UUID',
    string: 'TEXT',
    text: 'TEXT',
    email: 'TEXT',
    url: 'TEXT',
    int: 'INTEGER',
    integer: 'INTEGER',
    number: 'DOUBLE PRECISION',
    float: 'DOUBLE PRECISION',
    boolean: 'BOOLEAN',
    date: 'TIMESTAMPTZ',
    datetime: 'TIMESTAMPTZ',
    json: 'JSONB',
    jsonb: 'JSONB',
    array: 'JSONB',
    object: 'JSONB',
  };
  return typeMap[type.toLowerCase()] ?? 'TEXT';
}

/**
 * Analyze RPC functions for a schema
 */
function analyzeRPC(
  schema: EntitySchema,
  tableName: string,
  schemaMap: Map<string, EntitySchema>
): AnalyzedRPC[] {
  const rpcFunctions: AnalyzedRPC[] = [];

  if (!schema.rpc) {
    return rpcFunctions;
  }

  for (const [name, config] of Object.entries(schema.rpc)) {
    // Determine return type
    const returnsArray = config.returns.endsWith('[]');
    const baseReturnType = returnsArray ? config.returns.slice(0, -2) : config.returns;

    // Check if return type is an entity name
    const isEntityReturn = schemaMap.has(baseReturnType) || baseReturnType === schema.name;

    let pgReturns: string;
    if (config.returns === 'void') {
      pgReturns = 'VOID';
    } else if (isEntityReturn) {
      // Return entity type maps to SETOF tableName
      const targetTable = baseReturnType === schema.name
        ? tableName
        : schemaMap.get(baseReturnType)?.name ?? baseReturnType;
      pgReturns = returnsArray ? `SETOF ${targetTable}` : targetTable;
    } else {
      // Scalar type
      pgReturns = returnsArray ? `${schemaToPgType(baseReturnType)}[]` : schemaToPgType(baseReturnType);
    }

    // Process arguments
    const args = (config.args ?? []).map((arg) => ({
      name: arg.name,
      type: arg.type,
      pgType: schemaToPgType(arg.type),
      default: arg.default,
    }));

    rpcFunctions.push({
      name,
      entityName: schema.name,
      tableName,
      args,
      returns: config.returns,
      pgReturns,
      returnsArray,
      sql: config.sql,
      language: config.language ?? 'sql',
      volatility: config.volatility ?? 'volatile',
      security: config.security ?? 'invoker',
      description: config.description,
    });
  }

  return rpcFunctions;
}

/**
 * Extract function body from arrow function source
 * Converts: (row, ctx) => { ... } to just the body content
 * Or: (row, ctx) => expression to "return expression"
 */
function extractFunctionBody(fnSource: string): string {
  // Remove leading/trailing whitespace
  const trimmed = fnSource.trim();

  // Match arrow function pattern
  const arrowMatch = trimmed.match(/^\([^)]*\)\s*=>\s*(.+)$/s);
  if (!arrowMatch) {
    // Not an arrow function, return as-is
    return trimmed;
  }

  const body = arrowMatch[1].trim();

  // If body starts with {, it's a block body - extract inner content
  if (body.startsWith('{') && body.endsWith('}')) {
    return body.slice(1, -1).trim();
  }

  // Expression body - wrap in return
  return `return ${body};`;
}

/**
 * Serialize an RLS policy function for code generation
 */
function serializeRLSFunction(fn: unknown): string | undefined {
  if (typeof fn !== 'function') return undefined;

  const source = fn.toString();

  // Extract and return the function body
  return extractFunctionBody(source);
}

/**
 * Analyze RLS configuration
 */
function analyzeRLS(rls?: RLSConfig): AnalyzedRLS {
  if (!rls) {
    return {
      enabled: false,
      hasSelect: false,
      hasInsert: false,
      hasUpdate: false,
      hasDelete: false,
      scope: [],
      bypass: [],
    };
  }

  const hasScope = (rls.scope?.length ?? 0) > 0;

  // Check for policies (either JS functions, scope mappings, or custom SQL)
  const hasSelect = !!(rls.select || hasScope || rls.sql?.select);
  const hasInsert = !!(rls.insert || hasScope || rls.sql?.insert);
  const hasUpdate = !!(rls.update || hasScope || rls.sql?.update);
  const hasDelete = !!(rls.delete || hasScope || rls.sql?.delete);

  const enabled = hasSelect || hasInsert || hasUpdate || hasDelete;

  // Serialize function sources for code generation
  const selectSource = serializeRLSFunction(rls.select);
  const insertSource = serializeRLSFunction(rls.insert);
  const updateSource = serializeRLSFunction(rls.update);
  const deleteSource = serializeRLSFunction(rls.delete);

  return {
    enabled,
    hasSelect,
    hasInsert,
    hasUpdate,
    hasDelete,
    scope: rls.scope ?? [],
    bypass: rls.bypass ?? [],
    selectSource,
    insertSource,
    updateSource,
    deleteSource,
    sql: rls.sql,
    original: rls,
  };
}

/**
 * Topological sort of schemas by dependencies
 */
function topologicalSort(schemas: AnalyzedSchema[]): AnalyzedSchema[] {
  const sorted: AnalyzedSchema[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const schemaMap = new Map(schemas.map((s) => [s.name, s]));

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
