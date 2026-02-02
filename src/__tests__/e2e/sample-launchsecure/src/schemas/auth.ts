import { defineData, field, hasMany, belongsTo, defineEndpoint, defineMiddleware } from 'schemock/schema';

// ==================== Auth Middleware ====================
export const AuthMiddleware = defineMiddleware('auth', {
  handler: async ({ ctx, next }) => {
    const authHeader = ctx.headers?.authorization || ctx.headers?.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return {
        response: {
          status: 401,
          body: { error: 'Unauthorized: no Authorization header' },
        },
      };
    }

    try {
      const parts = token.split('.');
      if (parts.length < 2) throw new Error('Invalid token format');

      const payload = JSON.parse(
        typeof atob === 'function'
          ? atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
          : Buffer.from(parts[1], 'base64url').toString()
      );

      const userId = payload.userId || payload.sub;
      if (!userId) {
        return {
          response: {
            status: 401,
            body: { error: 'Unauthorized: no userId in token' },
          },
        };
      }

      ctx.context.userId = userId;
      ctx.context.user = payload;

      return next();
    } catch {
      return {
        response: {
          status: 401,
          body: { error: 'Unauthorized: invalid token' },
        },
      };
    }
  },
  description: 'Extracts userId from JWT Authorization header',
  order: 'early',
});

// ==================== Permission ====================
export const Permission = defineData('permission', {
  id: field.uuid(),
  key: field.string(),
  name: field.string(),
  description: field.lorem.sentence(),
  organization_id: field.ref('organization').nullable(),

  // Relations
  organization: belongsTo('organization', { foreignKey: 'organization_id' }),
}, {
  timestamps: true,
  module: 'auth',
  tags: ['core', 'rbac', 'admin'],
  group: 'public',
  indexes: [
    { fields: ['key', 'organization_id'], unique: true },
  ],
  metadata: {
    owner: 'security-team',
    priority: 'critical',
    compliance: ['soc2', 'gdpr'],
    description: 'Permission definitions for role-based access control',
  },
});

// ==================== User Permission Map ====================
export const UserPermissionMap = defineData('userPermissionMap', {
  id: field.uuid(),
  user_id: field.ref('profile'),
  organization_id: field.ref('organization').nullable(),
  project_id: field.ref('project').nullable(),
  permissions: field.array(field.string()),
  granted_by: field.ref('profile'),
  granted_at: field.date(),
  expires_at: field.date().nullable(),
  reason: field.lorem.sentence().nullable(),

  // Relations
  user: belongsTo('profile', { foreignKey: 'user_id' }),
  organization: belongsTo('organization', { foreignKey: 'organization_id' }),
  project: belongsTo('project', { foreignKey: 'project_id' }),
  grantedByUser: belongsTo('profile', { foreignKey: 'granted_by' }),
}, {
  timestamps: true,
  module: 'auth',
  tags: ['rbac', 'audit-trail', 'pii'],
  group: 'public',
  metadata: {
    owner: 'security-team',
    priority: 'high',
    compliance: ['soc2', 'gdpr'],
    description: 'Maps users to their granted permissions per scope',
  },
});

// ==================== Permission Template ====================
export const PermissionTemplate = defineData('permissionTemplate', {
  id: field.uuid(),
  name: field.string(),
  description: field.lorem.sentence(),
  organization_id: field.ref('organization').nullable(),
  is_system: field.boolean().default(false),
  permissions: field.array(field.string()),

  // Relations
  organization: belongsTo('organization', { foreignKey: 'organization_id' }),
}, {
  timestamps: true,
  module: 'auth',
  tags: ['core', 'rbac'],
  group: 'public',
  metadata: {
    owner: 'platform-team',
    priority: 'medium',
    description: 'Pre-defined permission sets for quick role assignment',
  },
});

// ==================== Auth User ====================
export const AuthUser = defineData('authUser', {
  id: field.uuid(),
  email: field.email().unique(),
  encrypted_password: field.string(),
  email_confirmed_at: field.date().nullable(),
  full_name: field.person.fullName().nullable(),
  avatar_url: field.url().nullable(),

  // Relations
  sessions: hasMany('authSession', { foreignKey: 'user_id' }),
}, {
  timestamps: true,
  module: 'identity',
  tags: ['auth', 'pii', 'credentials', 'sensitive'],
  group: 'internal',
  metadata: {
    owner: 'security-team',
    priority: 'critical',
    compliance: ['soc2', 'gdpr'],
    description: 'Mock auth users (mirrors Supabase auth.users)',
  },
});

// ==================== Auth Session ====================
export const AuthSession = defineData('authSession', {
  id: field.uuid(),
  user_id: field.ref('authUser'),
  access_token: field.uuid(),
  refresh_token: field.uuid(),
  expires_at: field.date(),

  // Relations
  user: belongsTo('authUser', { foreignKey: 'user_id' }),
}, {
  timestamps: true,
  module: 'identity',
  tags: ['auth', 'credentials', 'sensitive', 'transient'],
  group: 'internal',
  metadata: {
    owner: 'security-team',
    priority: 'critical',
    compliance: ['soc2'],
    description: 'Active user sessions with access/refresh tokens',
  },
});

// ==================== Helper Functions ====================
function isSuperAdmin(db: any, userId: string): boolean {
  const maps = db.userPermissionMap.findMany({
    where: { user_id: { equals: userId } },
  });
  let isSuper = false;
  maps.forEach((map: any) => {
    if (map.permissions.includes('*')) isSuper = true;
    if (map.permissions.includes('admin:access:all')) isSuper = true;
  });
  return isSuper;
}

function getUserOrgIds(db: any, userId: string): string[] {
  const memberships = db.teamMember.findMany({
    where: { user_id: { equals: userId } },
  });
  return memberships.map((m: any) => m.organization_id);
}

// ==================== Invite User Endpoint ====================
export const InviteUserToOrg = defineEndpoint('/api/auth/invite-user', {
  method: 'POST',
  params: {
    email: field.email(),
    full_name: field.string().nullable(),
    organization_id: field.uuid(),
    permissions: field.array(field.string()),
    reason: field.string().nullable(),
  },
  response: {
    profile_id: field.uuid(),
    team_member_id: field.uuid(),
    permission_map_id: field.uuid(),
    success: field.boolean(),
    is_new_user: field.boolean(),
  },
  middleware: [AuthMiddleware],
  mockResolver: async ({ params, db, context }) => {
    const granterId = context?.userId as string;
    if (!granterId) {
      throw new Error('Unauthorized: no userId in context');
    }

    let profile = db.profile.findFirst({
      where: { email: { equals: params.email } },
    });

    const isNewUser = !profile;

    if (!profile) {
      profile = db.profile.create({
        email: params.email,
        full_name: params.full_name || params.email.split('@')[0],
        avatar_url: null,
      });
    }

    let teamMember = db.teamMember.findFirst({
      where: {
        user_id: { equals: profile.id },
        organization_id: { equals: params.organization_id },
      },
    });

    if (!teamMember) {
      teamMember = db.teamMember.create({
        organization_id: params.organization_id,
        user_id: profile.id,
        joined_at: new Date(),
        invited_by: granterId,
      });
    }

    const permissionMap = db.userPermissionMap.create({
      user_id: profile.id,
      organization_id: params.organization_id,
      project_id: null,
      permissions: params.permissions,
      granted_by: granterId,
      granted_at: new Date(),
      reason: params.reason || null,
    });

    return {
      profile_id: profile.id,
      team_member_id: teamMember.id,
      permission_map_id: permissionMap.id,
      success: true,
      is_new_user: isNewUser,
    };
  },
  description: 'Invites a user to an organization with specified permissions',
});

// ==================== Get User Permissions Endpoint ====================
export const GetUserPermissions = defineEndpoint('/api/auth/user-permissions', {
  method: 'GET',
  response: {
    token: field.string(),
  },
  middleware: [AuthMiddleware],
  mockResolver: async ({ db, context }) => {
    const userId = context?.userId as string;
    if (!userId) {
      throw new Error('Unauthorized: no userId in context');
    }

    const maps = db.userPermissionMap.findMany({
      where: { user_id: { equals: userId } },
    });

    const keys = new Set<string>();
    for (const map of maps) {
      for (const key of map.permissions) {
        keys.add(key);
      }
    }

    const permissions = [...keys];

    const encode = (obj: object): string => {
      const json = JSON.stringify(obj);
      if (typeof btoa === 'function') {
        return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
      return Buffer.from(json).toString('base64url');
    };

    const now = Math.floor(Date.now() / 1000);
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: userId,
      permissions,
      iat: now,
      exp: now + 24 * 60 * 60,
    })}.`;

    return { token };
  },
  description: 'Returns a permission JWT for the authenticated user',
});

// ==================== List Users Endpoint ====================
export const AuthHubListUsers = defineEndpoint('/api/authhub/users', {
  method: 'GET',
  params: {
    search: field.string().nullable(),
    limit: field.number().default(50),
    offset: field.number().default(0),
  },
  response: {
    users: field.array(field.object({
      id: field.uuid(),
      email: field.email(),
      full_name: field.string().nullable(),
      avatar_url: field.url().nullable(),
    })),
    total: field.number(),
  },
  middleware: [AuthMiddleware],
  mockResolver: async ({ params, db, context }) => {
    const callerId = context?.userId as string;
    if (!callerId) {
      throw new Error('Unauthorized: no userId in context');
    }

    const superAdmin = isSuperAdmin(db, callerId);

    let profiles: any[];

    if (superAdmin) {
      profiles = db.profile.getAll();
    } else {
      const callerOrgIds = getUserOrgIds(db, callerId);
      if (callerOrgIds.length === 0) {
        return { users: [], total: 0 };
      }

      const memberships = db.teamMember.findMany({
        where: { organization_id: { in: callerOrgIds } },
      });
      const userIds = [...new Set(memberships.map((m: any) => m.user_id))];

      profiles = db.profile.findMany({
        where: { id: { in: userIds } },
      });
    }

    if (params.search) {
      const searchLower = params.search.toLowerCase();
      profiles = profiles.filter((p: any) =>
        p.email?.toLowerCase().includes(searchLower) ||
        p.full_name?.toLowerCase().includes(searchLower)
      );
    }

    const total = profiles.length;
    const paginatedProfiles = profiles.slice(params.offset, params.offset + params.limit);

    return {
      users: paginatedProfiles.map((p: any) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
      })),
      total,
    };
  },
  description: 'List users for AuthHub wizard (filtered by access)',
});
