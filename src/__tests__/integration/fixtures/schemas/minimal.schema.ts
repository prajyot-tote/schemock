/**
 * Minimal schema fixture for edge case testing
 * Tests: single entity, no timestamps, no relations
 */
import { defineData, field } from '../../../../schema';

/**
 * Simple entity with minimal fields
 */
export const Simple = defineData('simple', {
  id: field.uuid(),
  name: field.string(),
}, {
  timestamps: false,
});

export const schemas = [Simple];
