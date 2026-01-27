/**
 * Comment entity - defined in entities/ directory
 *
 * References both User and Post, which are in SEPARATE files.
 * Demonstrates multi-file cross-references.
 */
import { defineData, field, belongsTo } from 'schemock/schema';

export const Comment = defineData('comment', {
  id: field.uuid(),
  content: field.lorem.paragraph(),
  userId: field.ref('user'),    // FK to User (different file)
  postId: field.ref('post'),    // FK to Post (different file)
  createdAt: field.date(),
}, {
  relations: {
    // Both targets are in different files
    author: belongsTo('user', { foreignKey: 'userId' }),
    post: belongsTo('post', { foreignKey: 'postId' }),
  },
  tags: ['content', 'public'],
});
