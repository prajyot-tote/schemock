/**
 * Production seed data for segregated schemas example
 *
 * This seeds a super admin user and a few default posts
 * using the production seed kill switch — data is only
 * inserted once, and re-running is a no-op.
 *
 * Uses ref() to reference previously created records by index,
 * so IDs don't need to be hardcoded.
 *
 * Usage:
 *   import { runProductionSeed } from './generated/seed';
 *   import { seedConfig } from './seed-data';
 *
 *   const result = await runProductionSeed(seedConfig.secret, seedConfig);
 */
import { ref } from 'schemock/seed';

export const seedConfig = {
  secret: 'example-secret-change-me',
  data: {
    users: [
      {
        email: 'admin@example.com',
        name: 'Super Admin',
        role: 'admin',
        avatar: null,
      },
      {
        email: 'editor@example.com',
        name: 'Default Editor',
        role: 'user',
        avatar: null,
      },
    ],
    posts: [
      {
        title: 'Welcome to Schemock',
        content: 'This is a default post seeded by the production seed utility.',
        authorId: ref('users', 0),
        published: true,
        views: 0,
      },
    ],
  },
};
