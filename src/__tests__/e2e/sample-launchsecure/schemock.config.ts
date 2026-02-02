// schemock.config.ts - Sample LaunchSecure config
import { defineConfig } from 'schemock/cli';

export default defineConfig({
  schemas: './src/schemas/**/*.ts',
  output: './src/generated',
  adapter: 'mock',
  apiPrefix: '/api',

  middleware: {
    auth: true,
    context: true,
    validation: true,
    custom: ['./src/schemas/auth.ts'],
  },

  adapters: {
    mock: {
      delay: 100,
    },
    supabase: {
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
      migrations: true,
      migrationsDir: './supabase/migrations',
      tableMap: {
        securityScan: 'security_scans',
        auditLog: 'audit_logs',
        teamMember: 'team_members',
        teamInvitation: 'team_invitations',
        userPermissionMap: 'user_permission_maps',
        permissionTemplate: 'permission_templates',
      },
    },
  },
});
