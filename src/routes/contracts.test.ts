import { describe, expect, it } from 'vitest'
import { openApiSpec } from './openapi'
import { llmsTxt } from './llms'
import { apiDocsPage } from '../ui/api-docs'
import { landingPage } from '../ui/landing'
import { methodologyPage } from '../ui/methodology'
import { CACHE_STATUS_DEFINITIONS, METHODOLOGY, SIGNAL_DEFINITIONS } from '../scoring/methodology'

describe('agent contract alignment', () => {
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
    expect(html).toContain('6 hours')
    expect(html).toContain('maintenance-health')
  })

  it('keeps the public docs pages aligned with the live wire contract', () => {
    const apiDocs = apiDocsPage()
    expect(apiDocs).toContain('maintenance-health')
    expect(apiDocs).toContain('"lastCommit"')
    expect(apiDocs).toContain('l2-hit')
    expect(apiDocs).toContain('5 req/min')
    expect(apiDocs).not.toContain('"last_commit"')
    expect(apiDocs).not.toContain('60 req/min')

    const landing = landingPage()
    expect(landing).toContain('maintenance-health')
    expect(landing).not.toContain('safe to depend on')
  })
})
