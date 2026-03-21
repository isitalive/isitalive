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
import type { ApiKeyEntry } from '../scoring/types'

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

  if (!input || input !== secret) {
    return c.html(adminLoginPage('Invalid secret. Please try again.'), 401)
  }

  // Valid — create session
  const session = await createSession(secret)
  c.header('Set-Cookie', sessionCookieHeader(session.cookie, session.maxAge))
  return c.redirect('/admin')
})

admin.get('/auth/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookieHeader())
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
  const tier = (body['tier'] as string || 'free') as ApiKeyEntry['tier']

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
      return c.json({ error: 'SQL query is required', columns: [], rows: [], rowCount: 0, timing: 0 })
    }

    const result = await queryR2SQL(c.env, sql)
    return c.json(result)
  } catch (err: any) {
    return c.json({ error: `Invalid request: ${err.message}`, columns: [], rows: [], rowCount: 0, timing: 0 }, 400)
  }
})

export { admin }
