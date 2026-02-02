import { defineData, field, hasMany, belongsTo } from 'schemock/schema';

// ==================== Profile ====================
export const Profile = defineData('profile', {
  id: field.uuid(),
  email: field.email().unique(),
  full_name: field.person.fullName().nullable(),
  avatar_url: field.url().nullable(),

  // Relations
  projects: hasMany('project', { foreignKey: 'owner_id' }),
  permissionMaps: hasMany('userPermissionMap', { foreignKey: 'user_id' }),
  teamMemberships: hasMany('teamMember', { foreignKey: 'user_id' }),
}, {
  timestamps: true,
  module: 'identity',
  tags: ['core', 'pii', 'public-api'],
  group: 'public',
  metadata: {
    owner: 'platform-team',
    priority: 'critical',
    compliance: ['soc2', 'gdpr'],
    description: 'User profiles linked to Supabase auth',
  },
});

// ==================== Project ====================
export const Project = defineData('project', {
  id: field.uuid(),
  name: field.company.name(),
  description: field.lorem.paragraph().nullable(),
  repo_url: field.url().nullable(),
  status: field.enum(['active', 'archived', 'draft']).default('draft'),
  owner_id: field.ref('profile'),
  settings: field.object({}).nullable(),

  // Relations
  owner: belongsTo('profile', { foreignKey: 'owner_id' }),
  environments: hasMany('environment'),
  deployments: hasMany('deployment'),
  securityScans: hasMany('securityScan'),
}, {
  timestamps: true,
  module: 'project',
  tags: ['core', 'public-api', 'aggregate-root'],
  group: 'public',
  metadata: {
    owner: 'platform-team',
    priority: 'critical',
    description: 'Primary organizational unit for deployments and security',
  },
});

// ==================== Environment ====================
export const Environment = defineData('environment', {
  id: field.uuid(),
  project_id: field.ref('project'),
  name: field.enum(['development', 'staging', 'uat', 'production']),
  url: field.url().nullable(),
  branch: field.string().default('main'),
  variables: field.object({}).default({}),
  is_protected: field.boolean().default(false),

  project: belongsTo('project', { foreignKey: 'project_id' }),
}, {
  timestamps: true,
  module: 'project',
  tags: ['core', 'deployment', 'config'],
  group: 'public',
  metadata: {
    owner: 'platform-team',
    priority: 'high',
    description: 'Deployment target environments',
  },
});

// ==================== Deployment ====================
export const Deployment = defineData('deployment', {
  id: field.uuid(),
  project_id: field.ref('project'),
  environment_id: field.ref('environment'),
  commit_sha: field.string(),
  commit_message: field.lorem.sentence().nullable(),
  status: field.enum(['pending', 'building', 'deploying', 'success', 'failed', 'rolled_back']).default('pending'),
  deployed_by: field.ref('profile'),
  logs: field.lorem.paragraphs(3).nullable(),
  started_at: field.date(),
  completed_at: field.date().nullable(),

  project: belongsTo('project', { foreignKey: 'project_id' }),
  environment: belongsTo('environment', { foreignKey: 'environment_id' }),
  deployedByUser: belongsTo('profile', { foreignKey: 'deployed_by' }),
}, {
  timestamps: true,
  module: 'deployment',
  tags: ['core', 'audit-trail', 'high-volume', 'public-api'],
  group: 'public',
  metadata: {
    owner: 'deployment-team',
    priority: 'critical',
    compliance: ['soc2'],
    description: 'Deployment history and audit trail',
  },
});

// ==================== Security Scan ====================
export const SecurityScan = defineData('securityScan', {
  id: field.uuid(),
  project_id: field.ref('project'),
  scan_type: field.enum(['vulnerability', 'compliance', 'secrets', 'dependencies']),
  status: field.enum(['pending', 'running', 'completed', 'failed']).default('pending'),
  findings: field.object({
    critical: field.number({ min: 0, max: 10 }),
    high: field.number({ min: 0, max: 20 }),
    medium: field.number({ min: 0, max: 30 }),
    low: field.number({ min: 0, max: 50 }),
  }).default({ critical: 0, high: 0, medium: 0, low: 0 }),
  summary: field.object({}).default({}),
  started_at: field.date(),
  completed_at: field.date().nullable(),

  project: belongsTo('project', { foreignKey: 'project_id' }),
}, {
  timestamps: true,
  module: 'security',
  tags: ['core', 'security', 'audit-trail', 'public-api'],
  group: 'public',
  metadata: {
    owner: 'security-team',
    priority: 'critical',
    compliance: ['soc2', 'pci-dss'],
    description: 'Security scan results and vulnerability findings',
  },
});
