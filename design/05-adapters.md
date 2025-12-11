# Adapters

## Overview

Adapters provide a pluggable abstraction layer between your application and various backend implementations. This allows the same frontend code to work with:

- REST APIs (via fetch or axios)
- Supabase
- Firebase/Firestore
- GraphQL (Apollo, urql)
- Custom backends

## Adapter Interface

```typescript
// src/adapters/types.ts

export interface AdapterContext {
  entity: string;
  operation: 'findOne' | 'findMany' | 'create' | 'update' | 'delete' | 'custom';
  endpoint?: string;
  params?: Record<string, any>;
  data?: any;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface AdapterResponse<T = any> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    headers?: Record<string, string>;
  };
}

export interface Adapter {
  name: string;

  findOne<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;
  findMany<T>(ctx: AdapterContext): Promise<AdapterResponse<T[]>>;
  create<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;
  update<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;
  delete(ctx: AdapterContext): Promise<AdapterResponse<void>>;
  custom<T>(ctx: AdapterContext): Promise<AdapterResponse<T>>;
}

export type AdapterFactory<TConfig = any> = (config: TConfig) => Adapter;

export class AdapterError extends Error {
  constructor(
    public status: number,
    public body: string,
    public context: AdapterContext
  ) {
    super(`Adapter error: ${status}`);
    this.name = 'AdapterError';
  }
}
```

## Built-in Adapters

### Fetch Adapter (Default)

```typescript
// src/adapters/fetch.ts

import { Adapter, AdapterContext, AdapterResponse, AdapterFactory, AdapterError } from './types';

export interface FetchAdapterConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
}

export const createFetchAdapter: AdapterFactory<FetchAdapterConfig> = (config = {}) => {
  const {
    baseUrl = '',
    defaultHeaders = { 'Content-Type': 'application/json' },
    credentials = 'same-origin',
    fetch: customFetch = fetch,
  } = config;

  async function request<T>(
    method: string,
    path: string,
    ctx: AdapterContext
  ): Promise<AdapterResponse<T>> {
    const url = new URL(path, baseUrl);

    if (ctx.params && method === 'GET') {
      for (const [key, value] of Object.entries(ctx.params)) {
        if (value !== undefined && key !== 'id') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await customFetch(url.toString(), {
      method,
      headers: { ...defaultHeaders, ...ctx.headers },
      credentials,
      signal: ctx.signal,
      body: ctx.data ? JSON.stringify(ctx.data) : undefined,
    });

    if (!response.ok) {
      throw new AdapterError(response.status, await response.text(), ctx);
    }

    const data = response.status === 204 ? null : await response.json();

    return {
      data,
      meta: {
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  }

  return {
    name: 'fetch',
    findOne: (ctx) => request('GET', `${ctx.endpoint}/${ctx.params?.id}`, ctx),
    findMany: (ctx) => request('GET', ctx.endpoint!, ctx),
    create: (ctx) => request('POST', ctx.endpoint!, ctx),
    update: (ctx) => request('PUT', `${ctx.endpoint}/${ctx.params?.id}`, ctx),
    delete: (ctx) => request('DELETE', `${ctx.endpoint}/${ctx.params?.id}`, ctx),
    custom: (ctx) => request(ctx.params?.method ?? 'GET', ctx.endpoint!, ctx),
  };
};
```

### Supabase Adapter

```typescript
// src/adapters/supabase.ts

import { SupabaseClient } from '@supabase/supabase-js';
import { Adapter, AdapterContext, AdapterResponse, AdapterFactory } from './types';

export interface SupabaseAdapterConfig {
  client: SupabaseClient;
  tableMap?: Record<string, string>;
  selectMap?: Record<string, string>;
}

export const createSupabaseAdapter: AdapterFactory<SupabaseAdapterConfig> = (config) => {
  const { client, tableMap = {}, selectMap = {} } = config;

  function getTable(entity: string): string {
    return tableMap[entity] ?? entity;
  }

  function getSelect(entity: string, include?: string[]): string {
    if (selectMap[entity]) return selectMap[entity];
    if (!include?.length) return '*';
    return `*, ${include.map(rel => `${rel}(*)`).join(', ')}`;
  }

  return {
    name: 'supabase',

    async findOne(ctx) {
      const table = getTable(ctx.entity);
      const select = getSelect(ctx.entity, ctx.params?.include);

      const { data, error } = await client
        .from(table)
        .select(select)
        .eq('id', ctx.params?.id)
        .single();

      if (error) throw new SupabaseAdapterError(error, ctx);
      return { data };
    },

    async findMany(ctx) {
      const table = getTable(ctx.entity);
      const select = getSelect(ctx.entity, ctx.params?.include);

      let query = client.from(table).select(select, { count: 'exact' });

      // Filters
      if (ctx.params?.where) {
        for (const [key, value] of Object.entries(ctx.params.where)) {
          if (typeof value === 'object' && value !== null) {
            if ('contains' in value) {
              query = query.ilike(key, `%${value.contains}%`);
            } else if ('equals' in value) {
              query = query.eq(key, value.equals);
            }
          } else {
            query = query.eq(key, value);
          }
        }
      }

      // Pagination
      if (ctx.params?.limit) query = query.limit(ctx.params.limit);
      if (ctx.params?.offset) {
        query = query.range(
          ctx.params.offset,
          ctx.params.offset + (ctx.params.limit ?? 20) - 1
        );
      }

      // Ordering
      if (ctx.params?.orderBy) {
        for (const [key, direction] of Object.entries(ctx.params.orderBy)) {
          query = query.order(key, { ascending: direction === 'asc' });
        }
      }

      const { data, error, count } = await query;

      if (error) throw new SupabaseAdapterError(error, ctx);
      return { data: data ?? [], meta: { total: count ?? 0 } };
    },

    async create(ctx) {
      const table = getTable(ctx.entity);

      const { data, error } = await client
        .from(table)
        .insert(ctx.data)
        .select()
        .single();

      if (error) throw new SupabaseAdapterError(error, ctx);
      return { data };
    },

    async update(ctx) {
      const table = getTable(ctx.entity);

      const { data, error } = await client
        .from(table)
        .update(ctx.data)
        .eq('id', ctx.params?.id)
        .select()
        .single();

      if (error) throw new SupabaseAdapterError(error, ctx);
      return { data };
    },

    async delete(ctx) {
      const table = getTable(ctx.entity);

      const { error } = await client
        .from(table)
        .delete()
        .eq('id', ctx.params?.id);

      if (error) throw new SupabaseAdapterError(error, ctx);
      return { data: undefined };
    },

    async custom(ctx) {
      if (ctx.params?.rpc) {
        const { data, error } = await client.rpc(ctx.params.rpc, ctx.params.args);
        if (error) throw new SupabaseAdapterError(error, ctx);
        return { data };
      }
      throw new Error('Custom operation requires rpc param');
    },
  };
};

class SupabaseAdapterError extends Error {
  constructor(public supabaseError: any, public context: AdapterContext) {
    super(supabaseError.message);
    this.name = 'SupabaseAdapterError';
  }
}
```

### Firebase Adapter

```typescript
// src/adapters/firebase.ts

import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  orderBy,
} from 'firebase/firestore';
import { Adapter, AdapterContext, AdapterFactory } from './types';

export interface FirebaseAdapterConfig {
  firestore: Firestore;
  collectionMap?: Record<string, string>;
}

export const createFirebaseAdapter: AdapterFactory<FirebaseAdapterConfig> = (config) => {
  const { firestore, collectionMap = {} } = config;

  function getCollection(entity: string): string {
    return collectionMap[entity] ?? entity;
  }

  return {
    name: 'firebase',

    async findOne(ctx) {
      const collName = getCollection(ctx.entity);
      const docRef = doc(firestore, collName, ctx.params?.id);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        throw new Error(`Document not found: ${ctx.params?.id}`);
      }

      return { data: { id: snapshot.id, ...snapshot.data() } };
    },

    async findMany(ctx) {
      const collName = getCollection(ctx.entity);
      const collRef = collection(firestore, collName);

      let q = query(collRef);

      // Filters
      if (ctx.params?.where) {
        for (const [key, value] of Object.entries(ctx.params.where)) {
          q = query(q, where(key, '==', value));
        }
      }

      // Ordering
      if (ctx.params?.orderBy) {
        for (const [key, direction] of Object.entries(ctx.params.orderBy)) {
          q = query(q, orderBy(key, direction as 'asc' | 'desc'));
        }
      }

      // Limit
      if (ctx.params?.limit) {
        q = query(q, limit(ctx.params.limit));
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return { data, meta: { total: snapshot.size } };
    },

    async create(ctx) {
      const collName = getCollection(ctx.entity);
      const collRef = collection(firestore, collName);
      const docRef = await addDoc(collRef, ctx.data);

      return { data: { id: docRef.id, ...ctx.data } };
    },

    async update(ctx) {
      const collName = getCollection(ctx.entity);
      const docRef = doc(firestore, collName, ctx.params?.id);
      await updateDoc(docRef, ctx.data);

      const updated = await getDoc(docRef);
      return { data: { id: updated.id, ...updated.data() } };
    },

    async delete(ctx) {
      const collName = getCollection(ctx.entity);
      const docRef = doc(firestore, collName, ctx.params?.id);
      await deleteDoc(docRef);

      return { data: undefined };
    },

    async custom(ctx) {
      throw new Error('Custom operations not supported');
    },
  };
};
```

### GraphQL Adapter

```typescript
// src/adapters/graphql.ts

import { ApolloClient, gql, NormalizedCacheObject } from '@apollo/client';
import { Adapter, AdapterContext, AdapterFactory } from './types';

export interface GraphQLAdapterConfig {
  client: ApolloClient<NormalizedCacheObject>;
  operations: {
    [entity: string]: {
      findOne?: string;
      findMany?: string;
      create?: string;
      update?: string;
      delete?: string;
    };
  };
}

export const createGraphQLAdapter: AdapterFactory<GraphQLAdapterConfig> = (config) => {
  const { client, operations } = config;

  return {
    name: 'graphql',

    async findOne(ctx) {
      const queryStr = operations[ctx.entity]?.findOne;
      if (!queryStr) throw new Error(`No findOne query for ${ctx.entity}`);

      const { data } = await client.query({
        query: gql(queryStr),
        variables: { id: ctx.params?.id, ...ctx.params },
      });

      const resultKey = Object.keys(data)[0];
      return { data: data[resultKey] };
    },

    async findMany(ctx) {
      const queryStr = operations[ctx.entity]?.findMany;
      if (!queryStr) throw new Error(`No findMany query for ${ctx.entity}`);

      const { data } = await client.query({
        query: gql(queryStr),
        variables: ctx.params,
      });

      const resultKey = Object.keys(data)[0];
      const result = data[resultKey];

      if (result.edges) {
        return {
          data: result.edges.map((e: any) => e.node),
          meta: { total: result.totalCount }
        };
      }

      return { data: result };
    },

    async create(ctx) {
      const mutationStr = operations[ctx.entity]?.create;
      if (!mutationStr) throw new Error(`No create mutation for ${ctx.entity}`);

      const { data } = await client.mutate({
        mutation: gql(mutationStr),
        variables: { input: ctx.data },
      });

      const resultKey = Object.keys(data)[0];
      return { data: data[resultKey] };
    },

    async update(ctx) {
      const mutationStr = operations[ctx.entity]?.update;
      if (!mutationStr) throw new Error(`No update mutation for ${ctx.entity}`);

      const { data } = await client.mutate({
        mutation: gql(mutationStr),
        variables: { id: ctx.params?.id, input: ctx.data },
      });

      const resultKey = Object.keys(data)[0];
      return { data: data[resultKey] };
    },

    async delete(ctx) {
      const mutationStr = operations[ctx.entity]?.delete;
      if (!mutationStr) throw new Error(`No delete mutation for ${ctx.entity}`);

      await client.mutate({
        mutation: gql(mutationStr),
        variables: { id: ctx.params?.id },
      });

      return { data: undefined };
    },

    async custom(ctx) {
      if (!ctx.params?.query) {
        throw new Error('Custom operation requires query param');
      }

      const { data } = await client.query({
        query: gql(ctx.params.query),
        variables: ctx.params.variables,
      });

      return { data };
    },
  };
};
```

## Creating Custom Adapters

```typescript
// Example: Custom SDK adapter

import { Adapter, AdapterContext, AdapterFactory } from '@schemock/adapters';

interface MySDK {
  users: {
    get(id: string): Promise<User>;
    list(options: any): Promise<{ items: User[]; total: number }>;
    create(data: any): Promise<User>;
    update(id: string, data: any): Promise<User>;
    delete(id: string): Promise<void>;
  };
  // ... other entities
}

export const createMySDKAdapter: AdapterFactory<{ sdk: MySDK }> = ({ sdk }) => {
  return {
    name: 'my-sdk',

    async findOne(ctx) {
      const entityClient = sdk[ctx.entity as keyof MySDK];
      const data = await entityClient.get(ctx.params?.id);
      return { data };
    },

    async findMany(ctx) {
      const entityClient = sdk[ctx.entity as keyof MySDK];
      const { items, total } = await entityClient.list({
        filter: ctx.params?.where,
        limit: ctx.params?.limit,
        offset: ctx.params?.offset,
      });
      return { data: items, meta: { total } };
    },

    async create(ctx) {
      const entityClient = sdk[ctx.entity as keyof MySDK];
      const data = await entityClient.create(ctx.data);
      return { data };
    },

    async update(ctx) {
      const entityClient = sdk[ctx.entity as keyof MySDK];
      const data = await entityClient.update(ctx.params?.id, ctx.data);
      return { data };
    },

    async delete(ctx) {
      const entityClient = sdk[ctx.entity as keyof MySDK];
      await entityClient.delete(ctx.params?.id);
      return { data: undefined };
    },

    async custom(ctx) {
      throw new Error('Custom operations not implemented');
    },
  };
};
```

## Configuration

### Global Adapter

```typescript
import { configureDataLayer } from '@schemock/config';
import { createFetchAdapter } from '@schemock/adapters/fetch';

configureDataLayer({
  adapter: createFetchAdapter({
    baseUrl: 'https://api.example.com',
  }),
});
```

### Per-Entity Adapters

```typescript
import { configureDataLayer } from '@schemock/config';
import { createFetchAdapter } from '@schemock/adapters/fetch';
import { createSupabaseAdapter } from '@schemock/adapters/supabase';

configureDataLayer({
  // Default
  adapter: createFetchAdapter({ baseUrl: 'https://api.example.com' }),

  // Entity-specific overrides
  adapters: {
    user: createSupabaseAdapter({ client: supabase }),
    userProfile: createSupabaseAdapter({ client: supabase }),
    // post uses default fetch adapter
  },
});
```

### Per-Operation Override

```typescript
const { data } = useData(User, {
  id: '123',
  // Override adapter for this call
  adapter: createCustomAdapter({ ... }),
});
```
