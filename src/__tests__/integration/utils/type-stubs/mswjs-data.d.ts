/**
 * Type stubs for @mswjs/data
 *
 * These stubs provide enough type information to validate generated code
 * without requiring the actual @mswjs/data package in the temp directory.
 */

declare module '@mswjs/data' {
  // Query types
  export interface WhereQuery<T> {
    equals?: T;
    not?: T;
    in?: T[];
    notIn?: T[];
    lt?: T;
    lte?: T;
    gt?: T;
    gte?: T;
    contains?: string;
    startsWith?: string;
    endsWith?: string;
  }

  export type WhereClause<TEntity> = {
    [K in keyof TEntity]?: WhereQuery<TEntity[K]> | TEntity[K];
  };

  export interface FindOptions<TEntity> {
    where: WhereClause<TEntity>;
  }

  export interface UpdateOptions<TEntity> {
    where: WhereClause<TEntity>;
    data: Partial<TEntity>;
  }

  // Entity model interface - defines the methods available on each entity
  export interface EntityModel<TEntity> {
    getAll(): TEntity[];
    findFirst(options: FindOptions<TEntity>): TEntity | null;
    findMany(options: FindOptions<TEntity>): TEntity[];
    create(data: Partial<TEntity>): TEntity;
    update(options: UpdateOptions<TEntity>): TEntity | null;
    delete(options: FindOptions<TEntity>): TEntity | null;
    count(): number;
  }

  // Factory definition type - maps entity names to their field definitions
  export type FactoryDefinition = {
    [entityName: string]: {
      [fieldName: string]: (() => unknown) | ReturnType<typeof primaryKey> | ReturnType<typeof nullable>;
    };
  };

  // The database type returned by factory()
  // Each entity name maps to an EntityModel
  export type Database<TDef extends FactoryDefinition> = {
    [K in keyof TDef]: EntityModel<{
      [F in keyof TDef[K]]: TDef[K][F] extends () => infer R ? R : unknown;
    }>;
  };

  // Factory function - creates a mock database
  export function factory<TDef extends FactoryDefinition>(definition: TDef): Database<TDef>;

  // Field decorators
  export function primaryKey<T>(generator: () => T): () => T;
  export function nullable<T>(generator: () => T): () => T | null;

  // Additional exports that may be used
  export function oneOf<T>(...values: T[]): () => T;
  export function manyOf<T>(entityName: string): () => T[];
}
