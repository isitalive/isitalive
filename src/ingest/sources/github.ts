import type { Env } from '../../types/env'
import type { IngestSource } from '../types'

const TRENDING_URL = 'https://github.com/trending?since=daily'
const SEARCH_FALLBACK_PER_PAGE = 25
const MIN_TRENDING_PAGE_REPOS = 5
const REPO_SEGMENT_RE = /^[A-Za-z0-9_.-]+$/

function cleanRepoSlug(path: string): string | null {
  const [owner, repo, extra] = path.replace(/^\/+/, '').split('/')
  if (!owner || !repo || extra) return null
  if (!REPO_SEGMENT_RE.test(owner) || !REPO_SEGMENT_RE.test(repo)) return null
  return `${owner}/${repo}`
}

function pushUnique(repos: string[], seen: Set<string>, candidate: string | null) {
  if (!candidate) return
  const key = candidate.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  repos.push(candidate)
}

export function parseGitHubTrendingRepos(html: string): string[] {
  const repos: string[] = []
  const seen = new Set<string>()
  const articleRe = /<article\b[^>]*class="[^"]*\bBox-row\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi

  for (const articleMatch of html.matchAll(articleRe)) {
    const article = articleMatch[1]
    const heading = article.match(/<h2\b[^>]*class="[^"]*\blh-condensed\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
    if (!heading) continue

    const link = heading[1].match(/<a\b[^>]*href="\/([^"?#]+\/[^"?#]+)"[^>]*>/i)
    pushUnique(repos, seen, link ? cleanRepoSlug(link[1]) : null)
  }

  return repos
}

async function fetchTrendingPageRepos(): Promise<string[]> {
  const res = await fetch(TRENDING_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'isitalive-cron/1.0',
    },
  })

  if (!res.ok) {
    console.error(`GitHub Source: Trending page error ${res.status}`)
    return []
  }

  return parseGitHubTrendingRepos(await res.text())
}

async function fetchNewPopularRepos(env: Env): Promise<string[]> {
  const lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const query = encodeURIComponent(`created:>${lastWeek}`)
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${SEARCH_FALLBACK_PER_PAGE}`

  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'isitalive-cron/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    if (env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
    }

    const res = await fetch(url, { headers })
    if (!res.ok) {
      console.error(`GitHub Source: Search API error ${res.status}`)
      return []
    }

    const data = await res.json() as { items?: Array<{ full_name?: string }> }
    return (data.items ?? [])
      .map((item) => item.full_name)
      .filter((fullName): fullName is string => typeof fullName === 'string')
  } catch (err) {
    console.error('GitHub Source: Failed to fetch search fallback:', err)
    return []
  }
}

export const gitHubTrendingSource: IngestSource = {
  name: 'GitHub Trending',
  async getRepos(env: Env): Promise<string[]> {
    try {
      const trendingRepos = await fetchTrendingPageRepos()
      if (trendingRepos.length >= MIN_TRENDING_PAGE_REPOS) {
        return trendingRepos.slice(0, SEARCH_FALLBACK_PER_PAGE)
      }

      const fallbackRepos = await fetchNewPopularRepos(env)
      const repos: string[] = []
      const seen = new Set<string>()
      for (const repo of [...trendingRepos, ...fallbackRepos]) {
        pushUnique(repos, seen, cleanRepoSlug(repo))
      }
      return repos.slice(0, SEARCH_FALLBACK_PER_PAGE)
    } catch (err) {
      console.error('GitHub Source: Failed to fetch trending:', err)
      return fetchNewPopularRepos(env)
    }
  },
}
