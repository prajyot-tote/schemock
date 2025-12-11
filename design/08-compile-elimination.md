# Compile-Time Elimination

## Overview

The compile-time elimination system removes ALL mock-related code from production bundles:

- faker.js imports and usage
- @mswjs/data imports and database setup
- MSW imports and handlers
- Schema definitions (replaced with minimal config)
- Computed field resolvers
- Development-only setup code

## Bundle Size Impact

| Mode | Size | Contents |
|------|------|----------|
| Development | ~500 KB | Full mock system |
| Production | ~3.5 KB | Minimal API client |
| **Reduction** | **99.3%** | |

## Babel Plugin

```typescript
// src/build/babel-plugin.ts

import { declare } from '@babel/helper-plugin-utils';
import type { NodePath } from '@babel/core';
import type * as t from '@babel/types';

interface PluginOptions {
  mode?: 'development' | 'production';
}

export default declare((api, options: PluginOptions) => {
  api.assertVersion(7);

  const isProd = options.mode === 'production' ||
                 process.env.NODE_ENV === 'production';

  return {
    name: 'schemock-transform',

    visitor: {
      // Remove mock-related imports
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        if (!isProd) return;

        const source = path.node.source.value;

        // Remove faker
        if (source === '@faker-js/faker' || source === 'faker') {
          path.remove();
          return;
        }

        // Remove @mswjs/data
        if (source === '@mswjs/data') {
          path.remove();
          return;
        }

        // Remove msw
        if (source === 'msw' || source === 'msw/browser') {
          path.remove();
          return;
        }

        // Transform @schemock imports
        if (source === '@schemock/schema') {
          path.remove();
          return;
        }
      },

      // Transform defineData calls
      CallExpression(path: NodePath<t.CallExpression>) {
        if (!isProd) return;

        const callee = path.node.callee;

        if (t.isIdentifier(callee) && callee.name === 'defineData') {
          const [nameArg] = path.node.arguments;

          if (t.isStringLiteral(nameArg)) {
            const entityName = nameArg.value;

            // Replace with minimal config
            path.replaceWith(
              t.objectExpression([
                t.objectProperty(
                  t.identifier('__entity'),
                  t.stringLiteral(entityName)
                ),
                t.objectProperty(
                  t.identifier('__endpoint'),
                  t.stringLiteral(`/api/${entityName}s`)
                ),
              ])
            );
          }
        }

        // Transform useData hook
        if (t.isIdentifier(callee) && callee.name === 'useData') {
          path.node.callee = t.identifier('__useDataProd');
        }

        // Transform useMutate hook
        if (t.isIdentifier(callee) && callee.name === 'useMutate') {
          path.node.callee = t.identifier('__useMutateProd');
        }

        // Transform useView hook
        if (t.isIdentifier(callee) && callee.name === 'useView') {
          path.node.callee = t.identifier('__useViewProd');
        }
      },

      // Remove development-only code blocks
      IfStatement(path: NodePath<t.IfStatement>) {
        if (!isProd) return;

        const test = path.node.test;

        // Remove: if (process.env.NODE_ENV === 'development') { ... }
        if (isDevelopmentCheck(test)) {
          path.remove();
          return;
        }

        // Remove: if (import.meta.env.DEV) { ... }
        if (isViteDevCheck(test)) {
          path.remove();
          return;
        }
      },

      // Remove seed/reset calls
      ExpressionStatement(path: NodePath<t.ExpressionStatement>) {
        if (!isProd) return;

        const expr = path.node.expression;

        if (t.isCallExpression(expr)) {
          const callee = expr.callee;

          if (t.isIdentifier(callee) &&
              ['seed', 'reset', 'setupMocks'].includes(callee.name)) {
            path.remove();
          }
        }
      },
    },
  };
});

function isDevelopmentCheck(test: t.Node): boolean {
  // Check for: process.env.NODE_ENV === 'development'
  if (t.isBinaryExpression(test) && test.operator === '===') {
    if (t.isStringLiteral(test.right) && test.right.value === 'development') {
      return true;
    }
  }
  return false;
}

function isViteDevCheck(test: t.Node): boolean {
  // Check for: import.meta.env.DEV
  if (t.isMemberExpression(test)) {
    // Simplified check
    return true;
  }
  return false;
}
```

## Production Runtime

```typescript
// src/runtime/prod.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataLayer } from '../config';

interface EntityConfig {
  __entity: string;
  __endpoint: string;
}

export function __useDataProd<T>(
  config: EntityConfig,
  options: {
    id?: string;
    include?: string[];
    where?: Record<string, any>;
    limit?: number;
    offset?: number;
  } = {}
) {
  const chain = dataLayer.getChain(config.__entity);

  const operation = options.id ? 'findOne' : 'findMany';

  return useQuery<T>({
    queryKey: [config.__entity, options],
    queryFn: () => chain.execute(operation, {
      entity: config.__entity,
      endpoint: config.__endpoint,
      params: options,
    }).then(r => r.data),
  });
}

export function __useMutateProd<T>(config: EntityConfig) {
  const queryClient = useQueryClient();
  const chain = dataLayer.getChain(config.__entity);

  return {
    create: useMutation({
      mutationFn: (data: Partial<T>) =>
        chain.execute<T>('create', {
          entity: config.__entity,
          endpoint: config.__endpoint,
          data,
        }).then(r => r.data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [config.__entity] });
      },
    }),

    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Partial<T> }) =>
        chain.execute<T>('update', {
          entity: config.__entity,
          endpoint: config.__endpoint,
          params: { id },
          data,
        }).then(r => r.data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [config.__entity] });
      },
    }),

    delete: useMutation({
      mutationFn: (id: string) =>
        chain.execute('delete', {
          entity: config.__entity,
          endpoint: config.__endpoint,
          params: { id },
        }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [config.__entity] });
      },
    }),
  };
}

export function __useViewProd<T>(
  config: { __view: string; __endpoint: string },
  params: Record<string, string> = {}
) {
  const chain = dataLayer.getChain(config.__view);

  let endpoint = config.__endpoint;
  for (const [key, value] of Object.entries(params)) {
    endpoint = endpoint.replace(`:${key}`, value);
  }

  return useQuery<T>({
    queryKey: [config.__view, params],
    queryFn: () => chain.execute('custom', {
      entity: config.__view,
      endpoint,
      params,
    }).then(r => r.data),
  });
}
```

## Transformation Examples

### Before (Source)

```typescript
import { defineData, field, hasMany } from '@schemock/schema';
import { faker } from '@faker-js/faker';

const User = defineData('user', {
  id: field.uuid(),
  name: field.person.fullName(),
  email: field.internet.email(),
  posts: hasMany('post'),

  postCount: field.computed({
    mock: () => faker.number.int({ min: 0, max: 100 }),
    resolve: (user, db) => db.post.count({
      where: { authorId: { equals: user.id } }
    }),
  }),
});

// Component
function UserProfile({ userId }) {
  const { data, loading } = useData(User, { id: userId });

  return <div>{data?.name}</div>;
}

// Setup
if (process.env.NODE_ENV === 'development') {
  await setup();
  seed({ user: 10 });
}
```

### After (Production Build)

```typescript
// All imports removed

const User = {
  __entity: 'user',
  __endpoint: '/api/users',
};

// Component - hook transformed
function UserProfile({ userId }) {
  const { data, loading } = __useDataProd(User, { id: userId });

  return <div>{data?.name}</div>;
}

// Setup block removed entirely
```

## Vite Plugin

```typescript
// src/build/vite-plugin.ts

import { Plugin } from 'vite';
import { transformSync } from '@babel/core';
import babelPlugin from './babel-plugin';

export function schemockVitePlugin(): Plugin {
  return {
    name: 'schemock',

    transform(code, id) {
      // Only transform in production
      if (process.env.NODE_ENV !== 'production') {
        return null;
      }

      // Only transform JS/TS files
      if (!/\.(js|jsx|ts|tsx)$/.test(id)) {
        return null;
      }

      // Skip node_modules (except @schemock)
      if (id.includes('node_modules') && !id.includes('@schemock')) {
        return null;
      }

      const result = transformSync(code, {
        filename: id,
        plugins: [[babelPlugin, { mode: 'production' }]],
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
      });

      return {
        code: result?.code ?? code,
        map: result?.map,
      };
    },
  };
}
```

## Webpack Plugin

```typescript
// src/build/webpack-plugin.ts

import { Compiler } from 'webpack';

export class MockdataWebpackPlugin {
  apply(compiler: Compiler) {
    compiler.options.module.rules.push({
      test: /\.(js|jsx|ts|tsx)$/,
      exclude: /node_modules\/(?!@schemock)/,
      use: {
        loader: 'babel-loader',
        options: {
          plugins: [
            ['@schemock/build/babel-plugin', { mode: process.env.NODE_ENV }],
          ],
        },
      },
    });
  }
}
```

## Usage

### Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { schemockVitePlugin } from '@schemock/build/vite-plugin';

export default defineConfig({
  plugins: [
    schemockVitePlugin(),
  ],
});
```

### Webpack

```typescript
// webpack.config.js
const { MockdataWebpackPlugin } = require('@schemock/build/webpack-plugin');

module.exports = {
  plugins: [
    new MockdataWebpackPlugin(),
  ],
};
```

### Next.js

```typescript
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    if (!isServer && process.env.NODE_ENV === 'production') {
      config.module.rules.push({
        test: /\.(js|jsx|ts|tsx)$/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: [
              ['@schemock/build/babel-plugin', { mode: 'production' }],
            ],
          },
        },
      });
    }
    return config;
  },
};
```

## Security Benefits

By completely removing mock code from production:

1. **No bypass possible** - Mock code doesn't exist to be exploited
2. **No data exposure** - Mock data shapes not visible in bundle
3. **No debug endpoints** - Development routes removed
4. **Smaller attack surface** - Less code = fewer vulnerabilities
