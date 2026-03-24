// ---------------------------------------------------------------------------
// Backfill Workflow — Migrate old JSON-blob events to flattened schema
//
// Reads provider_events (raw_json) and result_events (signals_json) from
// R2 SQL, parses the JSON blobs, and re-emits them as flattened events
// to the new pipeline schemas.
//
// Triggered manually via admin route: POST /admin/backfill
// ---------------------------------------------------------------------------

import {
  WorkflowEntrypoint,
  WorkflowStep,
} from 'cloudflare:workers'
import type { WorkflowEvent } from 'cloudflare:workers'

import type { Env } from '../scoring/types'
import { queryR2SQL } from '../admin/r2sql'

type BackfillParams = {
  tables: ('provider' | 'result')[]
  batchSize?: number
}

export class BackfillWorkflow extends WorkflowEntrypoint<Env, BackfillParams> {
  async run(event: WorkflowEvent<BackfillParams>, step: WorkflowStep) {
    const tables = event.payload.tables ?? ['provider', 'result']
    const batchSize = event.payload.batchSize ?? 500

    const stats = { provider: 0, result: 0 }

    // ── Provider Events ──────────────────────────────────────────────
    if (tables.includes('provider')) {
      stats.provider = await this.backfillProvider(step, batchSize)
    }

    // ── Result Events ────────────────────────────────────────────────
    if (tables.includes('result')) {
      stats.result = await this.backfillResult(step, batchSize)
    }

    return {
      success: true,
      message: `Backfill complete: ${stats.provider} provider + ${stats.result} result events migrated`,
      ...stats,
    }
  }

  private async backfillProvider(step: WorkflowStep, batchSize: number): Promise<number> {
    let totalMigrated = 0
    let cursor = '1970-01-01T00:00:00Z'
    let batchNum = 0

    while (true) {
      batchNum++

      const rows = await step.do(
        `provider-read-${batchNum}`,
        { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } },
        async () => {
          const result = await queryR2SQL(
            this.env,
            `SELECT id, timestamp, provider, owner, repo, raw_json
             FROM provider_events
             WHERE timestamp > '${cursor}'
             ORDER BY timestamp ASC
             LIMIT ${batchSize}`,
          )

          if (result.error) {
            throw new Error(`R2 SQL error: ${result.error}`)
          }

          return result.rows.map(row => ({
            id: row[0] as string,
            timestamp: row[1] as string,
            provider: row[2] as string,
            owner: row[3] as string,
            repo: row[4] as string,
            raw_json: row[5] as string,
          }))
        },
      )

      if (rows.length === 0) break

      // Transform and send to new pipeline
      const migrated = await step.do(
        `provider-write-${batchNum}`,
        { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } },
        async () => {
          const flatEvents: Record<string, unknown>[] = []

          for (const row of rows) {
            try {
              const data = JSON.parse(row.raw_json)
              flatEvents.push({
                domain: 'provider',
                id: row.id,
                timestamp: row.timestamp,
                provider: row.provider,
                owner: row.owner,
                repo: row.repo,
                archived: data.archived ?? false,
                description: data.description ?? null,
                stars: data.stars ?? 0,
                forks: data.forks ?? 0,
                default_branch: data.defaultBranch ?? data.default_branch ?? null,
                license: data.license ?? null,
                homepage_url: data.homepageUrl ?? data.homepage_url ?? null,
                language: data.language ?? null,
                language_color: data.languageColor ?? data.language_color ?? null,
                last_commit_date: data.lastCommitDate ?? data.last_commit_date ?? null,
                last_release_date: data.lastReleaseDate ?? data.last_release_date ?? null,
                issue_staleness_median_days: data.issueStalenessMedianDays ?? data.issue_staleness_median_days ?? null,
                pr_responsiveness_median_days: data.prResponsivenessMedianDays ?? data.pr_responsiveness_median_days ?? null,
                open_issue_count: data.openIssueCount ?? data.open_issue_count ?? 0,
                closed_issue_count: data.closedIssueCount ?? data.closed_issue_count ?? 0,
                open_pr_count: data.openPrCount ?? data.open_pr_count ?? 0,
                recent_contributor_count: data.recentContributorCount ?? data.recent_contributor_count ?? 0,
                top_contributor_commit_share: data.topContributorCommitShare ?? data.top_contributor_commit_share ?? 0,
                has_ci: data.hasCi ?? data.has_ci ?? false,
                last_ci_run_date: data.lastCiRunDate ?? data.last_ci_run_date ?? null,
                ci_run_success_rate: data.ciRunSuccessRate ?? data.ci_run_success_rate ?? null,
                ci_run_count: data.ciRunCount ?? data.ci_run_count ?? 0,
              })
            } catch {
              console.warn(`Backfill: skipping provider row ${row.id} — invalid JSON`)
            }
          }

          if (flatEvents.length > 0) {
            await this.env.PROVIDER_PIPELINE.send(flatEvents)
          }

          return flatEvents.length
        },
      )

      totalMigrated += migrated
      cursor = rows[rows.length - 1].timestamp
      console.log(`Backfill: provider batch ${batchNum} — ${migrated} events (total: ${totalMigrated})`)

      if (rows.length < batchSize) break

      await step.sleep(`provider-pause-${batchNum}`, '1 second')
    }

    console.log(`Backfill: provider complete — ${totalMigrated} events migrated`)
    return totalMigrated
  }

  private async backfillResult(step: WorkflowStep, batchSize: number): Promise<number> {
    let totalMigrated = 0
    let cursor = '1970-01-01T00:00:00Z'
    let batchNum = 0

    while (true) {
      batchNum++

      const rows = await step.do(
        `result-read-${batchNum}`,
        { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } },
        async () => {
          const result = await queryR2SQL(
            this.env,
            `SELECT id, timestamp, project, score, verdict, source, signals_json
             FROM result_events
             WHERE timestamp > '${cursor}'
             ORDER BY timestamp ASC
             LIMIT ${batchSize}`,
          )

          if (result.error) {
            throw new Error(`R2 SQL error: ${result.error}`)
          }

          return result.rows.map(row => ({
            id: row[0] as string,
            timestamp: row[1] as string,
            project: row[2] as string,
            score: row[3] as number,
            verdict: row[4] as string,
            source: row[5] as string,
            signals_json: row[6] as string,
          }))
        },
      )

      if (rows.length === 0) break

      // Transform and send to new pipeline
      const migrated = await step.do(
        `result-write-${batchNum}`,
        { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } },
        async () => {
          const flatEvents: Record<string, unknown>[] = []

          for (const row of rows) {
            try {
              const signals = JSON.parse(row.signals_json) as Array<{
                name: string
                score: number
                value: string | number
              }>

              const signalMap = new Map(signals.map(s => [s.name, s]))
              const get = (name: string) => {
                const s = signalMap.get(name)
                return s
                  ? { score: s.score, value: String(s.value) }
                  : { score: null, value: null }
              }

              flatEvents.push({
                domain: 'result',
                id: row.id,
                timestamp: row.timestamp,
                project: row.project,
                score: row.score,
                verdict: row.verdict,
                source: row.source,
                signal_last_commit_score: get('lastCommit').score,
                signal_last_commit_value: get('lastCommit').value,
                signal_last_release_score: get('lastRelease').score,
                signal_last_release_value: get('lastRelease').value,
                signal_issue_staleness_score: get('issueStaleness').score,
                signal_issue_staleness_value: get('issueStaleness').value,
                signal_pr_responsiveness_score: get('prResponsiveness').score,
                signal_pr_responsiveness_value: get('prResponsiveness').value,
                signal_recent_contributors_score: get('recentContributors').score,
                signal_recent_contributors_value: get('recentContributors').value,
                signal_stars_score: get('starsTrend').score,
                signal_stars_value: get('starsTrend').value,
                signal_ci_score: get('ciActivity').score,
                signal_ci_value: get('ciActivity').value,
                signal_bus_factor_score: get('busFactor').score,
                signal_bus_factor_value: get('busFactor').value,
              })
            } catch {
              console.warn(`Backfill: skipping result row ${row.id} — invalid JSON`)
            }
          }

          if (flatEvents.length > 0) {
            await this.env.RESULT_PIPELINE.send(flatEvents)
          }

          return flatEvents.length
        },
      )

      totalMigrated += migrated
      cursor = rows[rows.length - 1].timestamp
      console.log(`Backfill: result batch ${batchNum} — ${migrated} events (total: ${totalMigrated})`)

      if (rows.length < batchSize) break

      await step.sleep(`result-pause-${batchNum}`, '1 second')
    }

    console.log(`Backfill: result complete — ${totalMigrated} events migrated`)
    return totalMigrated
  }
}
