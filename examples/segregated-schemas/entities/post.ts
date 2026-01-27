/**
 * Post entity - defined in entities/ directory
 *
 * This file ONLY contains the Post entity definition.
 * belongsTo references User which is in a DIFFERENT file.
 */
import { defineData, field, belongsTo, hasMany } from 'schemock/schema';

export const Post = defineData('post', {
  id: field.uuid(),
  title: field.lorem.sentence(),
  content: field.lorem.paragraphs(3),
  authorId: field.ref('user'),  // FK reference by string
  published: field.boolean().default(false),
  views: field.number({ min: 0 }).default(0),
  createdAt: field.date(),
  updatedAt: field.date(),
}, {
  relations: {
    // References 'user' - defined in entities/user.ts
    author: belongsTo('user', { foreignKey: 'authorId' }),
    // References 'comment' - defined in entities/comment.ts
    comments: hasMany('comment', { foreignKey: 'postId' }),
  },
  tags: ['content', 'public'],
  rls: {
    scope: [{ row: 'authorId', context: 'userId' }],
    select: (row, ctx) => row.published || row.authorId === ctx.userId,
    update: (row, ctx) => row.authorId === ctx.userId,
    delete: (row, ctx) => row.authorId === ctx.userId,
  },
});
