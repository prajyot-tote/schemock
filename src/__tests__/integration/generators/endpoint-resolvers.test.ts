
import { describe, it, expect } from 'vitest';
import { generateEndpointResolvers } from '../../../cli/generators/mock/endpoints';
import { join } from 'path';

describe('generateEndpointResolvers', () => {
  describe('type annotation preservation', () => {
    it('should add types to variable declarations with stripped annotations', () => {
      // When tsx compiles `let profiles: any[];`, it becomes `let profiles ;`
      const endpoints = [
        {
          name: 'complexResolver',
          method: 'GET' as const,
          path: '/api/complex',
          pascalName: 'Complex',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async ({ db }) => { let profiles ; profiles = []; return { data: profiles }; }',
          description: 'Complex endpoint with stripped types',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      // Should add `: any` to the variable declaration
      expect(code).toContain('let profiles: any;');
      expect(code).not.toContain('let profiles ;');
    });

    it('should add types to let declarations with assignment', () => {
      const endpoints = [
        {
          name: 'letAssign',
          method: 'GET' as const,
          path: '/api/let-assign',
          pascalName: 'LetAssign',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async () => { let result = []; return { data: result }; }',
          description: 'Let with assignment',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      // When there's suspicious spacing like `let result = []`, it should add type
      expect(code).toContain('let result');
    });

    it('should add generic type to Set constructor with stripped generics', () => {
      // When tsx compiles `new Set<string>()`, it becomes `new Set ()`
      const endpoints = [
        {
          name: 'setResolver',
          method: 'GET' as const,
          path: '/api/set',
          pascalName: 'SetResolver',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async () => { const ids = new Set (); return { ids: Array.from(ids) }; }',
          description: 'Set with stripped generic',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      // Should add `<unknown>` to the Set constructor
      expect(code).toContain('new Set<unknown>()');
      expect(code).not.toContain('new Set ()');
    });

    it('should add generic type to Map constructor with stripped generics', () => {
      const endpoints = [
        {
          name: 'mapResolver',
          method: 'GET' as const,
          path: '/api/map',
          pascalName: 'MapResolver',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async () => { const cache = new Map (); return { size: cache.size }; }',
          description: 'Map with stripped generic',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      expect(code).toContain('new Map<unknown, unknown>()');
      expect(code).not.toContain('new Map ()');
    });

    it('should add types to callback arrow function params with stripped types', () => {
      // When tsx compiles `.map((m: any) => ...)`, it becomes `.map((m ) => ...)`
      const endpoints = [
        {
          name: 'callbackResolver',
          method: 'GET' as const,
          path: '/api/callback',
          pascalName: 'Callback',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async ({ db }) => { const items = db.user.getAll(); return { ids: items.map((m ) => m.id) }; }',
          description: 'Callback with stripped param type',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      // Should add `: any` to the callback parameter
      expect(code).toContain('.map((m: any) =>');
      expect(code).not.toContain('.map((m ) =>');
    });

    it('should add types to filter callback with stripped types', () => {
      const endpoints = [
        {
          name: 'filterResolver',
          method: 'GET' as const,
          path: '/api/filter',
          pascalName: 'Filter',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async ({ db }) => { const active = db.user.getAll().filter((u ) => u.active); return { data: active }; }',
          description: 'Filter with stripped param type',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      expect(code).toContain('.filter((u: any) =>');
      expect(code).not.toContain('.filter((u ) =>');
    });

    it('should add types to standalone arrow function params', () => {
      const endpoints = [
        {
          name: 'arrowResolver',
          method: 'GET' as const,
          path: '/api/arrow',
          pascalName: 'Arrow',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async ({ db }) => { const fn = (x ) => x * 2; return { result: fn(5) }; }',
          description: 'Arrow function with stripped param type',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      expect(code).toContain('(x: any) =>');
      expect(code).not.toContain('(x ) =>');
    });

    it('should handle multiple patterns in one resolver', () => {
      // Real-world scenario with multiple stripped type patterns
      const endpoints = [
        {
          name: 'realWorld',
          method: 'POST' as const,
          path: '/api/real-world',
          pascalName: 'RealWorld',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: `async ({ db, context }) => {
            let profiles ;
            const ids = new Set ();
            const items = db.user.getAll().map((m ) => m.user_id);
            items.forEach((id ) => ids.add(id));
            return { data: Array.from(ids) };
          }`,
          description: 'Real-world resolver with multiple stripped types',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      expect(code).toContain('let profiles: any;');
      expect(code).toContain('new Set<unknown>()');
      expect(code).toContain('.map((m: any) =>');
      expect(code).toContain('.forEach((id: any) =>');
    });

    it('should clean up trailing spaces before semicolons', () => {
      const endpoints = [
        {
          name: 'trailingSpace',
          method: 'GET' as const,
          path: '/api/trailing',
          pascalName: 'Trailing',
          pathParams: [],
          params: [],
          body: [],
          response: [],
          mockResolverSource: 'async ({ context }) => { const userId = context?.userId ; return { userId }; }',
          description: 'Trailing space before semicolon',
        },
      ];
      const code = generateEndpointResolvers(endpoints, '');
      // Should remove trailing space before semicolon
      expect(code).not.toContain('userId ;');
    });
  });

  it('should import and use named external resolvers', () => {
    const endpoints = [
      {
        name: 'search',
        method: 'GET' as const,
        path: '/api/search',
        pascalName: 'Search',
        pathParams: [],
        params: [],
        body: [],
        response: [],
        mockResolverSource: '',
        mockResolverName: 'searchResolver',
        mockResolverImportPath: join(__dirname, '../../../resolvers/searchResolver'),
        description: 'Search endpoint',
      },
    ];
    const outputDir = join(__dirname, '../../generated');
    // POSIX-style relative path calculation
    const toPosix = (p: string) => p.replace(/\\/g, '/');
    const from = toPosix(outputDir);
    const to = toPosix(endpoints[0].mockResolverImportPath);
    const fromParts = from.split('/').filter(Boolean);
    const toParts = to.split('/').filter(Boolean);
    while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
      fromParts.shift();
      toParts.shift();
    }
    let rel = '../'.repeat(fromParts.length) + toParts.join('/');
    if (!rel.startsWith('.') && rel !== '') rel = './' + rel;
    rel = rel.replace(/\.(ts|js)$/, '');
    const code = generateEndpointResolvers(endpoints, outputDir);
    expect(code).toContain(`import { searchResolver } from '${rel}'`);
    expect(code).toContain('search: searchResolver');
  });

  it('should inline anonymous resolvers', () => {
    const endpoints = [
      {
        name: 'inline',
        method: 'GET' as const,
        path: '/api/inline',
        pascalName: 'Inline',
        pathParams: [],
        params: [],
        body: [],
        response: [],
        mockResolverSource: 'async () => ({ ok: true })',
        description: 'Inline endpoint',
      },
    ];
    const code = generateEndpointResolvers(endpoints, '');
    expect(code).toContain('inline: async () => ({ ok: true })');
  });
});
