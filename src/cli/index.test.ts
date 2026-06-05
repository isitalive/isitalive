/// <reference types="node" />

import { createServer, type IncomingMessage } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const cliPath = resolve(process.cwd(), 'src/cli/index.js')
const tempDirs: string[] = []

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'isitalive-cli-'))
  tempDirs.push(dir)
  return dir
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('isitalive CLI', () => {
  it('prints help', async () => {
    const { stdout } = await execFileAsync('node', [cliPath, '--help'])
    expect(stdout).toContain('isitalive scan [path]')
    expect(stdout).toContain('--include')
  })

  it('fails clearly when auth is missing', async () => {
    const dir = await makeTempDir()
    await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { hono: '^4.0.0' } }))

    await expect(execFileAsync('node', [cliPath, 'scan', dir, '--json'], {
      env: { ...process.env, ISITALIVE_API_KEY: '' },
    })).rejects.toMatchObject({
      stderr: expect.stringContaining('Missing API key'),
    })
  })

  it('discovers lockfiles, sends the hash header, retries partial audits, and prints JSON', async () => {
    const dir = await makeTempDir()
    await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }))
    await writeFile(join(dir, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/react': { version: '18.2.0' },
      },
    }))

    const requests: Array<{ url: string; headers: IncomingMessage['headers']; body: any }> = []
    const server = createServer(async (req, res) => {
      const body = JSON.parse(await readBody(req))
      requests.push({ url: req.url ?? '', headers: req.headers, body })
      res.setHeader('Content-Type', 'application/json')
      if (requests.length === 1) {
        res.end(JSON.stringify({ complete: false, retryAfterMs: 1, summary: { avgScore: 0 }, dependencies: [] }))
        return
      }
      res.end(JSON.stringify({
        auditHash: 'abc',
        complete: true,
        format: 'package-lock.json',
        scored: 1,
        total: 1,
        pending: 0,
        unresolved: 0,
        freshlyScored: 0,
        summary: { healthy: 1, stable: 0, degraded: 0, critical: 0, unmaintained: 0, avgScore: 95 },
        dependencies: [],
      }))
    })

    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('missing test server address')
      const { stdout } = await execFileAsync('node', [cliPath, 'scan', dir, '--json', '--include', 'metrics'], {
        env: {
          ...process.env,
          ISITALIVE_API_KEY: 'sk_test',
          ISITALIVE_API_BASE_URL: `http://127.0.0.1:${address.port}`,
        },
      })

      const output = JSON.parse(stdout)
      expect(output.format).toBe('package-lock.json')
      expect(output.result.complete).toBe(true)
      expect(requests).toHaveLength(2)
      expect(requests[0].url).toBe('/api/manifest?include=metrics')
      expect(requests[0].headers.authorization).toBe('Bearer sk_test')
      expect(requests[0].headers['x-manifest-hash']).toMatch(/^[a-f0-9]{64}$/)
      expect(requests[0].body.format).toBe('package-lock.json')
    } finally {
      server.close()
    }
  })
})
