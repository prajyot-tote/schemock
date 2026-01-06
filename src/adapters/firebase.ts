/**
 * FirebaseAdapter - Adapter for Firebase/Firestore backends
 *
 * Maps Schemock operations to Firestore document operations.
 *
 * @module adapters/firebase
 * @category Adapters
 */

import type {
  Adapter,
  AdapterContext,
  AdapterResponse,
} from './types';

/**
 * Firestore instance type (from firebase/firestore).
 * Using a minimal interface to avoid requiring the full Firebase package.
 */
export interface Firestore {
  collection(path: string): CollectionReference;
}

/**
 * Firestore collection reference interface.
 */
interface CollectionReference {
  doc(id?: string): DocumentReference;
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  startAfter(doc: unknown): Query;
  get(): Promise<QuerySnapshot>;
  add(data: unknown): Promise<DocumentReference>;
}

/**
 * Firestore document reference interface.
 */
interface DocumentReference {
  id: string;
  get(): Promise<DocumentSnapshot>;
  set(data: unknown, options?: { merge?: boolean }): Promise<void>;
  update(data: unknown): Promise<void>;
  delete(): Promise<void>;
}

/**
 * Firestore query interface.
 */
interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  startAfter(doc: unknown): Query;
  get(): Promise<QuerySnapshot>;
}

/**
 * Firestore document snapshot interface.
 */
interface DocumentSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

/**
 * Firestore query snapshot interface.
 */
interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
  size: number;
}

/**
 * Firebase adapter options.
 */
export interface FirebaseAdapterOptions {
  /** Firestore database instance */
  db: Firestore;
  /** Collection name mapping (entity name -> collection name) */
  collectionMap?: Record<string, string>;
}

/**
 * FirebaseAdapter class implementing the Adapter interface.
 *
 * @example
 * ```typescript
 * import { getFirestore } from 'firebase/firestore';
 *
 * const db = getFirestore(app);
 * const adapter = new FirebaseAdapter({ db });
 *
 * const users = await adapter.findMany({ entity: 'user' });
 * ```
 */
export class FirebaseAdapter implements Adapter {
  /** Adapter name identifier */
  name = 'firebase';

  /** Firestore instance */
  private db: Firestore;

  /** Collection name mapping */
  private collectionMap: Record<string, string>;

  constructor(options: FirebaseAdapterOptions) {
    this.db = options.db;
    this.collectionMap = options.collectionMap ?? {};
  }

  /**
   * Get collection name for entity.
   */
  private getCollection(entity: string): string {
    return this.collectionMap[entity] ?? entity;
  }

  /**
   * Find a single entity by ID.
   */
  async findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    try {
      const collection = this.getCollection(ctx.entity);
      const id = ctx.params?.id as string;

      if (!id) {
        return {
          data: null as unknown as T,
          error: new Error('ID is required for findOne'),
        };
      }

      const doc = await this.db.collection(collection).doc(id).get();

      if (!doc.exists) {
        return {
          data: null as unknown as T,
          error: new Error(`${ctx.entity} not found`),
        };
      }

      return {
        data: { id: doc.id, ...doc.data() } as T,
      };
    } catch (error) {
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Find multiple entities.
   */
  async findMany<T>(ctx: AdapterContext): Promise<AdapterResponse<T[]>> {
    try {
      const collection = this.getCollection(ctx.entity);
      let query: Query | CollectionReference = this.db.collection(collection);

      // Apply filters
      if (ctx.filter) {
        for (const [field, value] of Object.entries(ctx.filter)) {
          if (Array.isArray(value)) {
            query = query.where(field, 'in', value);
          } else {
            query = query.where(field, '==', value);
          }
        }
      }

      // Apply ordering
      if (ctx.orderBy) {
        for (const [field, direction] of Object.entries(ctx.orderBy)) {
          query = query.orderBy(field, direction);
        }
      }

      // Apply limit
      if (ctx.limit !== undefined) {
        query = query.limit(ctx.limit);
      }

      const snapshot = await query.get();

      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[];

      return {
        data,
        meta: {
          total: snapshot.size,
          hasMore: ctx.limit ? snapshot.size === ctx.limit : false,
        },
      };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Create a new entity.
   */
  async create<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    try {
      const collection = this.getCollection(ctx.entity);
      const data = ctx.data as Record<string, unknown>;

      // If ID is provided, use set with that ID
      if (data.id) {
        const id = data.id as string;
        const docData = { ...data };
        delete docData.id;

        await this.db.collection(collection).doc(id).set(docData);
        return { data: { id, ...docData } as T };
      }

      // Otherwise, let Firestore generate an ID
      const docRef = await this.db.collection(collection).add(data);
      return { data: { id: docRef.id, ...data } as T };
    } catch (error) {
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Update an existing entity.
   */
  async update<T>(ctx: AdapterContext): Promise<AdapterResponse<T>> {
    try {
      const collection = this.getCollection(ctx.entity);
      const id = ctx.params?.id as string;

      if (!id) {
        return {
          data: null as unknown as T,
          error: new Error('ID is required for update'),
        };
      }

      const docRef = this.db.collection(collection).doc(id);
      await docRef.update(ctx.data as Record<string, unknown>);

      // Fetch updated document
      const doc = await docRef.get();
      return { data: { id: doc.id, ...doc.data() } as T };
    } catch (error) {
      return {
        data: null as unknown as T,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Delete an entity.
   */
  async delete(ctx: AdapterContext): Promise<AdapterResponse<void>> {
    try {
      const collection = this.getCollection(ctx.entity);
      const id = ctx.params?.id as string;

      if (!id) {
        return {
          data: undefined,
          error: new Error('ID is required for delete'),
        };
      }

      await this.db.collection(collection).doc(id).delete();
      return { data: undefined };
    } catch (error) {
      return {
        data: undefined,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

/**
 * Create a FirebaseAdapter for Firebase/Firestore backends.
 *
 * @param config - Configuration with Firestore instance
 * @returns A configured Adapter instance
 *
 * @example
 * ```typescript
 * import { initializeApp } from 'firebase/app';
 * import { getFirestore } from 'firebase/firestore';
 * import { createFirebaseAdapter } from 'schemock/adapters';
 *
 * const app = initializeApp(firebaseConfig);
 * const db = getFirestore(app);
 *
 * const adapter = createFirebaseAdapter({ db });
 * ```
 */
export function createFirebaseAdapter(config: FirebaseAdapterOptions): Adapter {
  return new FirebaseAdapter(config);
}
