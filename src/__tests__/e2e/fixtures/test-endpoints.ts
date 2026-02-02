/**
 * Test Endpoints for E2E Runtime Tests
 *
 * Defines custom endpoints for testing endpoint execution.
 */

import type { AnalyzedEndpoint } from '../../../cli/types';

/**
 * Search endpoint - GET with query params
 */
export const searchEndpoint: AnalyzedEndpoint = {
  name: 'search',
  method: 'GET',
  path: '/api/search',
  pascalName: 'Search',
  pathParams: [],
  params: [
    {
      name: 'q',
      type: 'string',
      tsType: 'string',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: false,
    },
    {
      name: 'limit',
      type: 'number',
      tsType: 'number',
      required: false,
      hasDefault: true,
      default: 20,
      isArray: false,
      isObject: false,
    },
    {
      name: 'type',
      type: 'string',
      tsType: "'user' | 'post'",
      required: false,
      hasDefault: true,
      default: 'post',
      isArray: false,
      isObject: false,
    },
  ],
  body: [],
  response: [
    {
      name: 'results',
      type: 'array',
      tsType: 'Array<{ id: string; title: string; type: string }>',
      required: true,
      hasDefault: false,
      isArray: true,
      isObject: false,
    },
    {
      name: 'total',
      type: 'number',
      tsType: 'number',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: false,
    },
    {
      name: 'query',
      type: 'string',
      tsType: 'string',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: false,
    },
  ],
  mockResolverSource: `async ({ params, db }) => {
    const q = params.q?.toLowerCase() ?? '';
    const limit = params.limit ?? 20;
    const type = params.type ?? 'post';

    let results: { id: string; title: string; type: string }[] = [];

    if (type === 'post' || type === 'all') {
      const posts = db.post.findMany({
        where: { title: { contains: q } }
      });
      results = results.concat(posts.map(p => ({ id: p.id, title: p.title, type: 'post' })));
    }

    if (type === 'user' || type === 'all') {
      const users = db.user.findMany({
        where: { name: { contains: q } }
      });
      results = results.concat(users.map(u => ({ id: u.id, title: u.name, type: 'user' })));
    }

    return {
      results: results.slice(0, limit),
      total: results.length,
      query: q,
    };
  }`,
  description: 'Search across entities',
};

/**
 * Stats endpoint - GET with path param
 */
export const userStatsEndpoint: AnalyzedEndpoint = {
  name: 'userStats',
  method: 'GET',
  path: '/api/users/:userId/stats',
  pascalName: 'UserStats',
  pathParams: ['userId'],
  params: [
    {
      name: 'userId',
      type: 'string',
      tsType: 'string',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: false,
    },
  ],
  body: [],
  response: [
    {
      name: 'postCount',
      type: 'number',
      tsType: 'number',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: false,
    },
    {
      name: 'commentCount',
      type: 'number',
      tsType: 'number',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: false,
    },
  ],
  mockResolverSource: `async ({ params, db }) => {
    const userId = params.userId;

    const posts = db.post.findMany({
      where: { authorId: { equals: userId } }
    });

    const comments = db.comment.findMany({
      where: { userId: { equals: userId } }
    });

    return {
      postCount: posts.length,
      commentCount: comments.length,
    };
  }`,
  description: 'Get user statistics',
};

/**
 * Bulk update endpoint - POST with body
 */
export const bulkUpdateEndpoint: AnalyzedEndpoint = {
  name: 'bulkUpdate',
  method: 'POST',
  path: '/api/posts/bulk-update',
  pascalName: 'BulkUpdate',
  pathParams: [],
  params: [],
  body: [
    {
      name: 'ids',
      type: 'array',
      tsType: 'string[]',
      required: true,
      hasDefault: false,
      isArray: true,
      isObject: false,
    },
    {
      name: 'data',
      type: 'object',
      tsType: '{ published?: boolean; status?: string }',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: true,
    },
  ],
  response: [
    {
      name: 'updated',
      type: 'number',
      tsType: 'number',
      required: true,
      hasDefault: false,
      isArray: false,
      isObject: false,
    },
    {
      name: 'ids',
      type: 'array',
      tsType: 'string[]',
      required: true,
      hasDefault: false,
      isArray: true,
      isObject: false,
    },
  ],
  mockResolverSource: `async ({ body, db }) => {
    const { ids, data } = body;
    const updatedIds: string[] = [];

    for (const id of ids) {
      const post = db.post.update({
        where: { id: { equals: id } },
        data,
      });
      if (post) {
        updatedIds.push(id);
      }
    }

    return {
      updated: updatedIds.length,
      ids: updatedIds,
    };
  }`,
  description: 'Bulk update posts',
};

/**
 * Get all test endpoints
 */
export function getTestEndpoints(): AnalyzedEndpoint[] {
  return [searchEndpoint, userStatsEndpoint, bulkUpdateEndpoint];
}
