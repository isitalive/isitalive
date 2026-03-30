import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubProvider } from './github'

function makeGraphqlResponse(hasCi = true) {
  return {
    data: {
      repository: {
        name: 'next.js',
        owner: { login: 'vercel' },
        description: 'Next.js',
        isArchived: false,
        stargazerCount: 1,
        forkCount: 1,
        homepageUrl: null,
        licenseInfo: { spdxId: 'MIT', name: 'MIT' },
        primaryLanguage: { name: 'TypeScript', color: '#3178c6' },
        defaultBranchRef: {
          name: 'main',
          target: {
            history: { nodes: [{ committedDate: '2026-03-01T00:00:00.000Z' }] },
            recentHistory: {
              nodes: [{ committedDate: '2026-03-01T00:00:00.000Z', author: { user: { login: 'dev' } } }],
            },
          },
        },
        releases: { nodes: [{ publishedAt: '2026-03-01T00:00:00.000Z', tagName: 'v1.0.0' }] },
        issues: { totalCount: 1, nodes: [{ createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-02T00:00:00.000Z', comments: { nodes: [] } }] },
        closedIssues: { totalCount: 1 },
        pullRequests: { totalCount: 1, nodes: [{ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z' }] },
        ciCheck: hasCi ? { __typename: 'Tree' } : null,
      },
    },
  }
}

describe('GitHubProvider timeouts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails fast when the main GraphQL request times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError')
    }))

    const provider = new GitHubProvider()

    await expect(provider.fetchProject('vercel', 'next.js', 'gh-token')).rejects.toThrow(
      'GitHub GraphQL request timed out after 5000ms',
    )
  })

  it('falls back to CI presence when the Actions runs lookup times out', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(makeGraphqlResponse()), { status: 200 }))
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new GitHubProvider()
    const result = await provider.fetchProject('vercel', 'next.js', 'gh-token')

    expect(result.hasCi).toBe(true)
    expect(result.ciRunCount).toBe(0)
    expect(result.lastCiRunDate).toBeNull()
    expect(result.ciRunSuccessRate).toBeNull()
    expect(result.ciDataSource).toBe('actions-runs-unavailable')
    expect(result.issueSampleSize).toBe(1)
    expect(result.prSampleSize).toBe(1)
    expect(result.contributorCommitSampleSize).toBe(1)
  })

  it('measures PR responsiveness from updatedAt rather than createdAt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/actions/runs')) {
        return new Response(JSON.stringify({ total_count: 1, workflow_runs: [] }), { status: 200 })
      }
      return new Response(JSON.stringify(makeGraphqlResponse()), { status: 200 })
    }))

    const provider = new GitHubProvider()
    const result = await provider.fetchProject('vercel', 'next.js', 'gh-token')

    expect(result.prResponsivenessMedianDays).toBeLessThan(40)
    expect(result.prSamplingStrategy).toContain('recently updated')
  })
})
