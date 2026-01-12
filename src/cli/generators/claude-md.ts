/**
 * CLAUDE.md generator for Schemock
 *
 * Generates AI-friendly documentation that helps Claude Code understand
 * how to work with Schemock projects without corrupting user content.
 *
 * @module cli/generators/claude-md
 * @category CLI
 */

import type { SchemockConfig, GenerationTarget } from '../types';

// Markers for the Schemock section - used to identify and update our section
const SECTION_START_MARKER = '<!-- SCHEMOCK:START - AI instructions for Schemock. Do not remove this marker -->';
const SECTION_END_MARKER = '<!-- SCHEMOCK:END -->';

/**
 * Options for CLAUDE.md generation
 */
export interface ClaudeMdOptions {
  /** Project root directory */
  projectRoot?: string;
  /** Whether to also generate .cursorrules */
  includeCursorRules?: boolean;
}

/**
 * Result of CLAUDE.md generation
 */
export interface ClaudeMdResult {
  /** Whether CLAUDE.md was created (vs updated) */
  created: boolean;
  /** Whether the file was modified */
  modified: boolean;
  /** The final content */
  content: string;
  /** Path to the file */
  path: string;
  /** Warning messages if any */
  warnings: string[];
}

/**
 * Generate the Schemock section content based on config
 *
 * @param config - Schemock configuration
 * @returns Markdown content for the Schemock section
 */
export function generateSchemockSection(config: SchemockConfig): string {
  const lines: string[] = [];

  lines.push(SECTION_START_MARKER);
  lines.push('');
  lines.push('## Schemock - AI Instructions');
  lines.push('');
  lines.push('This project uses [Schemock](https://github.com/prajyot-tote/schemock) for schema-first code generation.');
  lines.push('');

  // Generated files section - CRITICAL for AI
  lines.push('### Generated Files - DO NOT MODIFY');
  lines.push('');
  lines.push('The following directories contain auto-generated code. **NEVER edit these files directly.**');
  lines.push('Changes will be overwritten on next `npx schemock generate`.');
  lines.push('');

  // List all output directories
  const outputDirs = getOutputDirectories(config);
  for (const dir of outputDirs) {
    lines.push(`- \`${dir}/**/*\``);
  }
  lines.push('');

  // What to do instead
  lines.push('### How to Make Changes');
  lines.push('');
  lines.push('To modify generated types, hooks, or clients:');
  lines.push('');
  lines.push(`1. **Edit schema files** in \`${config.schemas.replace('/**/*.ts', '/')}\``);
  lines.push('2. **Run generation**: `npx schemock generate`');
  lines.push('3. **Import from generated directory**');
  lines.push('');

  // Schema DSL reference
  lines.push('### Schema DSL Quick Reference');
  lines.push('');
  lines.push('```typescript');
  lines.push("import { defineData, field, hasMany, belongsTo } from 'schemock/schema';");
  lines.push('');
  lines.push("export const userSchema = defineData('user', {");
  lines.push('  id: field.uuid(),');
  lines.push('  email: field.email().unique(),');
  lines.push('  name: field.string(),');
  lines.push("  role: field.enum(['admin', 'user']).default('user'),");
  lines.push('  avatar: field.url().nullable(),');
  lines.push('  createdAt: field.timestamp().default(new Date()),');
  lines.push('});');
  lines.push('');
  lines.push("export const postSchema = defineData('post', {");
  lines.push('  id: field.uuid(),');
  lines.push('  title: field.string(),');
  lines.push('  content: field.text(),');
  lines.push("  authorId: field.ref('user'),");
  lines.push('}, {');
  lines.push('  relations: {');
  lines.push("    author: belongsTo('user', 'authorId'),");
  lines.push('  },');
  lines.push('});');
  lines.push('```');
  lines.push('');

  // Field types reference
  lines.push('### Available Field Types');
  lines.push('');
  lines.push('| Type | Description | Example |');
  lines.push('|------|-------------|---------|');
  lines.push('| `field.uuid()` | UUID primary key | `id: field.uuid()` |');
  lines.push('| `field.string()` | Text string | `name: field.string()` |');
  lines.push('| `field.text()` | Long text | `content: field.text()` |');
  lines.push('| `field.email()` | Email address | `email: field.email()` |');
  lines.push('| `field.url()` | URL string | `avatar: field.url()` |');
  lines.push('| `field.int()` | Integer number | `age: field.int()` |');
  lines.push('| `field.float()` | Decimal number | `price: field.float()` |');
  lines.push('| `field.boolean()` | True/false | `active: field.boolean()` |');
  lines.push("| `field.enum([...])` | Enum values | `status: field.enum(['draft', 'published'])` |");
  lines.push('| `field.timestamp()` | Date/time | `createdAt: field.timestamp()` |');
  lines.push('| `field.date()` | Date only | `birthDate: field.date()` |');
  lines.push("| `field.ref('entity')` | Foreign key | `authorId: field.ref('user')` |");
  lines.push('| `field.json()` | JSON object | `metadata: field.json()` |');
  lines.push('');

  // Modifiers
  lines.push('### Field Modifiers');
  lines.push('');
  lines.push('- `.nullable()` - Field can be null');
  lines.push('- `.default(value)` - Default value');
  lines.push('- `.unique()` - Must be unique');
  lines.push('- `.index()` - Create database index');
  lines.push('');

  // Relations
  lines.push('### Relations');
  lines.push('');
  lines.push('```typescript');
  lines.push("import { hasMany, belongsTo, hasOne, manyToMany } from 'schemock/schema';");
  lines.push('');
  lines.push('// One-to-many: User has many Posts');
  lines.push("hasMany('post', 'authorId')");
  lines.push('');
  lines.push('// Many-to-one: Post belongs to User');
  lines.push("belongsTo('user', 'authorId')");
  lines.push('');
  lines.push('// One-to-one: User has one Profile');
  lines.push("hasOne('profile', 'userId')");
  lines.push('');
  lines.push('// Many-to-many: Post has many Tags');
  lines.push("manyToMany('tag', 'post_tags')");
  lines.push('```');
  lines.push('');

  // Common tasks
  lines.push('### Common Tasks');
  lines.push('');
  lines.push('| Task | What to do |');
  lines.push('|------|------------|');
  lines.push('| Add new entity | Create new schema file in `src/schemas/`, run `npx schemock generate` |');
  lines.push('| Add field | Edit schema file, run `npx schemock generate` |');
  lines.push('| Add relation | Add to schema `relations` object, run `npx schemock generate` |');
  lines.push('| Change field type | Edit schema file, run `npx schemock generate` |');
  lines.push('| Fix generated code bug | Report issue, don\'t edit generated files |');
  lines.push('');

  // CLI commands
  lines.push('### CLI Commands');
  lines.push('');
  lines.push('```bash');
  lines.push('# Generate all code from schemas');
  lines.push('npx schemock generate');
  lines.push('');
  lines.push('# Generate for specific adapter');
  lines.push('npx schemock generate --adapter supabase');
  lines.push('');
  lines.push('# Generate SQL migrations');
  lines.push('npx schemock generate:sql');
  lines.push('');
  lines.push('# Dry run (show what would be generated)');
  lines.push('npx schemock generate --dry-run');
  lines.push('```');
  lines.push('');

  lines.push(SECTION_END_MARKER);

  return lines.join('\n');
}

/**
 * Get all output directories from config (handles multi-target)
 */
function getOutputDirectories(config: SchemockConfig): string[] {
  const dirs = new Set<string>();

  // Legacy single output
  if (config.output) {
    dirs.add(normalizeOutputPath(config.output));
  }

  // Multi-target outputs
  if (config.targets && config.targets.length > 0) {
    for (const target of config.targets) {
      dirs.add(normalizeOutputPath(target.output));
    }
  }

  // Default if nothing configured
  if (dirs.size === 0) {
    dirs.add('./src/generated');
  }

  return Array.from(dirs).sort();
}

/**
 * Normalize output path for display
 */
function normalizeOutputPath(path: string): string {
  // Ensure starts with ./
  if (!path.startsWith('./') && !path.startsWith('/')) {
    return `./${path}`;
  }
  return path;
}

/**
 * Merge Schemock section into existing CLAUDE.md content
 *
 * This function is careful to:
 * 1. Preserve all user content outside the Schemock section
 * 2. Replace existing Schemock section if present
 * 3. Append new section if not present
 * 4. Not corrupt any existing formatting
 *
 * @param existingContent - Current CLAUDE.md content (or empty string)
 * @param schemockSection - The Schemock section to insert
 * @returns Updated content with Schemock section
 */
export function mergeClaudeMdContent(
  existingContent: string,
  schemockSection: string
): { content: string; wasUpdated: boolean } {
  // Check if section already exists
  const startIndex = existingContent.indexOf(SECTION_START_MARKER);
  const endIndex = existingContent.indexOf(SECTION_END_MARKER);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    // Section exists - replace it
    const before = existingContent.substring(0, startIndex);
    const after = existingContent.substring(endIndex + SECTION_END_MARKER.length);

    // Check if content actually changed
    const oldSection = existingContent.substring(startIndex, endIndex + SECTION_END_MARKER.length);
    if (oldSection === schemockSection) {
      return { content: existingContent, wasUpdated: false };
    }

    return {
      content: before + schemockSection + after,
      wasUpdated: true,
    };
  }

  // Section doesn't exist - append it
  const separator = existingContent.trim() ? '\n\n' : '';
  return {
    content: existingContent.trim() + separator + schemockSection + '\n',
    wasUpdated: true,
  };
}

/**
 * Validate that existing content is safe to modify
 *
 * @param content - Existing CLAUDE.md content
 * @returns Validation result with warnings
 */
export function validateExistingContent(content: string): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check for malformed markers
  const startCount = (content.match(/SCHEMOCK:START/g) || []).length;
  const endCount = (content.match(/SCHEMOCK:END/g) || []).length;

  if (startCount !== endCount) {
    warnings.push(
      `Found mismatched Schemock markers (${startCount} START, ${endCount} END). ` +
      'Section will be appended instead of replaced.'
    );
  }

  if (startCount > 1 || endCount > 1) {
    warnings.push(
      'Found multiple Schemock sections. Only the first will be replaced.'
    );
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

/**
 * Generate the complete CLAUDE.md content
 *
 * @param config - Schemock configuration
 * @param existingContent - Existing CLAUDE.md content (if any)
 * @returns Generated/merged content and metadata
 */
export function generateClaudeMd(
  config: SchemockConfig,
  existingContent: string = ''
): ClaudeMdResult {
  const warnings: string[] = [];

  // Validate existing content
  if (existingContent) {
    const validation = validateExistingContent(existingContent);
    warnings.push(...validation.warnings);
  }

  // Generate the Schemock section
  const schemockSection = generateSchemockSection(config);

  // Merge with existing content
  const { content, wasUpdated } = mergeClaudeMdContent(existingContent, schemockSection);

  return {
    created: !existingContent,
    modified: wasUpdated,
    content,
    path: 'CLAUDE.md',
    warnings,
  };
}

/**
 * Generate .cursorrules content (Cursor IDE equivalent)
 *
 * @param config - Schemock configuration
 * @returns Content for .cursorrules file
 */
export function generateCursorRules(config: SchemockConfig): string {
  const outputDirs = getOutputDirectories(config);
  const lines: string[] = [];

  lines.push('# Schemock Rules for Cursor');
  lines.push('');
  lines.push('## Generated Files - DO NOT MODIFY');
  lines.push('');
  lines.push('Never edit files in these directories:');
  for (const dir of outputDirs) {
    lines.push(`- ${dir}/**/*`);
  }
  lines.push('');
  lines.push('To make changes, edit schema files and run: npx schemock generate');
  lines.push('');
  lines.push(`Schema files location: ${config.schemas}`);
  lines.push('');

  return lines.join('\n');
}
