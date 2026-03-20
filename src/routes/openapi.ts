// ---------------------------------------------------------------------------
// OpenAPI 3.1 specification for the Is It Alive? API
// ---------------------------------------------------------------------------

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Is It Alive? API',
    version: '0.3.0',
    description: 'Check if an open-source project is actively maintained. Returns a health score (0-100), verdict, and signal breakdown based on real-time GitHub data.',
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
                description: 'Maximum requests allowed per hour for your tier',
                schema: { type: 'integer' },
              },
              'X-RateLimit-Remaining': {
                description: 'Requests remaining in current window',
                schema: { type: 'integer' },
              },
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
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key for higher rate limits. Pass as `Authorization: Bearer sk_your_key`. Without auth: 10 req/hr. Free key: 100/hr. Pro: 1,000/hr. Enterprise: 10,000/hr.',
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
            enum: ['healthy', 'maintained', 'stale', 'dormant', 'unmaintained'],
            description: 'Human-readable verdict based on score: healthy (80-100), maintained (60-79), stale (40-59), dormant (20-39), unmaintained (0-19)',
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
    },
  },
};
