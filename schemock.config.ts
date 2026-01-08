export default {
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock' as const,
  apiPrefix: '/api',

  // Multi-target configuration
  // You can filter entities per-target using:
  //   entities: ['user', 'post']     - Only generate these
  //   excludeEntities: ['audit']     - Generate all except these
  targets: [
    {
      name: 'supabase-client',
      type: 'supabase' as const,
      output: './src/generated/supabase',
    },
    {
      name: 'nextjs-api',
      type: 'nextjs-api' as const,
      output: './src/generated/api',
      backend: 'supabase' as const,
      middleware: {
        auth: { provider: 'supabase-auth' as const },
        validation: true,
      },
    },
    {
      name: 'node-server',
      type: 'node-handlers' as const,
      output: './src/generated/node',
      backend: 'supabase' as const,
      middleware: {
        auth: { provider: 'jwt' as const, secretEnvVar: 'JWT_SECRET' },
        validation: true,
      },
    },
  ],

  adapters: {
    supabase: {
      tableMap: {
        users: 'users',
        posts: 'posts',
      },
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
  },
};
