// ---------------------------------------------------------------------------
// OpenAPI 3.1 specification for the Is It Alive? API
// ---------------------------------------------------------------------------

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Is It Alive? API',
    version: '0.7.2',
    description: 'Check if an open-source project is actively maintained. Returns a health score (0-100), verdict, and signal breakdown based on real-time GitHub data. Also supports manifest auditing — upload a go.mod or package.json to get a scored health report for all dependencies.',
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
        summary: 'Check project health',
        description: 'Returns a health score, verdict, signal breakdown, and cache metadata for the specified open-source project. Results are cached with tiered TTLs based on your API key tier.',
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
        ],
        security: [{ bearerAuth: [] }, {}],
        responses: {
          '200': {
            description: 'Project health check result',
            headers: {
              'X-Cache': {
                description: 'Cache status: L1-HIT (edge), HIT (KV), STALE (serving stale + revalidating), MISS (fresh fetch)',
                schema: { type: 'string', enum: ['L1-HIT', 'HIT', 'STALE', 'MISS'] },
              },
              'X-RateLimit-Limit': {
                description: 'Maximum requests allowed per minute for your tier',
                schema: { type: 'integer' },
              },
              // Note: X-RateLimit-Remaining is intentionally omitted —
              // native Cloudflare Rate Limiting doesn't expose a remaining count.
              'X-RateLimit-Tier': {
                description: 'Your current rate limit tier',
                schema: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
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
                  signals: [
                    {
                      name: 'last_commit',
                      label: 'Last Commit',
                      value: '2026-03-19T09:30:00Z',
                      score: 100,
                      weight: 0.25,
                    },
                  ],
                  cache: {
                    status: 'hit',
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
                    tier: { type: 'string' },
                    authenticated: { type: 'boolean' },
                    remaining: { type: 'integer' },
                    retryAfterSeconds: { type: 'integer' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/badge/{provider}/{owner}/{repo}': {
      get: {
        operationId: 'getBadge',
        summary: 'Get SVG health badge',
        description: 'Returns an SVG badge showing the project health score. Use in README files with `![Is It Alive?](https://isitalive.dev/api/badge/github/owner/repo)`.',
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
    '/api/manifest': {
      post: {
        operationId: 'auditManifest',
        summary: 'Audit dependency manifest',
        description: 'Upload a go.mod or package.json file and receive a scored health report for every dependency. Synchronous, idempotent, and cache-first — calling again with the same manifest content is instant (~50ms). If not all dependencies can be scored within the time budget, the response includes `complete: false` and a `retryAfterMs` hint. Simply call again to get remaining results.',
        security: [{ bearerAuth: [] }, {}],
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
    '/api/manifest/hash/{hash}': {
      get: {
        operationId: 'getManifestByHash',
        summary: 'Lookup cached manifest audit by content hash',
        description: 'Returns cached audit results for a previously-scored manifest, identified by its SHA-256 content hash. No authentication required. CDN-cached for 7 days (`s-maxage=604800`). Returns 404 if the manifest has not been audited yet. Used by the GitHub Action for $0-cost cache hits — hash your manifest locally, try GET first, POST only on miss.',
        parameters: [
          {
            name: 'hash',
            in: 'path',
            required: true,
            description: 'SHA-256 hex hash of the manifest file content (64 characters)',
            schema: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        ],
        responses: {
          '200': {
            description: 'Cached audit result',
            headers: {
              ETag: {
                description: 'The content hash, quoted',
                schema: { type: 'string' },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuditResult' },
              },
            },
          },
          '400': {
            description: 'Invalid hash format',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { error: { type: 'string' } } },
              },
            },
          },
          '404': {
            description: 'Manifest not yet audited',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { error: { type: 'string' } } },
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
        description: 'API key or GitHub Actions OIDC token. Pass as `Authorization: Bearer sk_your_key` or `Authorization: Bearer <oidc_jwt>`. Without auth: 10 req/min (IP-based). With any API key: 1,000 req/min (key-based).',
      },
    },
    schemas: {
      HealthCheckResult: {
        type: 'object',
        required: ['project', 'provider', 'score', 'verdict', 'checkedAt', 'cached', 'signals'],
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
            description: 'Weighted health score',
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
          signals: {
            type: 'array',
            items: { $ref: '#/components/schemas/Signal' },
            description: 'Individual health signals that make up the score',
          },
          overrideReason: {
            type: 'string',
            description: 'If present, explains why the score was overridden (e.g. archived repo)',
          },
          cache: {
            $ref: '#/components/schemas/CacheMetadata',
          },
        },
      },
      Signal: {
        type: 'object',
        required: ['name', 'label', 'value', 'score', 'weight'],
        properties: {
          name: {
            type: 'string',
            description: 'Machine-readable signal name (e.g. "last_commit", "issue_staleness")',
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
        },
      },
      CacheMetadata: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['l1-hit', 'hit', 'stale', 'miss'],
            description: 'Cache tier that served this response',
          },
          tier: {
            type: 'string',
            enum: ['free', 'pro', 'enterprise'],
            description: 'Your API key tier (determines cache TTLs)',
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
            enum: ['go.mod', 'package.json'],
            description: 'Manifest file format',
          },
          content: {
            type: 'string',
            description: 'Raw manifest file content (max 512KB)',
          },
        },
      },
      AuditResult: {
        type: 'object',
        required: ['auditHash', 'complete', 'format', 'scored', 'total', 'pending', 'unresolved', 'freshlyScored', 'summary', 'dependencies'],
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
            description: 'Number of dependencies freshly scored this request (consumed quota). Cache hits are 0 quota.',
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
        },
      },
      AuditDep: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Original package name from manifest' },
          version: { type: 'string', description: 'Version from manifest' },
          dev: { type: 'boolean', description: 'Whether this is a dev/indirect dependency' },
          ecosystem: { type: 'string', enum: ['go', 'npm'] },
          github: { type: 'string', nullable: true, description: 'Resolved GitHub owner/repo (e.g. "vercel/next.js") or null' },
          score: { type: 'integer', nullable: true, description: 'Health score 0-100, or null if unresolved' },
          verdict: { type: 'string', enum: ['healthy', 'stable', 'degraded', 'critical', 'unmaintained', 'pending', 'unresolved'] },
          cacheStatus: { type: 'string', enum: ['fresh', 'cached', 'pending', 'unresolved'], description: 'Whether this dep was freshly scored or served from cache' },
          unresolvedReason: { type: 'string', description: 'Why this dep could not be resolved (e.g. "gitlab_not_supported_yet", "no_github_repo", "repo_not_found")' },
        },
      },
    },
  },
};
