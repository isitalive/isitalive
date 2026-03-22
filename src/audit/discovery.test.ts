// ---------------------------------------------------------------------------
// Tests for manifest discovery module
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { discoverManifests } from './discovery'

// Mock KV namespace
function createMockKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    _store: store,
  }
}

describe('discoverManifests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('discovers package.json at repo root', async () => {
    const kv = createMockKV()
    const mockResponse = [
      { name: 'README.md', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/README.md' },
      { name: 'package.json', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/package.json' },
      { name: 'src', type: 'dir', download_url: null },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      filename: 'package.json',
      downloadUrl: 'https://raw.githubusercontent.com/owner/repo/main/package.json',
      format: 'package.json',
    })
    expect(kv.put).toHaveBeenCalledOnce()
  })

  it('discovers go.mod at repo root', async () => {
    const kv = createMockKV()
    const mockResponse = [
      { name: 'go.mod', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/go.mod' },
      { name: 'go.sum', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/go.sum' },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toHaveLength(1)
    expect(result[0].filename).toBe('go.mod')
    expect(result[0].format).toBe('go.mod')
  })

  it('discovers both package.json and go.mod', async () => {
    const kv = createMockKV()
    const mockResponse = [
      { name: 'package.json', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/package.json' },
      { name: 'go.mod', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/go.mod' },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toHaveLength(2)
    expect(result.map(m => m.filename).sort()).toEqual(['go.mod', 'package.json'])
  })

  it('returns empty array when no manifests found', async () => {
    const kv = createMockKV()
    const mockResponse = [
      { name: 'README.md', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/README.md' },
      { name: 'src', type: 'dir', download_url: null },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toHaveLength(0)
    // Should cache the empty result
    expect(kv.put).toHaveBeenCalledOnce()
  })

  it('returns empty array on GitHub API error', async () => {
    const kv = createMockKV()

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not found', { status: 404 }),
    )

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toHaveLength(0)
    expect(kv.put).toHaveBeenCalledOnce()
  })

  it('returns cached result on second call', async () => {
    const kv = createMockKV()
    const cached = [{ filename: 'package.json', downloadUrl: 'https://example.com/package.json', format: 'package.json' }]
    kv._store.set('discover:owner/repo', JSON.stringify(cached))

    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toEqual(cached)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ignores directories with manifest names', async () => {
    const kv = createMockKV()
    const mockResponse = [
      { name: 'package.json', type: 'dir', download_url: null },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toHaveLength(0)
  })

  it('handles network errors gracefully', async () => {
    const kv = createMockKV()

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const result = await discoverManifests('owner', 'repo', 'test-token', kv as any)

    expect(result).toHaveLength(0)
    // Should cache briefly to avoid hammering
    expect(kv.put).toHaveBeenCalledOnce()
  })
})
