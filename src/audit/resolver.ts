// ---------------------------------------------------------------------------
// Resolver — maps package names to GitHub owner/repo
//
// Strategies by ecosystem:
//   Go:  Direct extraction from github.com paths, go-import meta tags for
//        vanity URLs, known mappings for gopkg.in
//   npm: npm registry API → repository.url field
// ---------------------------------------------------------------------------

import type { ParsedDep } from './parsers';
import type { Env } from '../scoring/types';

export interface ResolvedDep extends ParsedDep {
  /** GitHub owner/repo, or null if unresolvable */
  github: { owner: string; repo: string } | null;
  /** How it was resolved */
  resolvedFrom: 'direct' | 'vanity' | 'registry' | 'cache' | null;
  /** If unresolved, why */
  unresolvedReason?: string;
}

const RESOLVE_CACHE_PREFIX = 'audit:resolve:';
const RESOLVE_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve an array of parsed deps to GitHub repos.
 * Uses KV cache for previously resolved packages.
 */
export async function resolveAll(
  deps: ParsedDep[],
  env: Env,
): Promise<ResolvedDep[]> {
  return Promise.all(deps.map((d) => resolveSingle(d, env)));
}

async function resolveSingle(dep: ParsedDep, env: Env): Promise<ResolvedDep> {
  // Check cache first
  const cacheKey = `${RESOLVE_CACHE_PREFIX}${dep.ecosystem}:${dep.name}`;
  const cached = await env.CACHE_KV.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed.github) {
      return { ...dep, github: parsed.github, resolvedFrom: 'cache' };
    }
    // Cached as unresolvable
    return { ...dep, github: null, resolvedFrom: null, unresolvedReason: parsed.reason };
  }

  // Resolve fresh
  const result = dep.ecosystem === 'go'
    ? await resolveGo(dep)
    : await resolveNpm(dep);

  // Cache the result (even nulls to avoid re-fetching)
  const cacheValue = result.github
    ? { github: result.github }
    : { github: null, reason: result.unresolvedReason };
  await env.CACHE_KV.put(cacheKey, JSON.stringify(cacheValue), {
    expirationTtl: RESOLVE_CACHE_TTL,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Go resolver
// ---------------------------------------------------------------------------

async function resolveGo(dep: ParsedDep): Promise<ResolvedDep> {
  const name = dep.name;

  // Direct github.com paths
  if (name.startsWith('github.com/')) {
    const parts = name.replace('github.com/', '').split('/');
    if (parts.length >= 2) {
      return {
        ...dep,
        github: { owner: parts[0], repo: parts[1] },
        resolvedFrom: 'direct',
      };
    }
  }

  // gopkg.in — known pattern
  if (name.startsWith('gopkg.in/')) {
    const gh = resolveGopkgIn(name);
    if (gh) {
      return { ...dep, github: gh, resolvedFrom: 'vanity' };
    }
  }

  // Vanity URLs — follow go-import meta tag
  if (name.startsWith('golang.org/x/')) {
    // golang.org/x/{pkg} → github.com/golang/{pkg}
    const pkg = name.replace('golang.org/x/', '');
    return {
      ...dep,
      github: { owner: 'golang', repo: pkg },
      resolvedFrom: 'vanity',
    };
  }

  // google.golang.org — try common mappings
  if (name.startsWith('google.golang.org/')) {
    const gh = resolveGoogleGolang(name);
    if (gh) {
      return { ...dep, github: gh, resolvedFrom: 'vanity' };
    }
  }

  // Generic vanity URL — follow go-import meta tag
  try {
    const gh = await followGoImport(name);
    if (gh) {
      return { ...dep, github: gh, resolvedFrom: 'vanity' };
    }
  } catch {
    // Timeout or network error — fall through to unresolved
  }

  // Determine reason
  const host = name.split('/')[0];
  let reason = 'unknown_host';
  if (host.includes('gitlab')) reason = 'gitlab_not_supported_yet';
  else if (host.includes('bitbucket')) reason = 'bitbucket_not_supported_yet';
  else if (host.includes('internal') || host.includes('private') || !host.includes('.'))
    reason = 'private_registry';

  return { ...dep, github: null, resolvedFrom: null, unresolvedReason: reason };
}

/** gopkg.in/yaml.v3 → go-yaml/yaml, gopkg.in/check.v1 → go-check/check */
function resolveGopkgIn(name: string): { owner: string; repo: string } | null {
  // gopkg.in/{owner}/{repo}.vN or gopkg.in/{repo}.vN
  const path = name.replace('gopkg.in/', '');
  const parts = path.split('/');

  if (parts.length === 2) {
    // gopkg.in/owner/repo.vN
    const repo = parts[1].replace(/\.v\d+$/, '');
    return { owner: parts[0], repo };
  } else if (parts.length === 1) {
    // gopkg.in/repo.vN → go-{repo}/{repo}
    const repo = parts[0].replace(/\.v\d+$/, '');
    return { owner: `go-${repo}`, repo };
  }

  return null;
}

/** google.golang.org/grpc → grpc/grpc-go, etc. */
function resolveGoogleGolang(name: string): { owner: string; repo: string } | null {
  const known: Record<string, { owner: string; repo: string }> = {
    'google.golang.org/grpc': { owner: 'grpc', repo: 'grpc-go' },
    'google.golang.org/protobuf': { owner: 'protocolbuffers', repo: 'protobuf-go' },
    'google.golang.org/genproto': { owner: 'googleapis', repo: 'go-genproto' },
    'google.golang.org/api': { owner: 'googleapis', repo: 'google-api-go-client' },
    'google.golang.org/appengine': { owner: 'golang', repo: 'appengine' },
  };

  // Check exact match and prefix match (for sub-packages)
  for (const [prefix, gh] of Object.entries(known)) {
    if (name === prefix || name.startsWith(prefix + '/')) {
      return gh;
    }
  }

  return null;
}

/**
 * Follow the go-import meta tag to find the actual VCS location.
 * Short timeout to avoid eating the time budget.
 */
async function followGoImport(
  modulePath: string,
): Promise<{ owner: string; repo: string } | null> {
  // Only fetch the root of the module (first 3 path segments max)
  const parts = modulePath.split('/');
  const rootPath = parts.slice(0, Math.min(3, parts.length)).join('/');
  const url = `https://${rootPath}?go-get=1`;

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(2000), // 2s timeout as recommended
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Parse: <meta name="go-import" content="module/path vcs repo-url">
    const metaRe = /<meta\s+name="go-import"\s+content="([^"]+)"/i;
    const match = metaRe.exec(html);
    if (!match) return null;

    const [, importContent] = match;
    const [, vcs, repoUrl] = importContent.split(/\s+/);

    if (vcs !== 'git') return null;

    // Extract GitHub owner/repo from the repo URL
    const ghMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (ghMatch) {
      return { owner: ghMatch[1], repo: ghMatch[2] };
    }
  } catch {
    // Timeout, network error, etc.
  }

  return null;
}

// ---------------------------------------------------------------------------
// npm resolver
// ---------------------------------------------------------------------------

async function resolveNpm(dep: ParsedDep): Promise<ResolvedDep> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(dep.name)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return {
        ...dep,
        github: null,
        resolvedFrom: null,
        unresolvedReason: res.status === 404 ? 'package_not_found' : 'registry_error',
      };
    }

    const data = await res.json() as any;

    // Try repository.url field
    const repoUrl: string | undefined = data.repository?.url;
    if (repoUrl) {
      const gh = extractGitHub(repoUrl);
      if (gh) return { ...dep, github: gh, resolvedFrom: 'registry' };
    }

    // Try homepage
    const homepage: string | undefined = data.homepage;
    if (homepage) {
      const gh = extractGitHub(homepage);
      if (gh) return { ...dep, github: gh, resolvedFrom: 'registry' };
    }

    return { ...dep, github: null, resolvedFrom: null, unresolvedReason: 'no_github_repo' };
  } catch {
    return { ...dep, github: null, resolvedFrom: null, unresolvedReason: 'registry_timeout' };
  }
}

/** Extract GitHub owner/repo from various URL formats */
function extractGitHub(url: string): { owner: string; repo: string } | null {
  // Handles:
  //   https://github.com/owner/repo
  //   git+https://github.com/owner/repo.git
  //   git://github.com/owner/repo.git
  //   github:owner/repo
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.#]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}
