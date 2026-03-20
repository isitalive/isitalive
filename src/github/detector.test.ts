import { describe, expect, it } from 'vitest';
import { detectManifests } from '../github/detector';
import type { PullRequestFile } from '../github/types';

function makeFile(filename: string, status = 'modified'): PullRequestFile {
  return { sha: 'abc123', filename, status, additions: 1, deletions: 0 };
}

describe('detectManifests', () => {
  it('detects a root package.json', () => {
    const files = [makeFile('package.json')];
    const result = detectManifests(files);
    expect(result).toEqual([{ path: 'package.json', format: 'package.json' }]);
  });

  it('detects a root go.mod', () => {
    const files = [makeFile('go.mod')];
    const result = detectManifests(files);
    expect(result).toEqual([{ path: 'go.mod', format: 'go.mod' }]);
  });

  it('detects a nested package.json (not in excluded dirs)', () => {
    const files = [makeFile('apps/web/package.json')];
    const result = detectManifests(files);
    expect(result).toEqual([{ path: 'apps/web/package.json', format: 'package.json' }]);
  });

  it('ignores node_modules package.json', () => {
    const files = [makeFile('node_modules/lodash/package.json')];
    const result = detectManifests(files);
    expect(result).toEqual([]);
  });

  it('ignores vendor go.mod', () => {
    const files = [makeFile('vendor/github.com/foo/go.mod')];
    const result = detectManifests(files);
    expect(result).toEqual([]);
  });

  it('ignores test fixture manifests', () => {
    const files = [
      makeFile('testdata/package.json'),
      makeFile('test/fixtures/package.json'),
      makeFile('__tests__/package.json'),
    ];
    const result = detectManifests(files);
    expect(result).toEqual([]);
  });

  it('ignores deleted files', () => {
    const files = [makeFile('package.json', 'removed')];
    const result = detectManifests(files);
    expect(result).toEqual([]);
  });

  it('ignores non-manifest files', () => {
    const files = [
      makeFile('README.md'),
      makeFile('src/index.ts'),
      makeFile('tsconfig.json'),
    ];
    const result = detectManifests(files);
    expect(result).toEqual([]);
  });

  it('detects multiple manifests in a monorepo', () => {
    const files = [
      makeFile('package.json'),
      makeFile('apps/api/package.json'),
      makeFile('go.mod'),
    ];
    const result = detectManifests(files);
    expect(result).toHaveLength(3);
    expect(result.map(m => m.format)).toEqual(['package.json', 'package.json', 'go.mod']);
  });
});
