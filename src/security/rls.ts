/**
 * Row-Level Security - Filter rows based on user permissions
 *
 * @module security/rls
 * @category Security
 */

import type { RLSPolicy, User, Action } from './types';

/**
 * Apply row-level security policies to filter rows.
 *
 * Filters an array of rows based on the applicable RLS policies
 * for the given user and action.
 *
 * @param rows - Array of rows to filter
 * @param policies - RLS policies to apply
 * @param user - Current user (null for anonymous)
 * @param action - The action being performed
 * @returns Filtered rows that pass all applicable policies
 *
 * @example
 * ```typescript
 * const policies: RLSPolicy<Post>[] = [
 *   {
 *     name: 'own-posts',
 *     entity: 'post',
 *     action: 'all',
 *     filter: (post, user) => post.authorId === user?.id,
 *   },
 *   {
 *     name: 'published-posts',
 *     entity: 'post',
 *     action: 'read',
 *     filter: (post) => post.status === 'published',
 *   },
 * ];
 *
 * const posts = await adapter.findMany({ entity: 'post' });
 * const visiblePosts = applyRLS(posts, policies, currentUser, 'read');
 * ```
 */
export function applyRLS<T>(
  rows: T[],
  policies: RLSPolicy<T>[],
  user: User | null,
  action: Action = 'read'
): T[] {
  // Get applicable policies for this action
  const applicablePolicies = policies.filter((policy) => {
    if (policy.action === 'all') return true;
    if (Array.isArray(policy.action)) {
      return policy.action.includes(action);
    }
    return policy.action === action;
  });

  // If no policies, return all rows (no restrictions)
  if (applicablePolicies.length === 0) {
    return rows;
  }

  // Filter rows - row passes if ANY policy allows it (OR logic)
  return rows.filter((row) =>
    applicablePolicies.some((policy) => policy.filter(row, user))
  );
}

/**
 * Create an RLS policy for owner-only access.
 *
 * @param entity - Entity name
 * @param ownerField - Field that contains the owner ID
 * @returns RLS policy
 *
 * @example
 * ```typescript
 * const postOwnerPolicy = createOwnerPolicy('post', 'authorId');
 * ```
 */
export function createOwnerPolicy<T extends Record<string, unknown>>(
  entity: string,
  ownerField: keyof T
): RLSPolicy<T> {
  return {
    name: `${entity}-owner`,
    entity,
    action: 'all',
    filter: (row, user) => {
      if (!user) return false;
      return row[ownerField] === user.id;
    },
  };
}

/**
 * Create an RLS policy for role-based access.
 *
 * @param entity - Entity name
 * @param allowedRoles - Roles that have access
 * @param action - Actions this policy applies to
 * @returns RLS policy
 *
 * @example
 * ```typescript
 * const adminOnlyPolicy = createRolePolicy('user', ['admin'], 'delete');
 * ```
 */
export function createRolePolicy<T>(
  entity: string,
  allowedRoles: string[],
  action: Action | Action[] = 'all'
): RLSPolicy<T> {
  return {
    name: `${entity}-role-${allowedRoles.join('-')}`,
    entity,
    action,
    filter: (_row, user) => {
      if (!user || !user.roles) return false;
      return user.roles.some((role) => allowedRoles.includes(role));
    },
  };
}

/**
 * Create an RLS policy for public read access.
 *
 * @param entity - Entity name
 * @param publicField - Field that indicates if the row is public
 * @returns RLS policy
 *
 * @example
 * ```typescript
 * const publicPostPolicy = createPublicPolicy('post', 'isPublic');
 * ```
 */
export function createPublicPolicy<T extends Record<string, unknown>>(
  entity: string,
  publicField: keyof T
): RLSPolicy<T> {
  return {
    name: `${entity}-public`,
    entity,
    action: 'read',
    filter: (row) => Boolean(row[publicField]),
  };
}

/**
 * Create an RLS policy for status-based access.
 *
 * @param entity - Entity name
 * @param statusField - Field that contains the status
 * @param allowedStatuses - Statuses that are accessible
 * @returns RLS policy
 *
 * @example
 * ```typescript
 * const publishedPolicy = createStatusPolicy('post', 'status', ['published']);
 * ```
 */
export function createStatusPolicy<T extends Record<string, unknown>>(
  entity: string,
  statusField: keyof T,
  allowedStatuses: unknown[]
): RLSPolicy<T> {
  return {
    name: `${entity}-status-${allowedStatuses.join('-')}`,
    entity,
    action: 'read',
    filter: (row) => allowedStatuses.includes(row[statusField]),
  };
}

/**
 * Create a middleware that applies RLS to adapter responses.
 *
 * @param policies - RLS policies to apply
 * @param getUser - Function to get current user from context
 * @returns Middleware
 */
export function createRLSMiddleware<T>(
  policies: RLSPolicy<T>[],
  getUser: () => User | null
) {
  return {
    name: 'rls',
    after: async <R>(ctx: { entity: string; operation: string }, response: { data: R }) => {
      const user = getUser();
      const action = ctx.operation as Action;

      // Apply RLS to array responses
      if (Array.isArray(response.data)) {
        const entityPolicies = policies.filter((p) => p.entity === ctx.entity);
        response.data = applyRLS(response.data, entityPolicies as RLSPolicy<T>[], user, action) as R;
      }

      return response;
    },
  };
}
