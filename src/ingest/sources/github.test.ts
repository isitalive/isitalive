import { afterEach, describe, expect, it, vi } from 'vitest'
import { gitHubTrendingSource, parseGitHubTrendingRepos } from './github'
import type { Env } from '../../types/env'

function trendingArticle(repo: string): string {
  return `
    <article class="Box-row">
      <a href="/sponsors/${repo.split('/')[0]}" aria-label="Sponsor">Sponsor</a>
      <h2 class="h3 lh-condensed">
        <a data-hydro-click="{&quot;payload&quot;:{&quot;click_context&quot;:&quot;TRENDING_REPOSITORIES_PAGE&quot;,&quot;click_target&quot;:&quot;REPOSITORY&quot;}}" href="/${repo}" class="Link">
          ${repo}
        </a>
      </h2>
      <a class="d-inline-block" href="/some-contributor">Contributor</a>
      <a class="d-inline-block" href="/apps/dependabot">App</a>
    </article>
  `
}

describe('GitHub trending source', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses repo links from GitHub Trending article headings only', () => {
    const html = [
      '<a href="/features/copilot">Navigation</a>',
      trendingArticle('chopratejas/headroom'),
      trendingArticle('aquasecurity/trivy'),
      trendingArticle('aquasecurity/trivy'),
    ].join('\n')

    expect(parseGitHubTrendingRepos(html)).toEqual([
      'chopratejas/headroom',
      'aquasecurity/trivy',
    ])
  })

  it('uses the actual trending page before the search fallback', async () => {
    const repos = [
      'one/repo',
      'two/repo',
      'three/repo',
      'four/repo',
      'five/repo',
    ]
    const fetchMock = vi.fn(async () => new Response(repos.map(trendingArticle).join('\n')))
    vi.stubGlobal('fetch', fetchMock)

    await expect(gitHubTrendingSource.getRepos({} as Env)).resolves.toEqual(repos)
    expect(fetchMock).toHaveBeenCalledOnce()
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?]
    expect(String(firstCall[0])).toBe('https://github.com/trending?since=daily')
  })

  it('falls back to new popular repository search when trending page parsing fails', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.headers && (init.headers as Record<string, string>).Accept === 'text/html') {
        return new Response('<html>No repos today</html>')
      }

      return Response.json({
        items: [
          { full_name: 'fallback/one' },
          { full_name: 'fallback/two' },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(gitHubTrendingSource.getRepos({ GITHUB_TOKEN: 'gh-token' } as Env)).resolves.toEqual([
      'fallback/one',
      'fallback/two',
    ])

    const searchCall = fetchMock.mock.calls[1]
    expect(String(searchCall[0])).toContain('https://api.github.com/search/repositories')
    expect(searchCall[1]?.headers).toMatchObject({
      Authorization: 'Bearer gh-token',
    })
  })
})
