#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const database = process.env.D1_MIGRATIONS_DATABASE || process.env.D1_DATABASE || 'isitalive-db'

const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'migrations', 'list', database, '--remote'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: process.env.CI || '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const output = `${result.stdout}\n${result.stderr}`

if (/No migrations to apply/i.test(output)) {
  console.log(`[deploy-preflight] Remote D1 database "${database}" has no pending migrations.`)
  process.exit(0)
}

const pending = [...output.matchAll(/│\s*([0-9]{4}_[^│\s]+\.sql)\s*│/g)].map((match) => match[1])

if (pending.length > 0 || /Migrations to be applied/i.test(output)) {
  const suffix = pending.length > 0 ? `: ${pending.join(', ')}` : '.'
  console.error(`[deploy-preflight] Remote D1 database "${database}" has pending migrations${suffix}`)
  console.error(`[deploy-preflight] Apply them before deploying: CI=1 npx wrangler d1 migrations apply ${database} --remote`)
  process.exit(1)
}

console.error('[deploy-preflight] Could not determine remote D1 migration status from Wrangler output.')
process.exit(1)
