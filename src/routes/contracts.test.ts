/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openApiSpec } from './openapi'
import { llmsFullTxt, llmsTxt } from './llms'
import { apiDocsPage } from '../ui/api-docs'
import { landingPage } from '../ui/landing'
import { methodologyPage } from '../ui/methodology'
import { aiPluginManifest } from './aiPlugin'
import { CACHE_STATUS_DEFINITIONS, METHODOLOGY, SIGNAL_DEFINITIONS } from '../scoring/methodology'

describe('agent contract alignment', () => {
  const agentsMd = readFileSync(resolve(process.cwd(), 'AGENTS.md'), 'utf8')

  it('keeps OpenAPI signal enums aligned with methodology definitions', () => {
    const signalEnum = openApiSpec.components.schemas.Signal.properties.name.enum
    expect(signalEnum).toEqual(SIGNAL_DEFINITIONS.map((signal) => signal.name))
  })

  it('keeps OpenAPI cache status enums aligned with methodology definitions', () => {
    const cacheEnum = openApiSpec.components.schemas.CacheMetadata.properties.status.enum
    expect(cacheEnum).toEqual(CACHE_STATUS_DEFINITIONS.map((status) => status.name))
  })

  it('publishes the methodology version and canonical signal names in llms.txt', () => {
    expect(llmsTxt).toContain(METHODOLOGY.version)
    expect(llmsTxt).toContain('before choosing dependencies')
    expect(llmsTxt).toContain('not a security, license, or compliance verdict')
    for (const signal of SIGNAL_DEFINITIONS) {
      expect(llmsTxt).toContain(signal.name)
    }
    for (const status of CACHE_STATUS_DEFINITIONS) {
      expect(llmsTxt).toContain(status.name)
    }
  })

  it('renders the methodology page from the shared definitions', () => {
    const html = methodologyPage()
    for (const signal of SIGNAL_DEFINITIONS) {
      expect(html).toContain(signal.label)
      expect(html).toContain(`${signal.weight * 100}%`)
    }
    expect(html).toContain('2 days')
    expect(html).toContain('maintenance-health')
  })

  it('keeps the public docs pages aligned with the live wire contract', () => {
    const apiDocs = apiDocsPage()
    expect(apiDocs).toContain('maintenance-health')
    expect(apiDocs).toContain('before recommending, adding, or automating a dependency')
    expect(apiDocs).toContain('not a security, license, or compliance verdict')
    expect(apiDocs).toContain('"lastCommit"')
    expect(apiDocs).toContain('l2-hit')
    expect(apiDocs).toContain('free to use')
    expect(apiDocs).toContain('5 req/min')
    expect(apiDocs).toContain('50 req/min')
    expect(apiDocs).toContain('/api/resolve/{ecosystem}')
    expect(apiDocs).toContain('/api/check/package/{ecosystem}')
    expect(apiDocs).toContain('package-lock.json')
    expect(apiDocs).toContain('pnpm-lock.yaml')
    expect(apiDocs).toContain('yarn.lock')
    expect(apiDocs).toContain('go.sum')
    expect(apiDocs).toContain('isitalive scan')
    expect(apiDocs).not.toContain('"last_commit"')
    expect(apiDocs).not.toContain('free beta')
    expect(apiDocs).not.toContain('1,000 req/min')
    expect(apiDocs).not.toContain('/pricing')
    expect(apiDocs).not.toContain('Pro API key')
    expect(apiDocs).not.toContain('Enterprise API key')

    const landing = landingPage()
    const removedFreeKicker = ['Free', 'to use today'].join(' ')
    const removedFreeHeading = ['IsItAlive is free to use', 'for public maintenance-health checks'].join(' ')
    expect(landing).toContain('maintenance-health')
    expect(landing).toContain("Don't let your agent install dead dependencies")
    expect(landing).toContain('Package-first resolve and check endpoints')
    expect(landing).toContain('isitalive scan')
    expect(landing).toContain('Use it where dependencies enter your workflow')
    expect(landing).not.toContain(removedFreeKicker)
    expect(landing).not.toContain(removedFreeHeading)
    expect(landing).not.toContain('free beta')
    expect(landing).not.toContain('safe to depend on')
    expect(landing).not.toContain('Does this project look maintained')

    expect(openApiSpec.info.description).toContain('before humans or AI agents choose a dependency')
    expect(openApiSpec.info.description).toContain('free to use for public maintenance-health checks')
    expect(openApiSpec.info.description).toContain('not a security, license, or compliance verdict')
    expect(openApiSpec.paths['/api/resolve/{ecosystem}'].get.operationId).toBe('resolvePackage')
    expect(openApiSpec.paths['/api/check/package/{ecosystem}'].get.operationId).toBe('checkPackage')
    expect(openApiSpec.components.schemas.AuditRequest.properties.format.enum).toEqual([
      'go.mod',
      'go.sum',
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ])
    expect(JSON.stringify(openApiSpec)).not.toContain('free beta')
    expect(JSON.stringify(openApiSpec)).not.toContain('/pricing')
    expect(JSON.stringify(openApiSpec)).not.toContain('"pro"')
    expect(JSON.stringify(openApiSpec)).not.toContain('"enterprise"')
    expect(llmsTxt).not.toContain('/pricing')
    expect(llmsTxt).not.toContain('free beta')
    expect(llmsTxt).not.toContain('Tier-based')
    expect(llmsTxt).toContain('/api/resolve/{ecosystem}')
    expect(llmsTxt).toContain('/api/check/package/{ecosystem}')
    expect(llmsTxt).toContain('package-lock.json')
    expect(llmsFullTxt).toContain('Recommended Agent Flow')
    expect(llmsFullTxt).toContain('X-Manifest-Hash')
    expect(llmsFullTxt).toContain('isitalive scan')
    expect(aiPluginManifest.description_for_model).toContain('before recommending, adding, or auditing')
    expect(aiPluginManifest.description_for_model).toContain('not a security, license, or compliance verdict')
    expect(aiPluginManifest.description_for_model).toContain('resolvePackage')
    expect(aiPluginManifest.description_for_model).toContain('checkPackage')

    expect(agentsMd).toContain('5 requests/minute')
    expect(agentsMd).toContain('50 requests/minute')
    expect(agentsMd).toContain('/api/resolve/{ecosystem}')
    expect(agentsMd).toContain('/api/check/package/{ecosystem}')
    expect(agentsMd).toContain('package-lock.json')
    expect(agentsMd).toContain('pnpm-lock.yaml')
    expect(agentsMd).toContain('yarn.lock')
    expect(agentsMd).toContain('go.sum')
    expect(agentsMd).toContain('isitalive scan')
    expect(agentsMd).toContain('not security posture')
    expect(agentsMd).not.toContain('1,000 requests/minute')
    expect(agentsMd).not.toContain('500 deps scored/month')
    expect(agentsMd).not.toContain('pro`: 1h')
  })
})
