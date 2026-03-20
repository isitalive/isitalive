import type { Env } from '../../scoring/types';
import type { IngestSource } from '../types';

const R2_SQL_ENDPOINT = 'https://api.sql.cloudflarestorage.com/api/v1/accounts';
const SNAPSHOT_MAX_REPOS = 200;

export const r2SqlSource: IngestSource = {
  name: 'R2 SQL Tracker',
  async getRepos(env: Env): Promise<string[]> {
    if (!env.CF_ACCOUNT_ID || !env.CF_R2_SQL_TOKEN) {
      console.warn('R2 SQL Source: Missing credentials');
      return [];
    }

    const sql = `
      SELECT repo, count(*) as checkCount
      FROM default.checks
      GROUP BY repo
      ORDER BY count(*) DESC
      LIMIT ${SNAPSHOT_MAX_REPOS}
    `;

    const bucketName = 'isitalive-data';
    const res = await fetch(
      `${R2_SQL_ENDPOINT}/${env.CF_ACCOUNT_ID}/r2-sql/query/${bucketName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_R2_SQL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      },
    );

    if (!res.ok) {
      console.error(`R2 SQL Source: API error ${res.status}`);
      return [];
    }

    const json = await res.json() as any;
    const rows = json.result?.rows ?? [];
    return rows.map((row: any) => row.repo as string);
  }
};
