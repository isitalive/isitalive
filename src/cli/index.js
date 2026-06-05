#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const SUPPORTED_FORMATS = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package.json',
  'go.mod',
  'go.sum',
]

const DEFAULT_BASE_URL = 'https://isitalive.dev'
const DEFAULT_MAX_ATTEMPTS = 5

function usage() {
  return `IsItAlive CLI

Usage:
  isitalive scan [path] --json --include drivers,metrics,signals

Options:
  --api-key <key>      IsItAlive API key. Defaults to ISITALIVE_API_KEY.
  --include <values>   Comma-separated extras: drivers,metrics,signals.
  --json               Print JSON output.
  --base-url <url>     Override API base URL for testing or self-hosting.
  --help               Show this help.
`
}

function parseArgs(argv) {
  const args = {
    command: null,
    path: process.cwd(),
    json: false,
    include: '',
    apiKey: process.env.ISITALIVE_API_KEY || '',
    baseUrl: process.env.ISITALIVE_API_BASE_URL || DEFAULT_BASE_URL,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { ...args, help: true }
    if (!args.command) {
      args.command = arg
      continue
    }
    if (arg === '--json') {
      args.json = true
      continue
    }
    if (arg === '--include') {
      args.include = argv[++i] || ''
      continue
    }
    if (arg === '--api-key') {
      args.apiKey = argv[++i] || ''
      continue
    }
    if (arg === '--base-url') {
      args.baseUrl = argv[++i] || ''
      continue
    }
    if (!arg.startsWith('-')) {
      args.path = arg
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  return args
}

async function discoverManifest(inputPath) {
  const absolute = resolve(inputPath)
  const info = await stat(absolute)
  if (info.isFile()) {
    const format = basename(absolute)
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw new Error(`Unsupported manifest format: ${format}`)
    }
    return { path: absolute, format }
  }

  if (!info.isDirectory()) {
    throw new Error(`Path is not a file or directory: ${absolute}`)
  }

  const entries = new Set(await readdir(absolute))
  for (const format of SUPPORTED_FORMATS) {
    if (entries.has(format)) {
      return { path: join(absolute, format), format }
    }
  }

  throw new Error(`No supported manifest found in ${absolute}`)
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function postManifest({ baseUrl, apiKey, format, content, include }) {
  const hash = sha256(content)
  const url = new URL('/api/manifest', baseUrl)
  if (include) url.searchParams.set('include', include)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Manifest-Hash': hash,
    },
    body: JSON.stringify({ format, content }),
  })

  if (!response.ok) {
    let detail = ''
    try {
      detail = JSON.stringify(await response.json())
    } catch {
      detail = await response.text()
    }
    throw new Error(`IsItAlive API request failed (${response.status}): ${detail}`)
  }

  return response.json()
}

async function scan(args) {
  if (!args.apiKey) {
    throw new Error('Missing API key. Set ISITALIVE_API_KEY or pass --api-key.')
  }

  const manifest = await discoverManifest(args.path)
  const content = await readFile(manifest.path, 'utf8')
  let result = null

  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt++) {
    result = await postManifest({
      baseUrl: args.baseUrl,
      apiKey: args.apiKey,
      format: manifest.format,
      content,
      include: args.include,
    })

    if (result.complete !== false) break
    if (attempt === DEFAULT_MAX_ATTEMPTS) break
    await sleep(Math.max(0, Number(result.retryAfterMs ?? 1000)))
  }

  return {
    manifestPath: manifest.path,
    format: manifest.format,
    result,
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.help || !args.command) {
    process.stdout.write(usage())
    return
  }

  if (args.command !== 'scan') {
    throw new Error(`Unknown command: ${args.command}`)
  }

  const output = await scan(args)
  if (args.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    return
  }

  const summary = output.result?.summary
  process.stdout.write([
    `Audited ${output.manifestPath}`,
    `Format: ${output.format}`,
    `Complete: ${output.result?.complete === false ? 'false' : 'true'}`,
    summary ? `Average score: ${summary.avgScore}` : null,
  ].filter(Boolean).join('\n') + '\n')
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
