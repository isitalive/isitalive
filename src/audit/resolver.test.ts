import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../types/env'
import { resolvePackageDependency } from './packages'
import { extractGitHub, resolveGopkgIn, resolveGoogleGolang } from './resolver'

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── extractGitHub ──────────────────────────────────────────────────────
describe('extractGitHub', () => {
  it('extracts from https URL', () => {
    expect(extractGitHub('https://github.com/vercel/next.js'))
      .toEqual({ owner: 'vercel', repo: 'next.js' })
  })

  it('extracts from git+https URL', () => {
    expect(extractGitHub('git+https://github.com/lodash/lodash.git'))
      .toEqual({ owner: 'lodash', repo: 'lodash' })
  })

  it('extracts from git:// URL', () => {
    expect(extractGitHub('git://github.com/user/repo.git'))
      .toEqual({ owner: 'user', repo: 'repo' })
  })

  it('returns null for github: shorthand (not supported)', () => {
    // extractGitHub only handles github.com URLs, not npm-style github: shorthand
    expect(extractGitHub('github:owner/repo')).toBeNull()
  })

  it('strips .git suffix but preserves .js in repo name', () => {
    expect(extractGitHub('https://github.com/vercel/next.js.git'))
      .toEqual({ owner: 'vercel', repo: 'next.js' })
  })

  it('handles URL with fragments or paths', () => {
    expect(extractGitHub('https://github.com/owner/repo#readme'))
      .toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('returns null for non-GitHub URLs', () => {
    expect(extractGitHub('https://gitlab.com/owner/repo')).toBeNull()
    expect(extractGitHub('https://bitbucket.org/owner/repo')).toBeNull()
  })

  it('returns null for malformed URLs', () => {
    expect(extractGitHub('not-a-url')).toBeNull()
    expect(extractGitHub('')).toBeNull()
  })

  it('handles ssh-style github URLs with colon', () => {
    expect(extractGitHub('git@github.com:owner/repo.git'))
      .toEqual({ owner: 'owner', repo: 'repo' })
  })
})

// ── resolveGopkgIn ─────────────────────────────────────────────────────
describe('resolveGopkgIn', () => {
  it('resolves gopkg.in/owner/repo.vN', () => {
    expect(resolveGopkgIn('gopkg.in/yaml.v3'))
      .toEqual({ owner: 'go-yaml', repo: 'yaml' })
  })

  it('resolves gopkg.in/owner/repo.vN (two-part)', () => {
    expect(resolveGopkgIn('gopkg.in/go-playground/validator.v9'))
      .toEqual({ owner: 'go-playground', repo: 'validator' })
  })

  it('resolves single-segment to go-{repo}/{repo}', () => {
    expect(resolveGopkgIn('gopkg.in/check.v1'))
      .toEqual({ owner: 'go-check', repo: 'check' })
  })

  it('handles trailing slash as a single empty-segment', () => {
    // gopkg.in/ → single segment '' → {owner: 'go-', repo: ''}
    // Not a real-world input, but the function doesn't guard against it
    const result = resolveGopkgIn('gopkg.in/')
    expect(result).toEqual({ owner: 'go-', repo: '' })
  })
})

// ── resolveGoogleGolang ────────────────────────────────────────────────
describe('resolveGoogleGolang', () => {
  it('resolves google.golang.org/grpc', () => {
    expect(resolveGoogleGolang('google.golang.org/grpc'))
      .toEqual({ owner: 'grpc', repo: 'grpc-go' })
  })

  it('resolves google.golang.org/protobuf', () => {
    expect(resolveGoogleGolang('google.golang.org/protobuf'))
      .toEqual({ owner: 'protocolbuffers', repo: 'protobuf-go' })
  })

  it('resolves google.golang.org/genproto', () => {
    expect(resolveGoogleGolang('google.golang.org/genproto'))
      .toEqual({ owner: 'googleapis', repo: 'go-genproto' })
  })

  it('resolves google.golang.org/api', () => {
    expect(resolveGoogleGolang('google.golang.org/api'))
      .toEqual({ owner: 'googleapis', repo: 'google-api-go-client' })
  })

  it('resolves google.golang.org/appengine', () => {
    expect(resolveGoogleGolang('google.golang.org/appengine'))
      .toEqual({ owner: 'golang', repo: 'appengine' })
  })

  it('resolves sub-packages of known modules', () => {
    expect(resolveGoogleGolang('google.golang.org/grpc/codes'))
      .toEqual({ owner: 'grpc', repo: 'grpc-go' })
  })

  it('resolves sub-packages of genproto', () => {
    expect(resolveGoogleGolang('google.golang.org/genproto/googleapis/rpc'))
      .toEqual({ owner: 'googleapis', repo: 'go-genproto' })
  })

  it('returns null for unknown google.golang.org packages', () => {
    expect(resolveGoogleGolang('google.golang.org/unknown')).toBeNull()
  })

  it('returns null for non-google.golang.org paths', () => {
    expect(resolveGoogleGolang('golang.org/x/text')).toBeNull()
  })
})

describe('resolvePackageDependency', () => {
  it('resolves npm packages from registry repository metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      repository: { url: 'git+https://github.com/facebook/react.git' },
    })))

    const result = await resolvePackageDependency('npm', 'react', {} as Env)

    expect(result.package).toEqual({ ecosystem: 'npm', name: 'react', version: '' })
    expect(result.resolved.github).toEqual({ owner: 'facebook', repo: 'react' })
    expect(result.resolved.resolvedFrom).toBe('registry')
  })

  it('continues resolving when resolver cache reads and writes fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      repository: { url: 'https://github.com/facebook/react.git' },
    })))
    const env = {
      CACHE_KV: {
        get: vi.fn(async () => {
          throw new Error('cache unavailable')
        }),
        put: vi.fn(async () => {
          throw new Error('cache unavailable')
        }),
      },
    } as unknown as Env

    const result = await resolvePackageDependency('npm', 'react', env)

    expect(result.resolved.github).toEqual({ owner: 'facebook', repo: 'react' })
    expect(result.resolved.resolvedFrom).toBe('registry')
  })

  it('resolves @types packages directly to DefinitelyTyped', async () => {
    const result = await resolvePackageDependency('npm', '@types/node', {} as Env)

    expect(result.resolved.github).toEqual({ owner: 'DefinitelyTyped', repo: 'DefinitelyTyped' })
    expect(result.resolved.resolvedFrom).toBe('direct')
  })

  it('resolves direct GitHub Go module paths', async () => {
    const result = await resolvePackageDependency('go', 'github.com/zitadel/zitadel', {} as Env)

    expect(result.resolved.github).toEqual({ owner: 'zitadel', repo: 'zitadel' })
    expect(result.resolved.resolvedFrom).toBe('direct')
  })

  it('resolves golang.org/x Go modules through known vanity mapping', async () => {
    const result = await resolvePackageDependency('go', 'golang.org/x/crypto', {} as Env)

    expect(result.resolved.github).toEqual({ owner: 'golang', repo: 'crypto' })
    expect(result.resolved.resolvedFrom).toBe('vanity')
  })

  it('resolves google.golang.org modules through known vanity mapping', async () => {
    const result = await resolvePackageDependency('go', 'google.golang.org/grpc/codes', {} as Env)

    expect(result.resolved.github).toEqual({ owner: 'grpc', repo: 'grpc-go' })
    expect(result.resolved.resolvedFrom).toBe('vanity')
  })

  it('marks unresolved packages with stable reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))

    const result = await resolvePackageDependency('npm', 'missing-package', {} as Env)

    expect(result.resolved.github).toBeNull()
    expect(result.resolved.unresolvedReason).toBe('package_not_found')
  })
})
