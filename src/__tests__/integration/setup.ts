/**
 * Global test setup for integration tests
 */
import { beforeAll, afterAll, vi } from 'vitest';

// Store original console methods
const originalWarn = console.warn;
const originalError = console.error;

// Global test setup
beforeAll(() => {
  // Suppress FK Inference Warning messages during tests
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('FK Inference Warning')) {
      return;
    }
    originalWarn.apply(console, args);
  };

  // Suppress specific error messages that are expected during tests
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Expected test error')) {
      return;
    }
    originalError.apply(console, args);
  };
});

// Global test teardown
afterAll(() => {
  // Restore original console methods
  console.warn = originalWarn;
  console.error = originalError;
});
