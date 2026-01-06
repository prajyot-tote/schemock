import { defineData, field, hasMany } from 'schemock/schema';

export const User = defineData('users', {
  name: field.person.fullName(),
  email: field.email(),
  role: field.enum(['admin', 'user', 'guest']),
  settings: field.object({
    theme: field.enum(['light', 'dark']),
    notifications: field.boolean(),
  }).nullable(),
  posts: hasMany('posts', { foreignKey: 'userId' }),
});
