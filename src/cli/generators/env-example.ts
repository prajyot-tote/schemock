/**
 * Environment Variable Discovery & .env.example Generation
 *
 * Collects required environment variables from target configurations
 * and generates .env.example files + CLI summaries.
 *
 * @module cli/generators/env-example
 * @category CLI
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  GenerationTarget,
  SchemockConfig,
  AuthMiddlewareConfig,
  CacheMiddlewareConfig,
  MiddlewareConfig,
} from '../types';

/**
 * Describes a required environment variable
 */
export interface RequiredEnvVar {
  /** Variable name (e.g., "SUPABASE_URL") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Example value for .env.example */
  example: string;
  /** Whether this variable is required (vs optional) */
  required: boolean;
  /** Source that requires this variable (e.g., "backend-api (node-handlers/supabase)") */
  source: string;
}

// ============================================================================
// Env Var Catalogs
// ============================================================================

function supabaseServerVars(envPrefix: string, source: string): RequiredEnvVar[] {
  return [
    {
      name: `${envPrefix}_URL`,
      description: 'Supabase project URL',
      example: 'https://your-project.supabase.co',
      required: true,
      source,
    },
    {
      name: `${envPrefix}_SERVICE_ROLE_KEY`,
      description: 'Supabase service role key (server-side only)',
      example: 'your-service-role-key',
      required: true,
      source,
    },
  ];
}

function supabaseClientVars(envPrefix: string, source: string): RequiredEnvVar[] {
  return [
    {
      name: `${envPrefix}_URL`,
      description: 'Supabase project URL',
      example: 'https://your-project.supabase.co',
      required: true,
      source,
    },
    {
      name: `${envPrefix}_ANON_KEY`,
      description: 'Supabase anonymous (public) key',
      example: 'your-anon-key',
      required: true,
      source,
    },
  ];
}

function firebaseVars(source: string): RequiredEnvVar[] {
  return [
    {
      name: 'FIREBASE_PROJECT_ID',
      description: 'Firebase project ID',
      example: 'your-firebase-project-id',
      required: true,
      source,
    },
    {
      name: 'FIREBASE_CLIENT_EMAIL',
      description: 'Firebase service account email',
      example: 'firebase-adminsdk@your-project.iam.gserviceaccount.com',
      required: true,
      source,
    },
    {
      name: 'FIREBASE_PRIVATE_KEY',
      description: 'Firebase service account private key',
      example: '"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"',
      required: true,
      source,
    },
  ];
}

function neonVars(envVar: string, source: string): RequiredEnvVar[] {
  return [
    {
      name: envVar,
      description: 'Neon database connection string',
      example: 'postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/dbname?sslmode=require',
      required: true,
      source,
    },
  ];
}

// ============================================================================
// Middleware Env Vars
// ============================================================================

function collectMiddlewareEnvVars(
  middleware: MiddlewareConfig | undefined,
  source: string
): RequiredEnvVar[] {
  if (!middleware) return [];

  const vars: RequiredEnvVar[] = [];

  // Auth middleware
  if (middleware.auth && typeof middleware.auth === 'object') {
    const auth = middleware.auth as AuthMiddlewareConfig;
    if (auth.provider === 'jwt') {
      const secretEnvVar = auth.secretEnvVar || 'JWT_SECRET';
      vars.push({
        name: secretEnvVar,
        description: 'JWT secret key for token verification',
        example: 'your-jwt-secret-key',
        required: true,
        source: `auth middleware (${source})`,
      });
    }
  }

  // Cache middleware with Redis
  if (middleware.cache && typeof middleware.cache === 'object') {
    const cache = middleware.cache as CacheMiddlewareConfig;
    if (cache.storage === 'redis') {
      const redisEnvVar = cache.redisEnvVar || 'REDIS_URL';
      vars.push({
        name: redisEnvVar,
        description: 'Redis connection URL for caching',
        example: 'redis://localhost:6379',
        required: true,
        source: `cache middleware (${source})`,
      });
    }
  }

  return vars;
}

// ============================================================================
// Target Env Var Collection
// ============================================================================

/**
 * Collect required env vars for a single generation target
 */
export function collectEnvVarsForTarget(
  target: GenerationTarget,
  config: SchemockConfig
): RequiredEnvVar[] {
  const vars: RequiredEnvVar[] = [];
  const source = target.name;

  switch (target.type) {
    case 'node-handlers': {
      const backend = target.backend || 'supabase';
      if (backend === 'supabase') {
        const envPrefix = (target.options?.envPrefix as string) || 'SUPABASE';
        vars.push(...supabaseServerVars(envPrefix, source));
      } else if (backend === 'firebase') {
        vars.push(...firebaseVars(source));
      }
      // pglite and fetch don't need env vars
      break;
    }

    case 'nextjs-api': {
      const backend = target.backend || 'supabase';
      if (backend === 'supabase') {
        const envPrefix = (target.options?.envPrefix as string) || 'NEXT_PUBLIC_SUPABASE';
        vars.push(...supabaseClientVars(envPrefix, source));
      } else if (backend === 'firebase') {
        vars.push(...firebaseVars(source));
      }
      break;
    }

    case 'supabase-edge': {
      const envPrefix = (target.options?.envPrefix as string) || 'SUPABASE';
      vars.push(...supabaseServerVars(envPrefix, source));
      break;
    }

    case 'neon': {
      const envVar = (target.options?.connectionEnvVar as string) || 'DATABASE_URL';
      vars.push(...neonVars(envVar, source));
      break;
    }

    // Client-side targets: supabase adapter needs env vars
    case 'supabase': {
      const supabaseConfig = config.adapters?.supabase || {};
      const envPrefix = supabaseConfig.envPrefix ?? 'NEXT_PUBLIC_SUPABASE';
      vars.push(...supabaseClientVars(envPrefix, source));
      break;
    }

    case 'firebase': {
      vars.push(...firebaseVars(source));
      break;
    }

    // mock, pglite, fetch, graphql don't need env vars
    default:
      break;
  }

  // Collect middleware env vars from target-level middleware
  if (target.middleware?.auth) {
    const auth = target.middleware.auth;
    if (auth.provider === 'jwt') {
      const secretEnvVar = auth.secretEnvVar || 'JWT_SECRET';
      vars.push({
        name: secretEnvVar,
        description: 'JWT secret key for token verification',
        example: 'your-jwt-secret-key',
        required: true,
        source: `auth middleware (${source})`,
      });
    }
  }

  // Collect from global middleware config
  vars.push(...collectMiddlewareEnvVars(config.middleware, source));

  return vars;
}

/**
 * Collect env vars from all targets
 */
export function collectEnvVarsFromTargets(
  targets: GenerationTarget[],
  config: SchemockConfig
): RequiredEnvVar[] {
  const allVars: RequiredEnvVar[] = [];
  for (const target of targets) {
    allVars.push(...collectEnvVarsForTarget(target, config));
  }
  return deduplicateEnvVars(allVars);
}

/**
 * Collect env vars for legacy single-adapter mode
 */
export function collectEnvVarsForLegacyAdapter(
  adapter: string,
  config: SchemockConfig
): RequiredEnvVar[] {
  const vars: RequiredEnvVar[] = [];
  const source = `${adapter} adapter`;

  switch (adapter) {
    case 'supabase': {
      const supabaseConfig = config.adapters?.supabase || {};
      const envPrefix = supabaseConfig.envPrefix ?? 'NEXT_PUBLIC_SUPABASE';
      vars.push(...supabaseClientVars(envPrefix, source));
      break;
    }

    case 'firebase': {
      vars.push(...firebaseVars(source));
      break;
    }

    // mock, pglite, fetch don't need env vars
    default:
      break;
  }

  // Collect from global middleware config
  vars.push(...collectMiddlewareEnvVars(config.middleware, source));

  return deduplicateEnvVars(vars);
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Deduplicate env vars by name, merging sources
 */
function deduplicateEnvVars(vars: RequiredEnvVar[]): RequiredEnvVar[] {
  const seen = new Map<string, RequiredEnvVar>();

  for (const v of vars) {
    const existing = seen.get(v.name);
    if (existing) {
      // Merge sources
      if (!existing.source.includes(v.source)) {
        existing.source += `, ${v.source}`;
      }
      // If any source marks it required, it's required
      if (v.required) {
        existing.required = true;
      }
    } else {
      seen.set(v.name, { ...v });
    }
  }

  return Array.from(seen.values());
}

// ============================================================================
// .env.example Generation
// ============================================================================

/**
 * Generate .env.example file content from collected env vars
 */
export function generateEnvExampleContent(envVars: RequiredEnvVar[]): string {
  const lines: string[] = [
    '# =============================================',
    '# Environment Variables (Generated by Schemock)',
    '# =============================================',
    '',
  ];

  // Group by source
  const grouped = new Map<string, RequiredEnvVar[]>();
  for (const v of envVars) {
    // Use first source as the group key
    const groupKey = v.source.split(',')[0].trim();
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)!.push(v);
  }

  for (const [source, vars] of grouped) {
    lines.push(`# ${source}`);
    for (const v of vars) {
      if (!v.required) {
        lines.push(`# ${v.description} (optional)`);
      }
      lines.push(`${v.name}=${v.example}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write .env.example to the project root.
 * If the file already exists, only appends new variables that are missing.
 */
export async function writeEnvExample(
  envVars: RequiredEnvVar[],
  dryRun?: boolean
): Promise<void> {
  const filePath = join(process.cwd(), '.env.example');

  if (dryRun) {
    console.log('   [DRY RUN] Would write .env.example');
    return;
  }

  let existingContent = '';
  try {
    existingContent = await readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist — will create fresh
  }

  if (!existingContent) {
    // Create fresh file
    const content = generateEnvExampleContent(envVars);
    await writeFile(filePath, content, 'utf-8');
    console.log('   Created .env.example');
    return;
  }

  // Parse existing var names
  const existingVarNames = new Set<string>();
  for (const line of existingContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        existingVarNames.add(trimmed.substring(0, eqIdx).trim());
      }
    }
  }

  // Find new vars not already in the file
  const newVars = envVars.filter((v) => !existingVarNames.has(v.name));

  if (newVars.length === 0) {
    // All vars already present
    return;
  }

  // Append new vars with separator
  const appendLines: string[] = [
    '',
    '# -----------------------------------------',
    '# Added by Schemock',
    '# -----------------------------------------',
    '',
  ];

  for (const v of newVars) {
    if (!v.required) {
      appendLines.push(`# ${v.description} (optional)`);
    }
    appendLines.push(`${v.name}=${v.example}`);
  }
  appendLines.push('');

  await writeFile(filePath, existingContent.trimEnd() + '\n' + appendLines.join('\n'), 'utf-8');
  console.log(`   Updated .env.example (+${newVars.length} new variables)`);
}

// ============================================================================
// CLI Summary
// ============================================================================

/**
 * Print a CLI summary of required env vars
 */
export function printEnvVarSummary(envVars: RequiredEnvVar[]): void {
  if (envVars.length === 0) return;

  // Find max name length for alignment
  const maxNameLen = Math.max(...envVars.map((v) => v.name.length));

  console.log('');
  console.log('🔑 Required environment variables:');
  for (const v of envVars) {
    const padding = ' '.repeat(maxNameLen - v.name.length);
    const suffix = v.required ? '' : ' (optional)';
    console.log(`   ${v.name}${padding} — ${v.description}${suffix}`);
  }
  console.log('');
  console.log('   See .env.example for details');
  console.log('');
}
