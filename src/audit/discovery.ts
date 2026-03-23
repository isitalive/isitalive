// ---------------------------------------------------------------------------
// Manifest discovery — find package.json / go.mod at a repo's root
//
// Uses the GitHub Contents API to list root-level files and filter for
// known manifest filenames. Results are cached in KV for 6 hours.
// ---------------------------------------------------------------------------

import type { ManifestFormat } from './parsers'

export interface DiscoveredManifest {
  /** Filename at repo root */
  filename: string
  /** Raw download URL (GitHub raw content) */
  downloadUrl: string
  /** Manifest format for the parser */
  format: ManifestFormat
}

const MANIFEST_FILENAMES: Record<string, ManifestFormat> = {
  'package.json': 'package.json',
  'go.mod': 'go.mod',
}

const DISCOVERY_CACHE_PREFIX = 'discover:'
const DISCOVERY_CACHE_TTL = 6 * 60 * 60 // 6 hours
const DISCOVERY_ERROR_TTL = 5 * 60       // 5 min on error

/**
 * Discover manifest files at the root of a GitHub repository.
 *
 * Makes a single GitHub REST API call to list root directory contents,
 * then filters for known manifest filenames (package.json, go.mod).
 *
 * Results are cached in KV to avoid repeated API calls.
 */
export async function discoverManifests(
  owner: string,
  repo: string,
  token: string,
  kv: KVNamespace,
): Promise<DiscoveredManifest[]> {
  // Normalize to lowercase to avoid case-sensitive cache duplicates
  const normalizedOwner = owner.toLowerCase()
  const normalizedRepo = repo.toLowerCase()
  const cacheKey = `${DISCOVERY_CACHE_PREFIX}${normalizedOwner}/${normalizedRepo}`

  const cached = await kv.get(cacheKey)
  if (cached !== null) {
    try {
      return JSON.parse(cached) as DiscoveredManifest[]
    } catch {
      // Corrupted cache entry — evict and recompute
      await kv.delete(cacheKey)
    }
  }

  // Fetch root directory listing from GitHub Contents API
  let manifests: DiscoveredManifest[] = []
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'isitalive/1.0',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(5000),
      },
    )

    if (!res.ok) {
      // Non-critical — cache briefly to avoid hammering the API on repeated failures
      await kv.put(cacheKey, '[]', { expirationTtl: DISCOVERY_ERROR_TTL })
      return []
    }

    const items = (await res.json()) as Array<{
      name: string
      type: string
      download_url: string | null
    }>

    // Filter for known manifest filenames at root level (files only)
    manifests = items
      .filter(
        (item) =>
          item.type === 'file' &&
          Object.hasOwn(MANIFEST_FILENAMES, item.name) &&
          item.download_url,
      )
      .map((item) => ({
        filename: item.name,
        downloadUrl: item.download_url!,
        format: MANIFEST_FILENAMES[item.name],
      }))
  } catch {
    // Network/timeout error — cache empty result briefly to avoid hammering
    await kv.put(cacheKey, '[]', { expirationTtl: DISCOVERY_ERROR_TTL })
    return []
  }

  // Cache the result (full TTL for successful responses)
  await kv.put(cacheKey, JSON.stringify(manifests), {
    expirationTtl: DISCOVERY_CACHE_TTL,
  })

  return manifests
}
