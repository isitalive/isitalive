// ---------------------------------------------------------------------------
// OpenAPI 3.1 specification for the Is It Alive? API
// ---------------------------------------------------------------------------

import { CACHE_STATUS_DEFINITIONS, METHODOLOGY, SIGNAL_DEFINITIONS } from '../scoring/methodology'

const clientHeaderParameter = {
  name: 'X-IsItAlive-Client',
  in: 'header',
  required: false,
  description: 'Optional client attribution for aggregate product analytics. Format: `name/version` or `name/version (url-or-contact)`. This is not authentication and should not contain secrets.',
  schema: { type: 'string', examples: ['codex/1.0', 'my-agent/0.3 (https://example.com)'] },
}

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Is It Alive? API',
    version: '0.14.0', // x-release-please-version
    description: 'Check the maintenance-health of open-source GitHub projects before humans or AI agents choose a dependency. IsItAlive is free to use for public maintenance-health checks; infrastructure limits apply. Returns a weighted 0-100 score, verdict, methodology metadata, and agent-readable evidence. This is not a security, license, or compliance verdict.',
    license: {
      name: 'AGPL-3.0',
      url: 'https://www.gnu.org/licenses/agpl-3.0.html',
    },
    contact: {
      url: 'https://isitalive.dev',
    },
  },
  servers: [
    {
      url: 'https://isitalive.dev',
      description: 'Production',
    },
  ],
  paths: {
    '/api/check/{provider}/{owner}/{repo}': {
      get: {
        operationId: 'checkProject',
        summary: 'Check project maintenance',
        description: 'Returns a maintenance-health score, verdict, signal breakdown, and cache metadata for the specified open-source project. Use before recommending, adding, or auditing a dependency. Free-to-use results share a 24h fresh / 48h stale cache policy.',
        parameters: [
          {
            name: 'provider',
            in: 'path',
            required: true,
            description: 'Source code hosting provider',
            schema: { type: 'string', enum: ['github'] },
          },
          {
            name: 'owner',
            in: 'path',
            required: true,
            description: 'Repository owner or organization (e.g. "vercel")',
            schema: { type: 'string' },
          },
          {
            name: 'repo',
            in: 'path',
            required: true,
            description: 'Repository name (e.g. "next.js")',
            schema: { type: 'string' },
          },
          {
            name: 'include',
            in: 'query',
            required: false,
            description: 'Optional extra sections to include. Use include=metrics to include normalized raw measurements and sampling metadata.',
            schema: { type: 'string', enum: ['metrics'] },
          },
          clientHeaderParameter,
        ],
        security: [{ bearerAuth: [] }, {}],
        responses: {
          '200': {
            description: 'Project maintenance-health check result',
            headers: {
              'X-Cache': {
                description: 'Cache status header used by the route handler. `L2-STALE-DEGRADED` means the upstream provider was unavailable and the response was served from the last known cache (within a 7-day fallback window); such responses also set `Cache-Control: no-store` and include `degraded: true` in the body.',
                schema: { type: 'string', enum: ['L1-HIT', 'L2-HIT', 'L2-STALE', 'L2-STALE-DEGRADED', 'L3-MISS'] },
              },
              'X-RateLimit-Limit': {
                description: 'Maximum requests allowed per minute for your access level',
                schema: { type: 'integer' },
              },
              // Note: X-RateLimit-Remaining is intentionally omitted —
              // native Cloudflare Rate Limiting doesn't expose a remaining count.
              'X-RateLimit-Tier': {
                description: 'Current access policy. Free-to-use access currently returns `free`.',
                schema: { type: 'string', enum: ['free'] },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheckResult' },
                example: {
                  project: 'github/vercel/next.js',
                  provider: 'github',
                  score: 92,
                  verdict: 'healthy',
                  checkedAt: '2026-03-19T10:00:00Z',
                  cached: true,
                  methodology: {
                    version: METHODOLOGY.version,
                    scoreType: METHODOLOGY.scoreType,
                    description: METHODOLOGY.description,
                    url: METHODOLOGY.url,
                  },
                  signals: [
                    {
                      name: 'lastCommit',
                      label: 'Last Commit',
                      value: '2026-03-19T09:30:00Z',
                      score: 100,
                      weight: 0.25,
                      measurement: 'direct',
                      source: 'defaultBranchRef.target.history(first: 1)',
                    },
                  ],
                  drivers: [
                    {
                      signal: 'lastCommit',
                      label: 'Last Commit',
                      direction: 'positive',
                      weight: 0.25,
                      score: 100,
                      contribution: 12.5,
                      summary: 'Default branch activity is recent (0 days ago).',
                    },
                  ],
                  cache: {
                    status: 'l2-hit',
                    tier: 'free',
                    ageSeconds: 3600,
                    dataFetchedAt: '2026-03-19T09:00:00Z',
                    freshUntil: '2026-03-20T09:00:00Z',
                    staleUntil: '2026-03-21T09:00:00Z',
                    nextRefreshSeconds: 82800,
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid provider',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    error_code: {
                      type: 'string',
                      description: 'Machine-readable error classification.',
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Project not found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    error_code: {
                      type: 'string',
                      enum: ['not_found'],
                    },
                  },
                },
              },
            },
          },
          '502': {
            description: 'Upstream provider error (GitHub returned 5xx or malformed payload)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    error_code: { type: 'string', enum: ['upstream_error'] },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Upstream rate-limited or temporarily unavailable (serve-stale fallback is unavailable).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    error_code: { type: 'string', enum: ['github_rate_limited', 'github_circuit_open'] },
                  },
                },
              },
            },
          },
          '504': {
            description: 'Upstream provider timed out.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    error_code: { type: 'string', enum: ['github_timeout'] },
                  },
                },
              },
            },
          },
          '429': {
            description: 'Rate limit exceeded',
            headers: {
              'Retry-After': {
                description: 'Seconds until rate limit window resets',
                schema: { type: 'integer' },
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    limit: { type: 'integer' },
                    tier: { type: 'string', enum: ['free'] },
                    authenticated: { type: 'boolean' },
                    retryAfterSeconds: { type: 'integer' },
                    message: { type: 'string' },
                    hint: {
                      type: 'string',
                      description: 'Only present for anonymous requests. Human-readable guidance agents can surface to users.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/resolve/{ecosystem}/{packageName}': {
      get: {
        operationId: 'resolvePackage',
        summary: 'Resolve package to GitHub repository',
        description: 'Resolve an npm package, Go module, or PyPI package to the GitHub repository IsItAlive will score. Use this when an agent starts from a dependency name instead of a repo slug.',
        parameters: [
          {
            name: 'ecosystem',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['npm', 'go', 'pypi'] },
          },
          {
            name: 'packageName',
            in: 'path',
            required: true,
            description: 'Package name or module path, for example react, @types/node, golang.org/x/crypto, or requests.',
            schema: { type: 'string' },
          },
          {
            name: 'version',
            in: 'query',
            required: false,
            description: 'Optional version string echoed in the package context. Scoring remains repo-level.',
            schema: { type: 'string' },
          },
          clientHeaderParameter,
        ],
        security: [{ bearerAuth: [] }, {}],
        responses: {
          '200': {
            description: 'Package resolution result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PackageResolution' },
              },
            },
          },
          '400': { description: 'Invalid package name or unsupported ecosystem' },
          '404': { description: 'Package could not be resolved to a GitHub repository' },
          '502': { description: 'Package registry or resolver failed' },
        },
      },
    },
    '/api/resolve/{ecosystem}': {
      get: {
        operationId: 'resolvePackageByQuery',
        summary: 'Resolve package to GitHub repository by query',
        description: 'Query-parameter form of resolvePackage. Useful for package names that clients prefer not to place in the path.',
        parameters: [
          {
            name: 'ecosystem',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['npm', 'go', 'pypi'] },
          },
          {
            name: 'name',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'version',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
          clientHeaderParameter,
        ],
        security: [{ bearerAuth: [] }, {}],
        responses: {
          '200': {
            description: 'Package resolution result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PackageResolution' },
              },
            },
          },
          '400': { description: 'Invalid package name or unsupported ecosystem' },
          '404': { description: 'Package could not be resolved to a GitHub repository' },
          '502': { description: 'Package registry or resolver failed' },
        },
      },
    },
    '/api/check/package/{ecosystem}/{packageName}': {
      get: {
        operationId: 'checkPackage',
        summary: 'Check package maintenance',
        description: 'Resolve an npm package, Go module, or PyPI package to GitHub, then return the normal maintenance-health score for that repository with package context attached.',
        parameters: [
          {
            name: 'ecosystem',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['npm', 'go', 'pypi'] },
          },
          {
            name: 'packageName',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'include',
            in: 'query',
            required: false,
            description: 'Optional extra sections to include. Use include=metrics to include normalized raw measurements and sampling metadata.',
            schema: { type: 'string', enum: ['metrics'] },
          },
          {
            name: 'version',
            in: 'query',
            required: false,
            description: 'Optional version string echoed in the package context. Scoring remains repo-level.',
            schema: { type: 'string' },
          },
          clientHeaderParameter,
        ],
        security: [{ bearerAuth: [] }, {}],
        responses: {
          '200': {
            description: 'Package maintenance-health check result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PackageHealthCheckResult' },
              },
            },
          },
          '400': { description: 'Invalid package name or unsupported ecosystem' },
          '404': { description: 'Package or resolved GitHub repository not found' },
          '502': { description: 'Package registry, resolver, or upstream provider failed' },
        },
      },
    },
    '/api/check/package/{ecosystem}': {
      get: {
        operationId: 'checkPackageByQuery',
        summary: 'Check package maintenance by query',
        description: 'Query-parameter form of checkPackage. Useful for package names that clients prefer not to place in the path.',
        parameters: [
          {
            name: 'ecosystem',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['npm', 'go', 'pypi'] },
          },
          {
            name: 'name',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'include',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['metrics'] },
          },
          {
            name: 'version',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
          clientHeaderParameter,
        ],
        security: [{ bearerAuth: [] }, {}],
        responses: {
          '200': {
            description: 'Package maintenance-health check result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PackageHealthCheckResult' },
              },
            },
          },
          '400': { description: 'Invalid package name or unsupported ecosystem' },
          '404': { description: 'Package or resolved GitHub repository not found' },
          '502': { description: 'Package registry, resolver, or upstream provider failed' },
        },
      },
    },
    '/api/badge/{provider}/{owner}/{repo}': {
      get: {
        operationId: 'getBadge',
        summary: 'Get SVG maintenance badge',
        description: 'Returns an SVG badge showing the project maintenance-health score. Use in README files with `![Is It Alive?](https://isitalive.dev/api/badge/github/owner/repo)`.',
        parameters: [
          {
            name: 'provider',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['github'] },
          },
          {
            name: 'owner',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'repo',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'SVG badge',
            content: {
              'image/svg+xml': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/api/check/batch': {
      post: {
        operationId: 'checkBatch',
        summary: 'Batch check dependency maintenance',
        description: 'Authenticated batch endpoint for mixed package, package URL (purl), and GitHub repository inputs. Returns per-item maintenance-health results with canonical identity, resolution, state, freshness, and optional policy evaluation.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'include',
            in: 'query',
            required: false,
            description: 'Optional extra per-result sections to include. Combine with commas, for example include=drivers,metrics.',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BatchRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Batch maintenance-health result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BatchResult' },
              },
            },
          },
          '400': { description: 'Invalid batch request' },
          '401': { description: 'Authentication required' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/check/manifest': {
      post: {
        operationId: 'auditManifestViaCheck',
        summary: 'Audit dependency manifest',
        description: 'Alias for /api/manifest for agents that group all checks under /api/check. Behavior, request body, headers, and response schema are the same as auditManifest.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuditRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Audit result (complete or partial)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuditResult' },
              },
            },
          },
          '304': { description: 'Not Modified — manifest unchanged since last audit' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/api/manifest': {
      post: {
        operationId: 'auditManifest',
        summary: 'Audit dependency manifest',
        description: 'Upload a package.json, package-lock.json, pnpm-lock.yaml, yarn.lock, go.mod, go.sum, requirements.txt, or pyproject.toml file and receive a scored maintenance-health report for every dependency. Synchronous, idempotent, and cache-first — calling again with the same manifest content is instant (~50ms). If not all dependencies can be scored within the time budget, the response includes `complete: false` and a `retryAfterMs` hint. Simply call again to get remaining results.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'include',
            in: 'query',
            required: false,
            description: 'Optional extra per-dependency sections to include. Combine with commas, for example include=drivers,metrics.',
            schema: { type: 'string' },
          },
          clientHeaderParameter,
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuditRequest' },
              example: {
                format: 'go.mod',
                content: 'module example.com/myapp\n\ngo 1.21\n\nrequire (\n\tgithub.com/gorilla/mux v1.8.1\n)',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Audit result (complete or partial)',
            headers: {
              ETag: {
                description: 'SHA-256 hash of the manifest content. Send as If-None-Match on subsequent requests to get 304 if unchanged.',
                schema: { type: 'string' },
              },
              'Retry-After': {
                description: 'Seconds to wait before retrying (only present when complete is false)',
                schema: { type: 'integer' },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuditResult' },
                example: {
                  auditHash: '7da0c591f32d...',
                  complete: true,
                  format: 'go.mod',
                  scored: 2,
                  total: 2,
                  pending: 0,
                  unresolved: 0,
                  methodology: {
                    version: METHODOLOGY.version,
                    scoreType: METHODOLOGY.scoreType,
                    description: METHODOLOGY.description,
                    url: METHODOLOGY.url,
                  },
                  summary: {
                    healthy: 1,
                    stable: 0,
                    degraded: 0,
                    critical: 0,
                    unmaintained: 1,
                    avgScore: 60,
                  },
                  dependencies: [
                    {
                      name: 'github.com/zitadel/zitadel',
                      version: 'v2.45.0',
                      dev: false,
                      ecosystem: 'go',
                      github: 'zitadel/zitadel',
                      score: 100,
                      verdict: 'healthy',
                      resolvedFrom: 'direct',
                      checkedAt: '2026-03-19T10:00:00Z',
                      methodology: {
                        version: METHODOLOGY.version,
                        scoreType: METHODOLOGY.scoreType,
                        description: METHODOLOGY.description,
                        url: METHODOLOGY.url,
                      },
                    },
                    {
                      name: 'github.com/gorilla/mux',
                      version: 'v1.8.1',
                      dev: false,
                      ecosystem: 'go',
                      github: 'gorilla/mux',
                      score: 19,
                      verdict: 'unmaintained',
                    },
                  ],
                },
              },
            },
          },
          '304': {
            description: 'Not Modified — manifest unchanged since last audit (requires If-None-Match header)',
          },
          '400': {
            description: 'Invalid request (bad JSON, unsupported format, content too large)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    supported: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key or GitHub Actions OIDC token. Pass as `Authorization: Bearer sk_your_key` or `Authorization: Bearer <oidc_jwt>`. Without auth: 5 req/min (IP-based). With an API key or OIDC token: 50 req/min (identity-based).',
      },
    },
    schemas: {
      PackageDescriptor: {
        type: 'object',
        required: ['ecosystem', 'name', 'version'],
        properties: {
          ecosystem: { type: 'string', enum: ['npm', 'go', 'pypi'] },
          name: { type: 'string' },
          version: {
            type: 'string',
            description: 'Always present. Contains the optional package version provided by the caller, or an empty string when omitted. Scoring remains repo-level.',
          },
        },
      },
      PackageResolution: {
        type: 'object',
        required: ['package', 'github', 'resolvedFrom'],
        properties: {
          package: { $ref: '#/components/schemas/PackageDescriptor' },
          github: {
            type: 'string',
            description: 'Resolved GitHub owner/repo, normalized for IsItAlive checks.',
          },
          resolvedFrom: {
            type: 'string',
            nullable: true,
            enum: ['direct', 'vanity', 'registry', 'cache', null],
          },
        },
      },
      PackageHealthCheckResult: {
        allOf: [
          { $ref: '#/components/schemas/HealthCheckResult' },
          {
            type: 'object',
            required: ['package', 'github', 'resolvedFrom'],
            properties: {
              package: { $ref: '#/components/schemas/PackageDescriptor' },
              github: {
                type: 'string',
                description: 'Resolved GitHub owner/repo, normalized for IsItAlive checks.',
              },
              resolvedFrom: {
                type: 'string',
                nullable: true,
                enum: ['direct', 'vanity', 'registry', 'cache', null],
              },
            },
          },
        ],
      },
      HealthCheckResult: {
        type: 'object',
        required: ['project', 'provider', 'score', 'verdict', 'checkedAt', 'cached', 'methodology', 'signals', 'drivers'],
        properties: {
          project: {
            type: 'string',
            description: 'Fully qualified project identifier (provider/owner/repo)',
          },
          provider: {
            type: 'string',
            enum: ['github'],
          },
          score: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description: 'Weighted maintenance-health score',
          },
          verdict: {
            type: 'string',
            enum: ['healthy', 'stable', 'degraded', 'critical', 'unmaintained'],
            description: 'Human-readable verdict based on score: healthy (80-100), stable (60-79), degraded (40-59), critical (20-39), unmaintained (0-19)',
          },
          checkedAt: {
            type: 'string',
            format: 'date-time',
            description: 'When the data was originally fetched from the provider',
          },
          cached: {
            type: 'boolean',
            description: 'Whether this result was served from cache',
          },
          methodology: {
            $ref: '#/components/schemas/Methodology',
          },
          signals: {
            type: 'array',
            items: { $ref: '#/components/schemas/Signal' },
            description: 'Individual maintenance signals that make up the score',
          },
          drivers: {
            type: 'array',
            items: { $ref: '#/components/schemas/ScoreDriver' },
            description: 'Top reasons the score is notably strong or weak',
          },
          metrics: {
            $ref: '#/components/schemas/ProjectMetrics',
          },
          overrideReason: {
            type: 'string',
            description: 'If present, explains why the score was overridden (e.g. archived repo)',
          },
          cache: {
            $ref: '#/components/schemas/CacheMetadata',
          },
          degraded: {
            type: 'boolean',
            description: 'True when the upstream provider was unavailable and this response was served from cached data past its normal stale window. Such responses set `Cache-Control: no-store` and `X-Cache: L2-STALE-DEGRADED`.',
          },
          error_code: {
            type: 'string',
            enum: ['github_rate_limited', 'github_timeout', 'github_circuit_open', 'upstream_error'],
            description: 'Only present when `degraded: true`. Machine-readable reason the upstream call failed.',
          },
        },
      },
      Signal: {
        type: 'object',
        required: ['name', 'label', 'value', 'score', 'weight', 'measurement', 'source'],
        properties: {
          name: {
            type: 'string',
            enum: SIGNAL_DEFINITIONS.map((signal) => signal.name),
            description: 'Machine-readable signal name in camelCase',
          },
          label: {
            type: 'string',
            description: 'Human-readable signal label',
          },
          value: {
            description: 'Raw measured value (string, number, or boolean)',
          },
          score: {
            type: 'integer',
            minimum: 0,
            maximum: 100,
            description: 'Score for this signal',
          },
          weight: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Weight of this signal in the total score (all weights sum to 1)',
          },
          measurement: {
            type: 'string',
            enum: ['direct', 'sampled-proxy'],
            description: 'Whether the signal is a direct measurement or a sampled proxy',
          },
          source: {
            type: 'string',
            description: 'Provider field or API used to compute the signal',
          },
        },
      },
      Methodology: {
        type: 'object',
        required: ['version', 'scoreType', 'description', 'url'],
        properties: {
          version: { type: 'string' },
          scoreType: { type: 'string', enum: ['maintenance-health'] },
          description: { type: 'string' },
          url: { type: 'string', format: 'uri' },
        },
      },
      ScoreDriver: {
        type: 'object',
        required: ['signal', 'label', 'direction', 'weight', 'score', 'contribution', 'summary'],
        properties: {
          signal: { type: 'string', enum: SIGNAL_DEFINITIONS.map((signal) => signal.name) },
          label: { type: 'string' },
          direction: { type: 'string', enum: ['positive', 'negative'] },
          weight: { type: 'number' },
          score: { type: 'integer' },
          contribution: { type: 'number' },
          summary: { type: 'string' },
        },
      },
      CacheMetadata: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: CACHE_STATUS_DEFINITIONS.map((status) => status.name),
            description: 'Cache tier that served this response',
          },
          tier: {
            type: 'string',
            enum: ['free'],
            description: 'Current free-to-use cache policy',
          },
          ageSeconds: {
            type: 'integer',
            description: 'How many seconds old the cached data is',
          },
          dataFetchedAt: {
            type: 'string',
            format: 'date-time',
            description: 'When the data was originally fetched',
          },
          freshUntil: {
            type: 'string',
            format: 'date-time',
            description: 'Data is considered fresh until this time',
          },
          staleUntil: {
            type: 'string',
            format: 'date-time',
            description: 'Stale data will still be served until this time (with background refresh)',
          },
          nextRefreshSeconds: {
            type: 'integer',
            description: 'Seconds until the data will be refreshed. Use this to schedule your next poll.',
          },
        },
      },
      AuditRequest: {
        type: 'object',
        required: ['format', 'content'],
        properties: {
          format: {
            type: 'string',
            enum: ['go.mod', 'go.sum', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'requirements.txt', 'pyproject.toml'],
            description: 'Manifest file format',
          },
          content: {
            type: 'string',
            description: 'Raw manifest file content (max 512KB)',
          },
          policy: { $ref: '#/components/schemas/AuditPolicy' },
          maxAgeSeconds: {
            type: 'integer',
            minimum: 0,
            description: 'Best-effort freshness target. Results older than this are flagged with stale_data if fresh data cannot be returned in time.',
          },
          preferFresh: {
            type: 'boolean',
            description: 'Best-effort hint to refresh stale cached repo scores before responding.',
          },
        },
      },
      BatchRequest: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            maxItems: 200,
            items: { $ref: '#/components/schemas/BatchItem' },
          },
          policy: { $ref: '#/components/schemas/AuditPolicy' },
          maxAgeSeconds: { type: 'integer', minimum: 0 },
          preferFresh: { type: 'boolean' },
        },
      },
      BatchItem: {
        oneOf: [
          {
            type: 'object',
            required: ['kind', 'ecosystem', 'name'],
            properties: {
              kind: { type: 'string', const: 'package' },
              ecosystem: { type: 'string', enum: ['npm', 'go', 'pypi'] },
              name: { type: 'string' },
              version: { type: 'string' },
            },
          },
          {
            type: 'object',
            required: ['kind', 'purl'],
            properties: {
              kind: { type: 'string', const: 'purl' },
              purl: { type: 'string', example: 'pkg:npm/react@18.2.0' },
            },
          },
          {
            type: 'object',
            required: ['kind', 'owner', 'repo'],
            properties: {
              kind: { type: 'string', const: 'github' },
              owner: { type: 'string' },
              repo: { type: 'string' },
              version: { type: 'string' },
            },
          },
        ],
      },
      BatchResult: {
        allOf: [
          { $ref: '#/components/schemas/AuditResult' },
          {
            type: 'object',
            required: ['batchHash', 'results'],
            properties: {
              batchHash: { type: 'string', description: 'SHA-256 hash of the batch request body' },
              results: {
                type: 'array',
                items: { $ref: '#/components/schemas/AuditDep' },
              },
            },
          },
        ],
      },
      AuditPolicy: {
        type: 'object',
        properties: {
          failBelowScore: { type: 'integer', minimum: 0, maximum: 100 },
          warnBelowScore: { type: 'integer', minimum: 0, maximum: 100 },
          ignoreDevDependencies: { type: 'boolean' },
          failOnUnresolved: { type: 'boolean' },
          requireResolutionConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          warnIfNoReleaseDays: { type: 'integer', minimum: 0 },
        },
      },
      AuditResult: {
        type: 'object',
        required: ['auditHash', 'complete', 'format', 'scored', 'total', 'pending', 'unresolved', 'freshlyScored', 'methodology', 'summary', 'dependencies'],
        properties: {
          auditHash: {
            type: 'string',
            description: 'SHA-256 hash of the manifest content — usable as ETag for CI pipelines',
          },
          complete: {
            type: 'boolean',
            description: 'Whether all resolvable dependencies were scored. If false, call again after retryAfterMs.',
          },
          format: {
            type: 'string',
            description: 'Manifest format that was parsed',
          },
          scored: {
            type: 'integer',
            description: 'Number of dependencies successfully scored',
          },
          total: {
            type: 'integer',
            description: 'Total number of dependencies in the manifest',
          },
          pending: {
            type: 'integer',
            description: 'Dependencies not yet scored (will be scored on retry)',
          },
          unresolved: {
            type: 'integer',
            description: 'Dependencies that could not be resolved to a GitHub repo',
          },
          retryAfterMs: {
            type: 'integer',
            description: 'When complete is false, suggested wait in ms before calling again',
          },
          freshlyScored: {
            type: 'integer',
            description: 'Number of dependencies freshly scored this request. Cache hits are 0 fresh scores.',
          },
          methodology: {
            $ref: '#/components/schemas/Methodology',
          },
          summary: {
            type: 'object',
            properties: {
              healthy: { type: 'integer' },
              stable: { type: 'integer' },
              degraded: { type: 'integer' },
              critical: { type: 'integer' },
              unmaintained: { type: 'integer' },
              avgScore: { type: 'integer', description: 'Average score across scored dependencies' },
            },
          },
          dependencies: {
            type: 'array',
            items: { $ref: '#/components/schemas/AuditDep' },
            description: 'Per-dependency results, sorted by score (highest first)',
          },
          policyVerdict: {
            type: 'string',
            enum: ['pass', 'warn', 'fail'],
            description: 'Aggregate policy result when a policy is supplied.',
          },
        },
      },
      AuditDep: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Original package name from manifest' },
          version: { type: 'string', description: 'Version from manifest' },
          dev: { type: 'boolean', description: 'Whether this is a dev/indirect dependency' },
          ecosystem: { type: 'string', enum: ['go', 'npm', 'github', 'unsupported'] },
          github: { type: 'string', nullable: true, description: 'Resolved GitHub owner/repo (e.g. "vercel/next.js") or null' },
          score: { type: 'integer', nullable: true, description: 'Maintenance-health score 0-100, or null if unresolved' },
          verdict: { type: 'string', enum: ['healthy', 'stable', 'degraded', 'critical', 'unmaintained', 'pending', 'unresolved'] },
          resolvedFrom: { type: 'string', nullable: true, enum: ['direct', 'vanity', 'registry', 'cache', null], description: 'How the dependency was resolved to GitHub' },
          checkedAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the underlying repo score was computed' },
          methodology: { $ref: '#/components/schemas/Methodology' },
          cacheStatus: { type: 'string', enum: ['fresh', 'cached', 'pending', 'unresolved'], description: 'Whether this dep was freshly scored or served from cache' },
          unresolvedReason: { type: 'string', description: 'Why this dep could not be resolved (e.g. "gitlab_not_supported_yet", "no_github_repo", "repo_not_found")' },
          signals: {
            type: 'array',
            items: { $ref: '#/components/schemas/Signal' },
            description: 'Per-dependency signal breakdown. Only included when requested via include=signals.',
          },
          drivers: {
            type: 'array',
            items: { $ref: '#/components/schemas/ScoreDriver' },
            description: 'Per-dependency drivers. Only included when requested via include=drivers.',
          },
          metrics: {
            $ref: '#/components/schemas/ProjectMetrics',
          },
          identity: { $ref: '#/components/schemas/AgentDependencyIdentity' },
          resolution: { $ref: '#/components/schemas/AgentDependencyResolution' },
          state: {
            type: 'string',
            enum: ['resolved', 'pending', 'unresolved', 'unsupported_ecosystem', 'private_repo', 'rate_limited', 'provider_error'],
            description: 'Processing state, separate from the maintenance-health verdict.',
          },
          healthVerdict: {
            type: 'string',
            nullable: true,
            enum: ['healthy', 'stable', 'degraded', 'critical', 'unmaintained', null],
            description: 'Maintenance-health verdict only; null when not scored.',
          },
          dataFreshness: { $ref: '#/components/schemas/AgentDataFreshness' },
          topDrivers: {
            type: 'array',
            items: { $ref: '#/components/schemas/ScoreDriver' },
          },
          riskFlags: {
            type: 'array',
            items: { type: 'string' },
          },
          policy: { $ref: '#/components/schemas/AgentPolicyResult' },
        },
      },
      AgentDependencyIdentity: {
        type: 'object',
        required: ['purl', 'ecosystem', 'name', 'version', 'dependencyType'],
        properties: {
          purl: { type: 'string', nullable: true },
          ecosystem: { type: 'string', enum: ['npm', 'go', 'pypi', 'github', 'unsupported'] },
          name: { type: 'string' },
          version: { type: 'string' },
          dependencyType: { type: 'string', enum: ['direct', 'dev', 'transitive'] },
          sourceFormat: { type: 'string' },
        },
      },
      AgentDependencyResolution: {
        type: 'object',
        required: ['provider', 'repo', 'source', 'confidence'],
        properties: {
          provider: { type: 'string', nullable: true, enum: ['github', null] },
          repo: { type: 'string', nullable: true },
          source: { type: 'string', nullable: true, enum: ['direct', 'vanity', 'registry', 'cache', 'input', null] },
          confidence: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        },
      },
      AgentDataFreshness: {
        type: 'object',
        required: ['checkedAt', 'cacheStatus', 'ageSeconds', 'freshUntil', 'staleUntil', 'satisfiesRequestedMaxAge'],
        properties: {
          checkedAt: { type: 'string', format: 'date-time', nullable: true },
          cacheStatus: { type: 'string' },
          ageSeconds: { type: 'integer', nullable: true },
          freshUntil: { type: 'string', format: 'date-time', nullable: true },
          staleUntil: { type: 'string', format: 'date-time', nullable: true },
          satisfiesRequestedMaxAge: { type: 'boolean', nullable: true },
        },
      },
      AgentPolicyResult: {
        type: 'object',
        required: ['outcome', 'reasons'],
        properties: {
          outcome: { type: 'string', enum: ['pass', 'warn', 'fail', 'skipped'] },
          reasons: { type: 'array', items: { type: 'string' } },
        },
      },
      ProjectMetrics: {
        type: 'object',
        properties: {
          lastCommitDate: { type: 'string', format: 'date-time', nullable: true },
          lastCommitAgeDays: { type: 'integer', nullable: true },
          lastReleaseDate: { type: 'string', format: 'date-time', nullable: true },
          lastReleaseAgeDays: { type: 'integer', nullable: true },
          issueStalenessMedianDays: { type: 'integer', nullable: true },
          issueSampleSize: { type: 'integer' },
          issueSampleLimit: { type: 'integer' },
          issueSamplingStrategy: { type: 'string' },
          prResponsivenessMedianDays: { type: 'integer', nullable: true },
          prSampleSize: { type: 'integer' },
          prSampleLimit: { type: 'integer' },
          prSamplingStrategy: { type: 'string' },
          recentContributorCount: { type: 'integer' },
          contributorCommitSampleSize: { type: 'integer' },
          contributorWindowDays: { type: 'integer' },
          topContributorCommitShare: { type: 'number' },
          hasCi: { type: 'boolean' },
          lastCiRunDate: { type: 'string', format: 'date-time', nullable: true },
          lastCiRunAgeDays: { type: 'integer', nullable: true },
          ciRunSuccessRate: { type: 'number', nullable: true },
          ciRunCount: { type: 'integer' },
          ciWorkflowRunSampleSize: { type: 'integer' },
          ciSamplingWindowDays: { type: 'integer' },
          ciDataSource: { type: 'string', enum: ['actions-runs', 'workflow-directory-only', 'actions-runs-unavailable', 'none'] },
        },
      },
    },
  },
};
