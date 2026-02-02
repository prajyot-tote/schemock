import { defineData, field, hasMany, belongsTo } from 'schemock/schema';

// ==================== Organization ====================
export const Organization = defineData('organization', {
  id: field.uuid(),
  name: field.company.name(),
  slug: field.string().unique(),
  logo: field.url().nullable(),
  industry: field.enum(['technology', 'healthcare', 'finance', 'retail', 'manufacturing', 'education', 'government', 'other']).default('technology'),
  company_size: field.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']).default('1-10'),
  website: field.url().nullable(),
  billing_email: field.email().nullable(),
  owner_id: field.ref('profile'),
  settings: field.object({}).default({}),

  // Relations
  owner: belongsTo('profile', { foreignKey: 'owner_id' }),
  members: hasMany('teamMember'),
  invitations: hasMany('teamInvitation'),
  permissionMaps: hasMany('userPermissionMap', { foreignKey: 'organization_id' }),
}, {
  timestamps: true,
  module: 'organization',
  tags: ['core', 'billing-entity', 'public-api', 'aggregate-root'],
  group: 'public',
  metadata: {
    owner: 'platform-team',
    priority: 'critical',
    compliance: ['soc2'],
    description: 'Top-level tenant/organization for multi-tenancy',
  },
});

// ==================== Team Member ====================
export const TeamMember = defineData('teamMember', {
  id: field.uuid(),
  organization_id: field.ref('organization'),
  user_id: field.ref('profile'),
  joined_at: field.date(),
  last_active_at: field.date().nullable(),
  invited_by: field.ref('profile').nullable(),

  // Relations
  organization: belongsTo('organization', { foreignKey: 'organization_id' }),
  user: belongsTo('profile', { foreignKey: 'user_id' }),
  inviter: belongsTo('profile', { foreignKey: 'invited_by' }),
}, {
  timestamps: true,
  module: 'organization',
  tags: ['core', 'pii', 'public-api'],
  group: 'public',
  metadata: {
    owner: 'platform-team',
    priority: 'high',
    compliance: ['soc2'],
    description: 'Organization membership',
  },
});

// ==================== Team Invitation ====================
export const TeamInvitation = defineData('teamInvitation', {
  id: field.uuid(),
  organization_id: field.ref('organization'),
  email: field.email(),
  invited_by: field.ref('profile'),
  expires_at: field.date(),
  status: field.enum(['pending', 'accepted', 'expired', 'revoked']).default('pending'),

  // Relations
  organization: belongsTo('organization', { foreignKey: 'organization_id' }),
  inviter: belongsTo('profile', { foreignKey: 'invited_by' }),
}, {
  timestamps: true,
  module: 'organization',
  tags: ['pii', 'transient', 'onboarding'],
  group: 'public',
  metadata: {
    owner: 'platform-team',
    priority: 'medium',
    description: 'Pending team invitations',
  },
});
