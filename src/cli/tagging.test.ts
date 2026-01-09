/**
 * Tests for entity tagging and filtering functionality
 *
 * @module cli/tagging.test
 */

import { describe, it, expect } from 'vitest';
import { defineData, field, belongsTo, hasMany } from '../schema';
import { analyzeSchemas } from './analyze';
import { filterSchemasForTarget } from './generators/target-registry';
import type { AnalyzedSchema, GenerationTarget } from './types';

// ============================================================================
// Schema Definition Tests
// ============================================================================

describe('Schema Definition with Tags', () => {
  it('should include tags in EntitySchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      tags: ['auth', 'core', 'public'],
    });

    expect(User.tags).toEqual(['auth', 'core', 'public']);
  });

  it('should include module in EntitySchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      module: 'identity',
    });

    expect(User.module).toBe('identity');
  });

  it('should include group in EntitySchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      group: 'public',
    });

    expect(User.group).toBe('public');
  });

  it('should include metadata in EntitySchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      metadata: {
        owner: 'auth-team',
        priority: 'high',
        deprecated: false,
      },
    });

    expect(User.metadata).toEqual({
      owner: 'auth-team',
      priority: 'high',
      deprecated: false,
    });
  });

  it('should support all tagging options together', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      tags: ['auth', 'core'],
      module: 'identity',
      group: 'public',
      metadata: { owner: 'auth-team' },
    });

    expect(User.tags).toEqual(['auth', 'core']);
    expect(User.module).toBe('identity');
    expect(User.group).toBe('public');
    expect(User.metadata).toEqual({ owner: 'auth-team' });
  });

  it('should have undefined tags when not specified', () => {
    const User = defineData('user', {
      name: field.string(),
    });

    expect(User.tags).toBeUndefined();
    expect(User.module).toBeUndefined();
    expect(User.group).toBeUndefined();
    expect(User.metadata).toBeUndefined();
  });
});

// ============================================================================
// Analysis Layer Tests
// ============================================================================

describe('Schema Analysis with Tags', () => {
  it('should copy tags to AnalyzedSchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      tags: ['auth', 'core'],
    });

    const analyzed = analyzeSchemas([User], {});
    const userSchema = analyzed.find(s => s.name === 'user');

    expect(userSchema?.tags).toEqual(['auth', 'core']);
  });

  it('should copy module to AnalyzedSchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      module: 'identity',
    });

    const analyzed = analyzeSchemas([User], {});
    const userSchema = analyzed.find(s => s.name === 'user');

    expect(userSchema?.module).toBe('identity');
  });

  it('should copy group to AnalyzedSchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      group: 'public',
    });

    const analyzed = analyzeSchemas([User], {});
    const userSchema = analyzed.find(s => s.name === 'user');

    expect(userSchema?.group).toBe('public');
  });

  it('should copy metadata to AnalyzedSchema', () => {
    const User = defineData('user', {
      name: field.string(),
    }, {
      metadata: { owner: 'test-team' },
    });

    const analyzed = analyzeSchemas([User], {});
    const userSchema = analyzed.find(s => s.name === 'user');

    expect(userSchema?.metadata).toEqual({ owner: 'test-team' });
  });

  it('should default tags to empty array when not specified', () => {
    const User = defineData('user', {
      name: field.string(),
    });

    const analyzed = analyzeSchemas([User], {});
    const userSchema = analyzed.find(s => s.name === 'user');

    expect(userSchema?.tags).toEqual([]);
  });

  it('should preserve tagging through topological sort', () => {
    const User = defineData('user', {
      name: field.string(),
      posts: hasMany('post'),
    }, {
      tags: ['auth'],
      module: 'identity',
    });

    const Post = defineData('post', {
      title: field.string(),
      userId: field.ref('user'),
      author: belongsTo('user'),
    }, {
      tags: ['content'],
      module: 'content',
    });

    const analyzed = analyzeSchemas([Post, User], {}); // Reverse order to test sort

    const userSchema = analyzed.find(s => s.name === 'user');
    const postSchema = analyzed.find(s => s.name === 'post');

    expect(userSchema?.tags).toEqual(['auth']);
    expect(userSchema?.module).toBe('identity');
    expect(postSchema?.tags).toEqual(['content']);
    expect(postSchema?.module).toBe('content');
  });
});

// ============================================================================
// Filter Logic Tests
// ============================================================================

describe('filterSchemasForTarget', () => {
  // Create mock analyzed schemas for testing
  const createMockSchemas = (): AnalyzedSchema[] => [
    {
      name: 'user',
      singularName: 'user',
      pluralName: 'users',
      pascalName: 'User',
      pascalSingularName: 'User',
      pascalPluralName: 'Users',
      tableName: 'users',
      endpoint: '/api/users',
      fields: [],
      relations: [],
      computed: [],
      dependsOn: [],
      hasTimestamps: true,
      isJunctionTable: false,
      rls: { enabled: false, hasSelect: false, hasInsert: false, hasUpdate: false, hasDelete: false, scope: [], bypass: [] },
      indexes: [],
      rpc: [],
      tags: ['auth', 'core', 'public'],
      module: 'identity',
      group: 'public',
      original: {} as any,
    },
    {
      name: 'post',
      singularName: 'post',
      pluralName: 'posts',
      pascalName: 'Post',
      pascalSingularName: 'Post',
      pascalPluralName: 'Posts',
      tableName: 'posts',
      endpoint: '/api/posts',
      fields: [],
      relations: [],
      computed: [],
      dependsOn: [],
      hasTimestamps: true,
      isJunctionTable: false,
      rls: { enabled: false, hasSelect: false, hasInsert: false, hasUpdate: false, hasDelete: false, scope: [], bypass: [] },
      indexes: [],
      rpc: [],
      tags: ['content', 'core', 'public'],
      module: 'content',
      group: 'public',
      original: {} as any,
    },
    {
      name: 'auditLog',
      singularName: 'auditLog',
      pluralName: 'auditLogs',
      pascalName: 'AuditLog',
      pascalSingularName: 'AuditLog',
      pascalPluralName: 'AuditLogs',
      tableName: 'audit_logs',
      endpoint: '/api/auditLogs',
      fields: [],
      relations: [],
      computed: [],
      dependsOn: [],
      hasTimestamps: true,
      isJunctionTable: false,
      rls: { enabled: false, hasSelect: false, hasInsert: false, hasUpdate: false, hasDelete: false, scope: [], bypass: [] },
      indexes: [],
      rpc: [],
      tags: ['internal', 'security'],
      module: 'security',
      group: 'internal',
      original: {} as any,
    },
    {
      name: 'setting',
      singularName: 'setting',
      pluralName: 'settings',
      pascalName: 'Setting',
      pascalSingularName: 'Setting',
      pascalPluralName: 'Settings',
      tableName: 'settings',
      endpoint: '/api/settings',
      fields: [],
      relations: [],
      computed: [],
      dependsOn: [],
      hasTimestamps: true,
      isJunctionTable: false,
      rls: { enabled: false, hasSelect: false, hasInsert: false, hasUpdate: false, hasDelete: false, scope: [], bypass: [] },
      indexes: [],
      rpc: [],
      tags: [], // No tags
      module: undefined,
      group: undefined,
      original: {} as any,
    },
  ];

  const createTarget = (overrides: Partial<GenerationTarget>): GenerationTarget => ({
    name: 'test-target',
    type: 'mock',
    output: './test-output',
    ...overrides,
  });

  describe('Tag Filtering', () => {
    it('should filter by single tag', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: ['auth'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user']);
    });

    it('should filter by multiple tags (OR logic)', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: ['auth', 'content'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user', 'post']);
    });

    it('should return entities matching any tag (OR logic)', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: ['core'] });

      const filtered = filterSchemasForTarget(schemas, target);

      // Both user and post have 'core' tag
      expect(filtered.map(s => s.name)).toEqual(['user', 'post']);
    });

    it('should exclude entities without any matching tags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: ['auth'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).not.toContain('post');
      expect(filtered.map(s => s.name)).not.toContain('auditLog');
      expect(filtered.map(s => s.name)).not.toContain('setting');
    });

    it('should exclude entities with no tags when filtering by tags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: ['core'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).not.toContain('setting');
    });

    it('should be case-insensitive for tags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: ['AUTH', 'Core'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user', 'post']);
    });
  });

  describe('Exclude Tag Filtering', () => {
    it('should exclude entities with specified tags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ excludeTags: ['internal'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user', 'post', 'setting']);
      expect(filtered.map(s => s.name)).not.toContain('auditLog');
    });

    it('should exclude entities with any matching exclude tag', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ excludeTags: ['auth', 'internal'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['post', 'setting']);
    });

    it('should keep entities with no tags when using excludeTags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ excludeTags: ['internal'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toContain('setting');
    });

    it('should be case-insensitive for excludeTags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ excludeTags: ['INTERNAL'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).not.toContain('auditLog');
    });
  });

  describe('Module Filtering', () => {
    it('should filter by module', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ module: 'identity' });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user']);
    });

    it('should be case-insensitive for module', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ module: 'IDENTITY' });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user']);
    });

    it('should exclude entities without a module', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ module: 'identity' });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).not.toContain('setting');
    });
  });

  describe('Group Filtering', () => {
    it('should filter by group', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ group: 'internal' });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['auditLog']);
    });

    it('should return multiple entities in same group', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ group: 'public' });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user', 'post']);
    });

    it('should be case-insensitive for group', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ group: 'PUBLIC' });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.map(s => s.name)).toEqual(['user', 'post']);
    });
  });

  describe('Combined Filtering', () => {
    it('should combine tags and excludeTags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({
        tags: ['core'],
        excludeTags: ['auth'],
      });

      const filtered = filterSchemasForTarget(schemas, target);

      // 'core' includes user and post, but 'auth' excludes user
      expect(filtered.map(s => s.name)).toEqual(['post']);
    });

    it('should combine module and tags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({
        tags: ['core'],
        module: 'identity',
      });

      const filtered = filterSchemasForTarget(schemas, target);

      // Must have 'core' tag AND be in 'identity' module
      expect(filtered.map(s => s.name)).toEqual(['user']);
    });

    it('should combine group and excludeTags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({
        group: 'public',
        excludeTags: ['auth'],
      });

      const filtered = filterSchemasForTarget(schemas, target);

      // Must be in 'public' group AND not have 'auth' tag
      expect(filtered.map(s => s.name)).toEqual(['post']);
    });

    it('should combine entities filter with tags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({
        entities: ['user', 'auditLog'],
        tags: ['core'],
      });

      const filtered = filterSchemasForTarget(schemas, target);

      // Must be in entities list AND have 'core' tag
      // auditLog doesn't have 'core' tag
      expect(filtered.map(s => s.name)).toEqual(['user']);
    });

    it('should combine excludeEntities with tags', () => {
      const schemas = createMockSchemas();
      const target = createTarget({
        excludeEntities: ['user'],
        tags: ['public'],
      });

      const filtered = filterSchemasForTarget(schemas, target);

      // Must have 'public' tag AND not be 'user'
      expect(filtered.map(s => s.name)).toEqual(['post']);
    });

    it('should apply all filters in correct order', () => {
      const schemas = createMockSchemas();
      const target = createTarget({
        entities: ['user', 'post', 'auditLog'],
        excludeEntities: ['auditLog'],
        tags: ['core'],
        excludeTags: ['content'],
        module: 'identity',
      });

      const filtered = filterSchemasForTarget(schemas, target);

      // Start: user, post, auditLog
      // After entities: user, post, auditLog (all included)
      // After excludeEntities: user, post
      // After tags ['core']: user, post
      // After excludeTags ['content']: user
      // After module 'identity': user
      expect(filtered.map(s => s.name)).toEqual(['user']);
    });
  });

  describe('Edge Cases', () => {
    it('should return all schemas when no filters specified', () => {
      const schemas = createMockSchemas();
      const target = createTarget({});

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.length).toBe(4);
    });

    it('should return empty array when no schemas match', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: ['nonexistent'] });

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered).toEqual([]);
    });

    it('should handle empty tags array in target', () => {
      const schemas = createMockSchemas();
      const target = createTarget({ tags: [] });

      const filtered = filterSchemasForTarget(schemas, target);

      // Empty tags array should not filter (return all)
      expect(filtered.length).toBe(4);
    });

    it('should handle undefined filters gracefully', () => {
      const schemas = createMockSchemas();
      const target: GenerationTarget = {
        name: 'test',
        type: 'mock',
        output: './',
        tags: undefined,
        excludeTags: undefined,
        module: undefined,
        group: undefined,
      };

      const filtered = filterSchemasForTarget(schemas, target);

      expect(filtered.length).toBe(4);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('End-to-End Tagging Flow', () => {
  it('should flow tags from schema definition through analysis to filtering', () => {
    // Define schemas with tags
    const User = defineData('user', {
      name: field.string(),
      posts: hasMany('post'),
    }, {
      tags: ['auth', 'public'],
      module: 'identity',
      group: 'public',
    });

    const Post = defineData('post', {
      title: field.string(),
      userId: field.ref('user'),
      author: belongsTo('user'),
    }, {
      tags: ['content', 'public'],
      module: 'content',
      group: 'public',
    });

    const AuditLog = defineData('auditLog', {
      action: field.string(),
    }, {
      tags: ['internal'],
      module: 'security',
      group: 'internal',
    });

    // Analyze schemas
    const analyzed = analyzeSchemas([User, Post, AuditLog], {});

    // Verify analysis preserved tags
    const userSchema = analyzed.find(s => s.name === 'user');
    const postSchema = analyzed.find(s => s.name === 'post');
    const auditSchema = analyzed.find(s => s.name === 'auditLog');

    expect(userSchema?.tags).toEqual(['auth', 'public']);
    expect(postSchema?.tags).toEqual(['content', 'public']);
    expect(auditSchema?.tags).toEqual(['internal']);

    // Test filtering
    const publicTarget: GenerationTarget = {
      name: 'public-api',
      type: 'mock',
      output: './public',
      group: 'public',
    };

    const publicSchemas = filterSchemasForTarget(analyzed, publicTarget);
    expect(publicSchemas.map(s => s.name)).toEqual(['user', 'post']);

    // Test tag-based filtering
    const authTarget: GenerationTarget = {
      name: 'auth-service',
      type: 'mock',
      output: './auth',
      tags: ['auth'],
    };

    const authSchemas = filterSchemasForTarget(analyzed, authTarget);
    expect(authSchemas.map(s => s.name)).toEqual(['user']);

    // Test exclude filtering
    const externalTarget: GenerationTarget = {
      name: 'external-api',
      type: 'mock',
      output: './external',
      excludeTags: ['internal'],
    };

    const externalSchemas = filterSchemasForTarget(analyzed, externalTarget);
    expect(externalSchemas.map(s => s.name)).toEqual(['user', 'post']);
  });
});
