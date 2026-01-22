# Runtime Testing Plan

> Preliminary plan for adding runtime behavior tests to Schemock

**Status:** Draft
**Priority:** High
**Estimated Tests:** 400-600 new tests

---

## Problem Statement

Schemock has **409 tests** that verify code generation (string matching, compilation checks), but **0 tests** that verify the generated/actual code behaves correctly at runtime.

### Current State

| Module | LOC | Runtime Tests | Risk |
|--------|-----|---------------|------|
| Adapters (fetch, firebase, supabase, graphql) | 1,100 | 0 | **HIGH** |
| Middleware (auth, cache, retry, logger, chain) | 1,200 | 0 | **HIGH** |
| React Utilities (hooks, provider, context) | 500 | 0 | **HIGH** |
| Storage Drivers (memory, localStorage, PGlite) | 800 | 0 | **HIGH** |
| Security (audit, rls, rate-limit) | 600 | 0 | **HIGH** |
| Schema DSL (field, define-data, relations) | 1,500 | ~10% | Medium |

---

## Phase 1: Adapter Runtime Tests (~150 tests)

### 1.1 MockAdapter Tests
**File:** `src/__tests__/runtime/adapters/mock.test.ts`

```typescript
// Example test structure
describe('MockAdapter', () => {
  describe('CRUD operations', () => {
    test('create() persists entity and returns with generated ID');
    test('get() retrieves entity by ID');
    test('list() returns all entities');
    test('update() modifies existing entity');
    test('delete() removes entity');
    test('list() with filters returns matching entities');
  });

  describe('Relations', () => {
    test('hasMany relation returns related entities');
    test('belongsTo relation returns parent entity');
    test('nested create works with relations');
  });

  describe('RLS enforcement', () => {
    test('select respects scope-based RLS');
    test('insert validates RLS context');
    test('bypass allows admin access');
  });
});
```

### 1.2 FetchAdapter Tests
**File:** `src/__tests__/runtime/adapters/fetch.test.ts`

- Mock fetch with MSW or vi.mock
- Test request construction (headers, body, URL)
- Test response parsing
- Test error handling (network errors, 4xx, 5xx)

### 1.3 SupabaseAdapter Tests
**File:** `src/__tests__/runtime/adapters/supabase.test.ts`

- Mock Supabase client
- Test query building
- Test RLS context passing
- Test error code mapping (23505 → 409, etc.)

### 1.4 FirebaseAdapter Tests
**File:** `src/__tests__/runtime/adapters/firebase.test.ts`

- Mock Firestore
- Test document CRUD
- Test query filters
- Test collection references

---

## Phase 2: Middleware Runtime Tests (~100 tests)

### 2.1 Auth Middleware
**File:** `src/__tests__/runtime/middleware/auth.test.ts`

```typescript
describe('AuthMiddleware', () => {
  test('attaches token to request headers');
  test('rejects request when no token available');
  test('refreshes expired token automatically');
  test('skips auth for public endpoints');
  test('extracts user context from JWT');
});
```

### 2.2 Retry Middleware
**File:** `src/__tests__/runtime/middleware/retry.test.ts`

```typescript
describe('RetryMiddleware', () => {
  test('retries on 503 Service Unavailable');
  test('retries on network errors');
  test('respects maxRetries limit');
  test('uses exponential backoff');
  test('does not retry on 4xx errors');
  test('does not retry non-idempotent methods by default');
});
```

### 2.3 Cache Middleware
**File:** `src/__tests__/runtime/middleware/cache.test.ts`

```typescript
describe('CacheMiddleware', () => {
  test('caches GET responses');
  test('returns cached response on cache hit');
  test('invalidates cache on mutation');
  test('respects TTL expiration');
  test('uses correct cache key generation');
});
```

### 2.4 Middleware Chain
**File:** `src/__tests__/runtime/middleware/chain.test.ts`

```typescript
describe('MiddlewareChain', () => {
  test('executes middlewares in order');
  test('passes context between middlewares');
  test('onError handlers receive errors');
  test('after hooks run in reverse order');
  test('early return stops chain execution');
});
```

---

## Phase 3: Storage Driver Tests (~80 tests)

### 3.1 MemoryStorageDriver
**File:** `src/__tests__/runtime/storage/memory.test.ts`

- Basic CRUD operations
- Filter operations (eq, gt, lt, contains)
- Ordering and pagination
- Concurrent access behavior

### 3.2 LocalStorageDriver
**File:** `src/__tests__/runtime/storage/localStorage.test.ts`

- Persistence across "sessions" (mock reload)
- Graceful fallback when localStorage unavailable
- Debounced writes
- Date serialization/deserialization
- Storage quota handling

### 3.3 PGliteDriver
**File:** `src/__tests__/runtime/storage/pglite.test.ts`

- SQL query execution
- Transaction support
- RLS context via session variables
- Error code mapping

---

## Phase 4: React Utilities Tests (~60 tests)

**Requires:** `@testing-library/react`, `@testing-library/react-hooks`

### 4.1 Hooks Tests
**File:** `src/__tests__/runtime/react/hooks.test.tsx`

```typescript
describe('useUsers hook', () => {
  test('fetches data on mount');
  test('returns loading state initially');
  test('returns error on failure');
  test('refetches on invalidation');
});

describe('useCreateUser hook', () => {
  test('calls create mutation');
  test('invalidates list query on success');
  test('returns error on failure');
});
```

### 4.2 Provider Tests
**File:** `src/__tests__/runtime/react/provider.test.tsx`

```typescript
describe('SchemockProvider', () => {
  test('provides client to child components');
  test('hooks throw without provider');
  test('useSchemockClient returns configured client');
});
```

---

## Phase 5: Security Module Tests (~50 tests)

### 5.1 Audit Logger
**File:** `src/__tests__/runtime/security/audit.test.ts`

- Event logging
- Field redaction (password, token, etc.)
- Query filtering
- Memory cleanup

### 5.2 RLS Utilities
**File:** `src/__tests__/runtime/security/rls.test.ts`

- Scope-based filtering
- Custom filter functions
- Bypass rules
- Context extraction

### 5.3 Rate Limiter
**File:** `src/__tests__/runtime/security/rate-limit.test.ts`

- Sliding window algorithm
- Per-key tracking
- Expiration cleanup
- Skip function

---

## Phase 6: Schema DSL Tests (~40 tests)

### 6.1 Field Builder
**File:** `src/__tests__/runtime/schema/field.test.ts`

```typescript
describe('field builder', () => {
  test('field.string() creates string field');
  test('field.uuid() creates UUID with auto-generation');
  test('.nullable() marks field as nullable');
  test('.default() sets default value');
  test('.unique() marks field as unique');
  test('chaining preserves all modifiers');
});
```

### 6.2 Relations
**File:** `src/__tests__/runtime/schema/relations.test.ts`

- hasMany configuration
- belongsTo configuration
- hasOne configuration
- Many-to-many through junction

---

## Test Infrastructure

### Required Dev Dependencies

```json
{
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/react-hooks": "^8.0.0",
    "msw": "^2.0.0"  // Already installed
  }
}
```

### Test Helpers Needed

```typescript
// src/__tests__/helpers/mock-adapters.ts
export function createTestMockAdapter(schema) { ... }

// src/__tests__/helpers/mock-storage.ts
export function createTestStorage() { ... }

// src/__tests__/helpers/mock-middleware.ts
export function createTestMiddlewareChain() { ... }
```

### Directory Structure

```
src/__tests__/
├── integration/          # Existing - code generation tests
├── e2e/                  # Existing - end-to-end tests
├── runtime/              # NEW - runtime behavior tests
│   ├── adapters/
│   │   ├── mock.test.ts
│   │   ├── fetch.test.ts
│   │   ├── supabase.test.ts
│   │   └── firebase.test.ts
│   ├── middleware/
│   │   ├── auth.test.ts
│   │   ├── retry.test.ts
│   │   ├── cache.test.ts
│   │   └── chain.test.ts
│   ├── storage/
│   │   ├── memory.test.ts
│   │   ├── localStorage.test.ts
│   │   └── pglite.test.ts
│   ├── react/
│   │   ├── hooks.test.tsx
│   │   └── provider.test.tsx
│   ├── security/
│   │   ├── audit.test.ts
│   │   ├── rls.test.ts
│   │   └── rate-limit.test.ts
│   └── schema/
│       ├── field.test.ts
│       └── relations.test.ts
└── helpers/
    ├── mock-adapters.ts
    ├── mock-storage.ts
    └── mock-middleware.ts
```

---

## Success Criteria

- [ ] All 6 phases complete
- [ ] 400+ new runtime tests passing
- [ ] Test coverage > 80% for runtime modules
- [ ] CI pipeline includes runtime tests
- [ ] No mocking of the module under test (only external dependencies)

---

## Priority Order

1. **Phase 1 (Adapters)** - Core functionality, highest risk
2. **Phase 2 (Middleware)** - Auth/retry bugs are critical
3. **Phase 3 (Storage)** - Data persistence correctness
4. **Phase 4 (React)** - User-facing hooks
5. **Phase 5 (Security)** - Important but lower usage
6. **Phase 6 (Schema)** - Mostly covered implicitly

---

## Notes

- Each phase can be done independently
- Start with MockAdapter (Phase 1.1) as it's the most used
- React tests require additional setup (jsdom environment)
- Consider running runtime tests in separate CI job (slower)
