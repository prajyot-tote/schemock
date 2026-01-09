import { defineData, field, belongsTo } from 'schemock/schema';

export const Post = defineData('posts', {
  title: field.lorem.sentence(),
  content: field.lorem.paragraphs(3),
  published: field.boolean().default(false),
  metadata: field.object({
    views: field.number({ min: 0, max: 10000 }),
    tags: field.string(),
  }),
  userId: field.uuid(),
  author: belongsTo('users', { foreignKey: 'userId' }),
}, {
  // Entity organization
  tags: ['content', 'core', 'public'],
  module: 'content',
  group: 'public',
  metadata: {
    owner: 'content-team',
  },
});
