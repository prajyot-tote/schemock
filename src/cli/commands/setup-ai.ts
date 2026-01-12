/**
 * Setup AI configuration command for Schemock CLI
 *
 * Generates CLAUDE.md and optionally .cursorrules to help AI tools
 * understand how to work with Schemock projects.
 *
 * @module cli/commands/setup-ai
 * @category CLI
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadConfig } from '../config';
import {
  generateClaudeMd,
  generateCursorRules,
  type ClaudeMdResult,
} from '../generators/claude-md';

/**
 * Options for setup:ai command
 */
export interface SetupAIOptions {
  /** Config file path */
  config?: string;
  /** Also generate .cursorrules */
  cursor?: boolean;
  /** Dry run - show what would be generated */
  dryRun?: boolean;
  /** Force overwrite without checking for existing content */
  force?: boolean;
  /** Output directory (defaults to current directory) */
  output?: string;
}

/**
 * Result of setup:ai command
 */
export interface SetupAIResult {
  claudeMd: ClaudeMdResult;
  cursorRules?: {
    created: boolean;
    modified: boolean;
    path: string;
  };
}

/**
 * Main setup:ai command
 *
 * @param options - Command options
 * @returns Result of the operation
 */
export async function setupAI(options: SetupAIOptions = {}): Promise<SetupAIResult> {
  console.log('\n🤖 Schemock AI Setup\n');

  // 1. Load config
  const config = await loadConfig(options.config);
  const outputDir = options.output || process.cwd();

  // 2. Process CLAUDE.md
  const claudeMdPath = resolve(outputDir, 'CLAUDE.md');
  let existingContent = '';

  if (existsSync(claudeMdPath)) {
    console.log('📄 Found existing CLAUDE.md');
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  } else {
    console.log('📄 No existing CLAUDE.md found - will create new file');
  }

  // Generate content
  const claudeMdResult = generateClaudeMd(config, existingContent);
  claudeMdResult.path = claudeMdPath;

  // Show warnings if any
  if (claudeMdResult.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warning of claudeMdResult.warnings) {
      console.log(`   ${warning}`);
    }
    console.log('');
  }

  // Write CLAUDE.md
  if (options.dryRun) {
    console.log('\n[DRY RUN] Would write CLAUDE.md:');
    console.log('─'.repeat(60));
    // Show just the Schemock section for brevity
    const sectionMatch = claudeMdResult.content.match(/<!-- SCHEMOCK:START[\s\S]*?SCHEMOCK:END -->/);
    if (sectionMatch) {
      console.log(sectionMatch[0]);
    }
    console.log('─'.repeat(60));
  } else if (claudeMdResult.modified || claudeMdResult.created) {
    writeFileSync(claudeMdPath, claudeMdResult.content, 'utf-8');
    if (claudeMdResult.created) {
      console.log(`   ✓ Created ${claudeMdPath}`);
    } else {
      console.log(`   ✓ Updated ${claudeMdPath} (Schemock section)`);
    }
  } else {
    console.log('   ℹ CLAUDE.md is already up to date');
  }

  // 3. Process .cursorrules if requested
  let cursorResult: SetupAIResult['cursorRules'] | undefined;

  if (options.cursor) {
    const cursorPath = resolve(outputDir, '.cursorrules');
    const cursorExists = existsSync(cursorPath);

    console.log('\n📄 Generating .cursorrules for Cursor IDE...');

    const cursorContent = generateCursorRules(config);

    if (options.dryRun) {
      console.log('\n[DRY RUN] Would write .cursorrules:');
      console.log('─'.repeat(60));
      console.log(cursorContent);
      console.log('─'.repeat(60));
      cursorResult = { created: !cursorExists, modified: true, path: cursorPath };
    } else {
      // For .cursorrules, we overwrite entirely (it's simpler and typically not user-edited)
      let shouldWrite = true;

      if (cursorExists && !options.force) {
        const existingCursor = readFileSync(cursorPath, 'utf-8');
        // Check if it's a Schemock-generated file
        if (!existingCursor.includes('Schemock Rules for Cursor')) {
          console.log('   ⚠️  Existing .cursorrules was not created by Schemock');
          console.log('   Use --force to overwrite, or manually add Schemock rules');
          shouldWrite = false;
        } else if (existingCursor === cursorContent) {
          console.log('   ℹ .cursorrules is already up to date');
          shouldWrite = false;
        }
      }

      if (shouldWrite) {
        writeFileSync(cursorPath, cursorContent, 'utf-8');
        console.log(`   ✓ ${cursorExists ? 'Updated' : 'Created'} ${cursorPath}`);
      }

      cursorResult = { created: !cursorExists, modified: shouldWrite, path: cursorPath };
    }
  }

  // 4. Summary
  console.log('\n✅ AI setup complete!\n');

  console.log('What this does:');
  console.log('  • CLAUDE.md tells Claude Code about your generated files');
  console.log('  • Helps AI avoid modifying auto-generated code');
  console.log('  • Provides schema DSL reference for AI assistance');
  if (options.cursor) {
    console.log('  • .cursorrules provides similar guidance for Cursor IDE');
  }

  console.log('\nNext steps:');
  console.log('  1. Commit CLAUDE.md to your repository');
  console.log('  2. Claude Code will now understand your Schemock project');
  console.log('');

  return {
    claudeMd: claudeMdResult,
    cursorRules: cursorResult,
  };
}
