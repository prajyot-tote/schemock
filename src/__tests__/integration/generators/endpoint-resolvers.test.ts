
import { describe, it, expect } from 'vitest';
import { generateEndpointResolvers } from '../../../cli/generators/mock/endpoints';
import { join } from 'path';

describe('generateEndpointResolvers', () => {
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
