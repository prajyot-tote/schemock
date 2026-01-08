/**
 * Schemock CLI - Command-line interface for schema-first mocking
 *
 * @module cli
 * @category CLI
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface CLIOptions {
  output?: string;
  format?: string;
  template?: string;
  adapter?: string;
  config?: string;
  watch?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  // SQL generation options
  combined?: boolean;
  target?: 'postgres' | 'supabase' | 'pglite';
  only?: string[];
  exclude?: string[];
  readme?: boolean;
}

/**
 * Parse command line arguments.
 */
function parseArgs(args: string[]): { command: string; options: CLIOptions; positional: string[] } {
  const options: CLIOptions = {};
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--format' || arg === '-f') {
      options.format = args[++i];
    } else if (arg === '--template' || arg === '-t') {
      options.template = args[++i];
    } else if (arg === '--adapter' || arg === '-a') {
      options.adapter = args[++i];
    } else if (arg === '--config' || arg === '-c') {
      options.config = args[++i];
    } else if (arg === '--watch' || arg === '-w') {
      options.watch = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--combined') {
      options.combined = true;
    } else if (arg === '--target') {
      options.target = args[++i] as 'postgres' | 'supabase' | 'pglite';
    } else if (arg === '--only') {
      options.only = args[++i].split(',');
    } else if (arg === '--exclude') {
      options.exclude = args[++i].split(',');
    } else if (arg === '--readme') {
      options.readme = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

/**
 * Display help information.
 */
function showHelp(): void {
  console.log(`
schemock - Schema-first mocking for frontend developers

Usage:
  schemock <command> [options]

Commands:
  init [--template <template>]     Initialize a new Schemock project
  generate [options]               Generate TypeScript types, client, and hooks
  generate:sql [options]           Generate PostgreSQL SQL schema with RLS
  generate:openapi [--output <file>] [--format <json|yaml>]
                                   Generate OpenAPI 3.0 specification
  generate:postman [--output <file>]
                                   Generate Postman collection
  help                             Show this help message
  version                          Show version

Generate Options:
  --adapter, -a <type>    Adapter type: mock|supabase|firebase|fetch|graphql (default: mock)
  --output, -o <dir>      Output directory (default: ./src/generated)
  --config, -c <file>     Config file path (default: ./schemock.config.ts)
  --only <entities>       Only generate for these entities (comma-separated)
                          Applies to ALL targets, overrides config
  --exclude <entities>    Exclude these entities (comma-separated)
                          Applies to ALL targets, overrides config
  --watch, -w             Watch mode - regenerate on schema changes
  --dry-run               Show what would be generated without writing files
  --verbose, -v           Verbose output

SQL Generation Options (generate:sql):
  --output, -o <dir>      Output directory (default: ./sql)
  --combined              Generate single combined schema.sql file
  --target <platform>     Target: postgres|supabase|pglite (default: postgres)
  --only <sections>       Only generate specific sections (comma-separated):
                          tables,foreign-keys,indexes,rls,functions,triggers
  --readme                Generate README.md documentation
  --dry-run               Show what would be generated without writing files

Other Options:
  --format, -f <format>   Output format (json, yaml) for OpenAPI
  --template, -t <name>   Template name for init

Examples:
  schemock init --template basic
  schemock generate
  schemock generate --adapter mock --output ./src/api
  schemock generate --adapter supabase
  schemock generate --only user,post          # Only generate User and Post
  schemock generate --exclude comment         # Generate all except Comment
  schemock generate:sql --output ./sql --readme
  schemock generate:sql --target supabase --combined
  schemock generate:sql --only tables,indexes,rls
  schemock generate:openapi --output api.yaml --format yaml
  schemock generate:postman --output collection.json

Entity Filtering (in config):
  targets: [
    { name: 'api', type: 'nextjs-api', entities: ['user', 'post'] },
    { name: 'node', type: 'node-handlers', excludeEntities: ['audit'] },
  ]
`);
}

/**
 * Display version information.
 */
function showVersion(): void {
  try {
    // Try to read from package.json in the installed location
    const pkgPath = resolve(__dirname, '../package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      console.log(`schemock v${pkg.version}`);
      return;
    }
  } catch {
    // Fallback
  }
  console.log('schemock v0.1.0');
}

/**
 * Initialize a new Schemock project.
 */
async function initCommand(options: CLIOptions): Promise<void> {
  const template = options.template || 'basic';

  console.log(`\nInitializing Schemock project with template: ${template}\n`);

  // Create directory structure
  const dirs = ['src/schemas'];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`  Created ${dir}/`);
    }
  }

  // Create example schema file
  const schemaPath = 'src/schemas/user.ts';
  if (!existsSync(schemaPath)) {
    const schemaContent = `import { defineData, field, hasMany, belongsTo } from 'schemock/schema';

/**
 * User entity schema.
 */
export const userSchema = defineData('user', {
  id: field.uuid(),
  email: field.email().unique(),
  name: field.string(),
  role: field.enum(['admin', 'user', 'guest']).default('user'),
  avatar: field.url().nullable(),
});

/**
 * Post entity schema with relation to User.
 */
export const postSchema = defineData('post', {
  id: field.uuid(),
  title: field.string(),
  content: field.text(),
  authorId: field.ref('user'),
  published: field.boolean().default(false),
}, {
  relations: {
    author: belongsTo('user', 'authorId'),
  },
});

/**
 * Comment entity schema.
 */
export const commentSchema = defineData('comment', {
  id: field.uuid(),
  content: field.text(),
  postId: field.ref('post'),
  authorId: field.ref('user'),
}, {
  relations: {
    post: belongsTo('post', 'postId'),
    author: belongsTo('user', 'authorId'),
  },
});
`;
    writeFileSync(schemaPath, schemaContent);
    console.log(`  Created ${schemaPath}`);
  }

  // Create config file
  const configPath = 'schemock.config.ts';
  if (!existsSync(configPath)) {
    const configContent = `import { defineConfig } from 'schemock/cli';

export default defineConfig({
  // Schema file pattern
  schemas: './src/schemas/**/*.ts',

  // Output directory for generated code
  output: './src/generated',

  // Default adapter type
  adapter: 'mock',

  // API prefix for endpoints
  apiPrefix: '/api',

  // Adapter-specific configuration
  adapters: {
    mock: {
      // Default seed counts per entity
      seed: {
        user: 5,
        post: 20,
        comment: 50,
      },
      // Simulated network delay (ms)
      delay: 100,
    },
    supabase: {
      envPrefix: 'NEXT_PUBLIC_SUPABASE',
    },
    fetch: {
      baseUrl: process.env.API_URL || '',
    },
  },
});
`;
    writeFileSync(configPath, configContent);
    console.log(`  Created ${configPath}`);
  }

  console.log('\n✓ Schemock initialized successfully!\n');
  console.log('Next steps:');
  console.log('  1. Review and customize schemas in src/schemas/');
  console.log('  2. Run: npx schemock generate');
  console.log('  3. Import { useUsers, useCreateUser } from ./src/generated');
  console.log('');
}

/**
 * Generate TypeScript types, client, and hooks.
 */
async function generateCommand(options: CLIOptions): Promise<void> {
  const { generate } = await import('./cli/commands/generate');
  await generate({
    adapter: options.adapter,
    output: options.output,
    config: options.config,
    watch: options.watch,
    dryRun: options.dryRun,
    verbose: options.verbose,
    only: options.only,
    exclude: options.exclude,
  });
}

/**
 * Generate SQL schema with RLS, indexes, and functions.
 */
async function generateSQLCommand(options: CLIOptions): Promise<void> {
  const { generateSQLFiles } = await import('./cli/commands/generate-sql');
  await generateSQLFiles({
    output: options.output,
    config: options.config,
    combined: options.combined,
    target: options.target,
    only: options.only as ('tables' | 'foreign-keys' | 'indexes' | 'rls' | 'functions' | 'triggers')[] | undefined,
    readme: options.readme,
    dryRun: options.dryRun,
    verbose: options.verbose,
  });
}

/**
 * Generate OpenAPI specification command.
 */
async function generateOpenAPICommand(options: CLIOptions): Promise<void> {
  const { generateOpenAPI, registerSchemas } = await import('./generator');

  console.log('\nGenerating OpenAPI specification...');

  // Note: In a real implementation, we would load schemas from the project
  // For now, show how to use it
  if (!options.output) {
    console.log('\nUsage: schemock generate:openapi --output <file> [--format <json|yaml>]');
    console.log('\nThis command generates an OpenAPI 3.0 specification from your schemas.');
    console.log('\nTo use programmatically:');
    console.log(`
  import { generateOpenAPI, registerSchemas } from 'schemock/generator';
  import { userSchema, postSchema } from './schemas';

  registerSchemas([userSchema, postSchema]);
  const spec = generateOpenAPI({
    title: 'My API',
    version: '1.0.0',
  });
`);
    return;
  }

  const outputPath = resolve(options.output);
  const format = options.format || (outputPath.endsWith('.yaml') || outputPath.endsWith('.yml') ? 'yaml' : 'json');

  // Generate empty spec as placeholder
  const spec = generateOpenAPI({
    title: 'API Documentation',
    version: '1.0.0',
    description: 'Generated by Schemock',
  });

  const output = format === 'yaml'
    ? toYAML(spec)
    : JSON.stringify(spec, null, 2);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
  console.log(`  Generated: ${outputPath}`);
  console.log('\n✓ OpenAPI specification generated successfully!\n');
}

/**
 * Generate Postman collection command.
 */
async function generatePostmanCommand(options: CLIOptions): Promise<void> {
  const { generatePostmanCollection, registerSchemasForPostman } = await import('./generator');

  console.log('\nGenerating Postman collection...');

  if (!options.output) {
    console.log('\nUsage: schemock generate:postman --output <file>');
    console.log('\nThis command generates a Postman collection from your schemas.');
    console.log('\nTo use programmatically:');
    console.log(`
  import { generatePostmanCollection, registerSchemasForPostman } from 'schemock/generator';
  import { userSchema, postSchema } from './schemas';

  registerSchemasForPostman([userSchema, postSchema]);
  const collection = generatePostmanCollection({
    name: 'My API',
    baseUrl: 'http://localhost:3000',
  });
`);
    return;
  }

  const outputPath = resolve(options.output);

  // Generate empty collection as placeholder
  const collection = generatePostmanCollection({
    name: 'API Collection',
    baseUrl: 'http://localhost:3000',
    description: 'Generated by Schemock',
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(collection, null, 2));
  console.log(`  Generated: ${outputPath}`);
  console.log('\n✓ Postman collection generated successfully!\n');
}

/**
 * Simple YAML serializer for OpenAPI output.
 */
function toYAML(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'boolean' || typeof obj === 'number') {
    return String(obj);
  }

  if (typeof obj === 'string') {
    // Check if string needs quoting
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#') || obj === '') {
      return `"${obj.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => `${spaces}- ${toYAML(item, indent + 1).trimStart()}`).join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        const yamlValue = toYAML(value, indent + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:\n${yamlValue}`;
        }
        return `${spaces}${key}: ${yamlValue}`;
      })
      .join('\n');
  }

  return String(obj);
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
    case '':
      showHelp();
      break;

    case 'version':
    case '--version':
    case '-v':
      showVersion();
      break;

    case 'init':
      await initCommand(options);
      break;

    case 'generate':
      await generateCommand(options);
      break;

    case 'generate:openapi':
      await generateOpenAPICommand(options);
      break;

    case 'generate:postman':
      await generatePostmanCommand(options);
      break;

    case 'generate:sql':
      await generateSQLCommand(options);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "schemock help" for usage information.');
      process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});
