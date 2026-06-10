import { describe, expect, it } from 'vitest'

import { buildUsageEvent, classifyClient } from './usage'

describe('client attribution', () => {
  it('lets the explicit client header beat User-Agent classification', () => {
    const client = classifyClient({
      clientHeader: 'codex/1.2.3 (https://openai.com/codex)',
      userAgent: 'curl/8.4.0',
      source: 'api',
      oidcRepository: null,
    })

    expect(client).toEqual({
      family: 'agent',
      name: 'codex',
      version: '1.2.3',
      source: 'header',
      label: 'codex/1.2.3',
    })
  })

  it('classifies known agent and client user agents without storing raw values', () => {
    expect(classifyClient({
      clientHeader: null,
      userAgent: 'Claude-Code/0.9.0',
      source: 'api',
      oidcRepository: null,
    })).toMatchObject({ family: 'agent', name: 'claude-code', version: '0.9.0' })

    expect(classifyClient({
      clientHeader: null,
      userAgent: 'curl/8.7.1',
      source: 'api',
      oidcRepository: null,
    })).toMatchObject({ family: 'cli', name: 'curl', version: '8.7.1' })
  })

  it('normalizes malformed or overlong explicit headers to unknown', () => {
    expect(classifyClient({
      clientHeader: 'not/a valid/client/header',
      userAgent: 'Codex/1.0',
      source: 'api',
      oidcRepository: null,
    })).toMatchObject({ family: 'unknown', name: 'unknown', source: 'default' })

    expect(classifyClient({
      clientHeader: `codex/${'1'.repeat(200)}`,
      userAgent: 'Codex/1.0',
      source: 'api',
      oidcRepository: null,
    })).toMatchObject({ family: 'unknown', name: 'unknown', source: 'default' })
  })

  it('uses OIDC context to classify generic GitHub Actions calls as CI', () => {
    const client = classifyClient({
      clientHeader: null,
      userAgent: 'undici',
      source: 'audit',
      oidcRepository: 'owner/repo',
    })

    expect(client).toMatchObject({
      family: 'ci',
      name: 'github-actions',
      source: 'auth',
      label: 'github-actions',
    })
  })

  it('builds usage events with normalized client fields but no raw user agent', async () => {
    const event = await buildUsageEvent('Owner/Repo', 'github', 91, 'healthy', {
      source: 'api',
      apiKey: 'anon',
      cacheStatus: 'l3-miss',
      responseTimeMs: 34,
      userAgent: 'Codex/1.0 secret-token',
      clientHeader: null,
      ip: null,
    })

    expect(event.data.repo).toBe('owner/repo')
    expect(event.data.client_name).toBe('codex')
    expect(event.data.client_label).toBe('codex/1.0')
    expect(JSON.stringify(event.data)).not.toContain('secret-token')
  })
})
