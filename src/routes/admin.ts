// ---------------------------------------------------------------------------
// Admin routes — protected route group for the admin dashboard
//
// All routes (except login/logout) are guarded by adminAuth middleware.
// Mounts under /admin in app.ts.
// ---------------------------------------------------------------------------

import { Hono } from 'hono'
import type { Env } from '../scoring/types'
import { adminAuth, createSession, sessionCookieHeader, clearSessionCookieHeader } from '../middleware/admin-auth'
import { getAdminOverview, KVKeyStore } from '../admin/data'
import { queryR2SQL } from '../admin/r2sql'
import { adminLoginPage } from '../ui/admin-login'
import { adminOverviewPage } from '../ui/admin-overview'
import { adminKeysPage } from '../ui/admin-keys'
import { adminQueryPage } from '../ui/admin-query'
import { adminJobsPage } from '../ui/admin-jobs'
import { handleScheduled } from '../cron/handler'
import type { ApiKeyEntry } from '../scoring/types'

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a)
  const bBuf = encoder.encode(b)
  let result = 0
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i]
  }
  return result === 0
}

const admin = new Hono<{ Bindings: Env }>()

// ── Auth routes (unguarded) ─────────────────────────────────────────────────

admin.get('/auth/login', (c) => {
  return c.html(adminLoginPage())
})

admin.post('/auth/login', async (c) => {
  const secret = c.env.ADMIN_SECRET
  if (!secret) {
    return c.html(adminLoginPage('Admin section is not configured.'), 503)
  }

  const body = await c.req.parseBody()
  const input = (body['secret'] as string || '').trim()

  // Constant-time comparison to prevent timing attacks
  if (!input || input.length !== secret.length || !timingSafeEqual(input, secret)) {
    return c.html(adminLoginPage('Invalid secret. Please try again.'), 401)
  }

  // Valid — create session
  const isSecure = new URL(c.req.url).protocol === 'https:'
  const session = await createSession(secret)
  c.header('Set-Cookie', sessionCookieHeader(session.cookie, session.maxAge, isSecure))
  return c.redirect('/admin')
})

admin.get('/auth/logout', (c) => {
  const isSecure = new URL(c.req.url).protocol === 'https:'
  c.header('Set-Cookie', clearSessionCookieHeader(isSecure))
  return c.redirect('/admin/auth/login')
})

// ── Guarded routes ──────────────────────────────────────────────────────────

admin.use('/*', async (c, next) => {
  // Skip auth for /auth/* routes
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/admin/auth/')) {
    return next()
  }
  return adminAuth(c, next)
})

// Overview dashboard
admin.get('/', async (c) => {
  const overview = await getAdminOverview(c.env)
  return c.html(adminOverviewPage(overview))
})

// Manual cron trigger — force refresh trending/tracked/sitemap from Iceberg
admin.post('/api/cron', async (c) => {
  const result = await handleScheduled(c.env)
  return c.json(result)
})

// Dispatch ingest workflow
admin.post('/api/ingest', async (c) => {
  try {
    const instance = await c.env.INGEST_WORKFLOW.create({ params: { trigger: 'daily' as const } })
    return c.json({ ok: true, instanceId: instance.id })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})

// Dispatch refresh workflow
admin.post('/api/refresh', async (c) => {
  try {
    const instance = await c.env.REFRESH_WORKFLOW.create()
    return c.json({ ok: true, instanceId: instance.id })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})

// Jobs page
admin.get('/jobs', (c) => {
  return c.html(adminJobsPage())
})

// API Keys page
admin.get('/keys', async (c) => {
  const store = new KVKeyStore(c.env.KEYS_KV)
  const keys = await store.list()
  return c.html(adminKeysPage(keys))
})

// Create API key
admin.post('/api/keys', async (c) => {
  const body = await c.req.parseBody()
  const name = (body['name'] as string || '').trim()
  const rawTier = ((body['tier'] as string) || 'free').trim()
  const allowedTiers: ApiKeyEntry['tier'][] = ['free', 'pro', 'enterprise']
  const tier: ApiKeyEntry['tier'] = allowedTiers.includes(rawTier as ApiKeyEntry['tier'])
    ? (rawTier as ApiKeyEntry['tier'])
    : 'free'

  if (!name) {
    const store = new KVKeyStore(c.env.KEYS_KV)
    const keys = await store.list()
    return c.html(adminKeysPage(keys, { type: 'error', message: 'Key name is required.' }))
  }

  const store = new KVKeyStore(c.env.KEYS_KV)
  const { key } = await store.create(name, tier)
  const keys = await store.list()

  return c.html(adminKeysPage(keys, {
    type: 'success',
    message: `Key "${name}" created successfully.`,
    key,
  }))
})

// Revoke API key
admin.post('/api/keys/:keyId/revoke', async (c) => {
  const keyId = c.req.param('keyId')
  const store = new KVKeyStore(c.env.KEYS_KV)

  const success = await store.revoke(keyId)
  const keys = await store.list()

  if (success) {
    return c.html(adminKeysPage(keys, { type: 'success', message: 'Key revoked.' }))
  }

  return c.html(adminKeysPage(keys, { type: 'error', message: 'Key not found.' }))
})

// R2 SQL Query Console page
admin.get('/query', (c) => {
  return c.html(adminQueryPage())
})

// R2 SQL Query API
admin.post('/api/query', async (c) => {
  try {
    const body = await c.req.json() as { sql?: string }
    const sql = (body.sql || '').trim()

    if (!sql) {
      return c.json({ error: 'SQL query is required', columns: [], rows: [], rowCount: 0, timing: 0 }, 400)
    }

    const result = await queryR2SQL(c.env, sql)
    return c.json(result)
  } catch (err: any) {
    return c.json({ error: `Invalid request: ${err.message}`, columns: [], rows: [], rowCount: 0, timing: 0 }, 400)
  }
})

export { admin }
