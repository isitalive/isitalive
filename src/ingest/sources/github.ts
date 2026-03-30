import type { Env } from '../../types/env';
import type { IngestSource } from '../types';

export const gitHubTrendingSource: IngestSource = {
  name: 'GitHub Trending (New)',
  async getRepos(env: Env): Promise<string[]> {
    // Top 25 repos created in the last 7 days, sorted by stars
    const lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const query = encodeURIComponent(`created:>${lastWeek}`);
    const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=25`;

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'isitalive-cron/1.0',
      };
      
      if (env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${env.GITHUB_TOKEN}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`GitHub Source: Search API error ${res.status}`);
        return [];
      }

      const data = await res.json() as any;
      const items = data.items || [];
      return items.map((item: any) => item.full_name as string);
    } catch (err) {
      console.error('GitHub Source: Failed to fetch trending:', err);
      return [];
    }
  }
};
