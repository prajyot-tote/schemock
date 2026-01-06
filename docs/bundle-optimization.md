# Bundle Optimization

Schemock achieves **99.3% bundle reduction** through natural tree-shaking - no custom Babel plugins required.

## How It Works

The key insight is using **separate adapter imports** for development and production:

```typescript
// config/data-layer.ts

// Development: includes MockAdapter with faker, @mswjs/data (~150KB)
import { createMockAdapter } from 'schemock/adapters';

// Production: only FetchAdapter (~2KB)
import { createFetchAdapter } from 'schemock/adapters';

export const adapter = process.env.NODE_ENV === 'development'
  ? createMockAdapter(schemas, { seed: { user: 10 } })
  : createFetchAdapter({ baseUrl: '/api' });
```

When bundling for production, the bundler:
1. Evaluates `process.env.NODE_ENV === 'development'` as `false`
2. Tree-shakes away the entire `createMockAdapter` branch
3. Removes `faker`, `@mswjs/data`, and mock generators from the bundle

## Setup Examples

### Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
  build: {
    rollupOptions: {
      // Vite automatically tree-shakes with Rollup
    },
  },
});
```

### Webpack

```javascript
// webpack.config.js
const webpack = require('webpack');

module.exports = {
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    }),
  ],
  optimization: {
    usedExports: true, // Enable tree-shaking
    minimize: true,
  },
};
```

### Rollup

```javascript
// rollup.config.js
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';

export default {
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify('production'),
      preventAssignment: true,
    }),
    terser(), // Minify and remove dead code
  ],
  treeshake: true,
};
```

## Recommended Pattern

Create a single configuration file that switches adapters based on environment:

```typescript
// src/data/config.ts
import type { Adapter } from 'schemock/adapters';
import { userSchema, postSchema } from './schemas';

let adapter: Adapter;

if (process.env.NODE_ENV === 'development') {
  // This entire block is removed in production builds
  const { createMockAdapter } = await import('schemock/adapters');
  adapter = createMockAdapter([userSchema, postSchema], {
    delay: 100, // Simulate network latency
    seed: { user: 5, post: 20 },
  });
} else {
  const { createFetchAdapter } = await import('schemock/adapters');
  adapter = createFetchAdapter({
    baseUrl: process.env.API_URL || '/api',
  });
}

export { adapter };
```

## Bundle Size Comparison

| Configuration | Bundle Size | Notes |
|--------------|-------------|-------|
| With MockAdapter | ~152KB | Includes faker, @mswjs/data |
| Without MockAdapter | ~1KB | FetchAdapter only |
| **Reduction** | **99.3%** | |

## Verification

To verify tree-shaking is working:

1. Build your production bundle:
   ```bash
   npm run build
   ```

2. Analyze the bundle:
   ```bash
   npx source-map-explorer dist/index.js
   ```

3. Search for `faker` or `mswjs` - they should not appear in production bundles.

## Tips

1. **Use dynamic imports** for development-only code
2. **Check your bundler config** - ensure `NODE_ENV` is properly defined
3. **Verify with bundle analysis** - tools like `source-map-explorer` or `webpack-bundle-analyzer`
4. **Keep adapters separate** - don't import `MockAdapter` in shared code
