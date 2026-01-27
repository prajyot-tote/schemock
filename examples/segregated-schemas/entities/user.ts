/**
 * User entity - defined in entities/ directory
 *
 * This file ONLY contains the User entity definition.
 * Relations reference other entities by string name.
 */
import { defineData, field, hasMany } from 'schemock/schema';

export const User = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.person.fullName(),
  role: field.enum(['admin', 'user', 'guest']).default('user'),
  avatar: field.image.avatar().nullable(),
  createdAt: field.date(),
}, {
  relations: {
    // References 'post' by string - Post entity is in a DIFFERENT file
    posts: hasMany('post', { foreignKey: 'authorId' }),
    // References 'comment' by string - Comment entity is in a DIFFERENT file
    comments: hasMany('comment', { foreignKey: 'userId' }),
  },
  tags: ['auth', 'core'],
});
