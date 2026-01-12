/**
 * TypeScript compilation checking utilities for integration tests
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const execAsync = promisify(exec);

export interface CompileResult {
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Check if TypeScript code compiles without errors
 */
export async function checkTypeScriptCompiles(
  filePath: string,
  additionalFiles?: string[]
): Promise<CompileResult> {
  // Create a minimal tsconfig for the test
  const tsConfigPath = join(dirname(filePath), 'tsconfig.test.json');
  const tsConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022', 'DOM'],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
    },
    include: [filePath, ...(additionalFiles || [])],
  };

  await writeFile(tsConfigPath, JSON.stringify(tsConfig, null, 2));

  try {
    await execAsync(`npx tsc --project ${tsConfigPath}`, {
      cwd: dirname(filePath),
    });
    return { success: true };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    const errorOutput = execError.stderr || execError.stdout || '';
    const errors = errorOutput
      .split('\n')
      .filter(line => line.includes('error TS'))
      .map(line => line.trim());

    return {
      success: false,
      errors: errors.length > 0 ? errors : [errorOutput],
    };
  }
}

/**
 * Verify generated code contains expected patterns
 */
export function assertCodeContains(code: string, patterns: string[]): void {
  for (const pattern of patterns) {
    if (!code.includes(pattern)) {
      throw new Error(`Generated code missing expected pattern: "${pattern}"\n\nGenerated code snippet:\n${code.substring(0, 500)}...`);
    }
  }
}

/**
 * Verify generated code does NOT contain patterns (for negative tests)
 */
export function assertCodeDoesNotContain(code: string, patterns: string[]): void {
  for (const pattern of patterns) {
    if (code.includes(pattern)) {
      throw new Error(`Generated code unexpectedly contains: "${pattern}"`);
    }
  }
}

/**
 * Check if code matches a regular expression pattern
 */
export function assertCodeMatches(code: string, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    if (!pattern.test(code)) {
      throw new Error(`Generated code does not match pattern: ${pattern}`);
    }
  }
}
