import { defineConfig } from './src/cli/types';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock' as const,
  apiPrefix: '/api',

  // New v1.0 Configuration Format
  // ==============================

  // Frontend configuration
  frontend: {
    framework: 'react',     // react | vue | svelte | none
    adapter: 'supabase',    // mock | supabase | firebase | fetch | pglite
    output: './src/generated/supabase',
  },

  // Backend configuration
  backend: {
    framework: 'nextjs',    // node | nextjs | supabase-edge | neon
    output: './src/generated/api',
    database: {
      type: 'supabase',
      connectionEnvVar: 'SUPABASE_URL',
    },
  },

  // Unified middleware - applies to both frontend and backend
  middleware: {
    auth: {
      provider: 'supabase-auth',
      required: true,
    },
    validation: true,
    logger: {
      level: 'info',
    },
    context: true,
    rls: true,
  },

  // Adapter-specific configuration
  adapters: {
    supabase: {
      tableMap: {
        users: 'users',
        posts: 'posts',
      },
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
  },

  // Legacy targets format (deprecated - shown for reference)
  // Use frontend/backend/middleware instead
  // targets: [
  //   {
  //     name: 'supabase-client',
  //     type: 'supabase' as const,
  //     output: './src/generated/supabase',
  //   },
  //   {
  //     name: 'nextjs-api',
  //     type: 'nextjs-api' as const,
  //     output: './src/generated/api',
  //     backend: 'supabase' as const,
  //     middleware: {
  //       auth: { provider: 'supabase-auth' as const },
  //       validation: true,
  //     },
  //   },
  // ],
});
