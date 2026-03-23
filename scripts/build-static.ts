#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pre-render static pages to public/ for Cloudflare Static Assets (ADR-006)
//
// Static Assets serve files WITHOUT invoking the Worker — free & unlimited.
// This script renders UI templates at build time so that landing, methodology,
// terms, changelog, trending, api-docs, llms.txt, openapi.json, and
// ai-plugin.json are all served at zero cost.
//
// Usage:
//   npx tsx scripts/build-static.ts
//
// Reads TURNSTILE_SITE_KEY and CF_ANALYTICS_TOKEN from environment or .dev.vars.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'public');

// ── Load tokens from environment, .dev.vars, or wrangler.toml [vars] ───

function loadDevVars(): Record<string, string> {
  const devVarsPath = resolve(ROOT, '.dev.vars');
  if (!existsSync(devVarsPath)) return {};
  return parseKeyValueFile(readFileSync(devVarsPath, 'utf-8'));
}

function loadWranglerVars(): Record<string, string> {
  const tomlPath = resolve(ROOT, 'wrangler.toml');
  if (!existsSync(tomlPath)) return {};
  const content = readFileSync(tomlPath, 'utf-8');
  // Simple parser: find [vars] section and extract key = "value" pairs
  const varsMatch = content.match(/\[vars\]\n([\s\S]*?)(?:\n\[|\n$)/);
  if (!varsMatch) return {};
  return parseKeyValueFile(varsMatch[1]);
}

function parseKeyValueFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes and inline comments
    if ((val.startsWith('"') && val.includes('"', 1))) {
      val = val.slice(1, val.indexOf('"', 1));
    } else if ((val.startsWith("'") && val.includes("'", 1))) {
      val = val.slice(1, val.indexOf("'", 1));
    }
    if (val) vars[key] = val;
  }
  return vars;
}

const devVars = loadDevVars();
const wranglerVars = loadWranglerVars();
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || devVars.TURNSTILE_SITE_KEY || wranglerVars.TURNSTILE_SITE_KEY || '';
const CF_ANALYTICS_TOKEN = process.env.CF_ANALYTICS_TOKEN || devVars.CF_ANALYTICS_TOKEN || wranglerVars.CF_ANALYTICS_TOKEN || '';

if (!TURNSTILE_SITE_KEY) {
  console.warn('⚠️  TURNSTILE_SITE_KEY not set — landing page Turnstile widget will be empty');
}
if (!CF_ANALYTICS_TOKEN) {
  console.warn('⚠️  CF_ANALYTICS_TOKEN not set — analytics beacon will be missing');
}

// ── Import UI templates ────────────────────────────────────────────────

import { landingPage } from '../src/ui/landing.js';
import { methodologyPage } from '../src/ui/methodology.js';
import { termsPage } from '../src/ui/terms.js';
import { changelogPage } from '../src/ui/changelog.js';
import { trendingPage } from '../src/ui/trending.js';
import { apiDocsPage } from '../src/ui/api-docs.js';
import { openApiSpec } from '../src/routes/openapi.js';
import { llmsTxt, llmsFullTxt } from '../src/routes/llms.js';
import { aiPluginManifest } from '../src/routes/aiPlugin.js';
import { pricingPage } from '../src/ui/pricing.js';

// ── Render and write ───────────────────────────────────────────────────

function write(relPath: string, content: string) {
  const absPath = resolve(OUT, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf-8');
  console.log(`  ✅ ${relPath}`);
}

console.log('🔨 Building static assets to public/...\n');

// HTML pages
write('index.html', landingPage(TURNSTILE_SITE_KEY, CF_ANALYTICS_TOKEN));
write('methodology/index.html', methodologyPage(CF_ANALYTICS_TOKEN));
write('terms/index.html', termsPage(CF_ANALYTICS_TOKEN));
write('changelog/index.html', changelogPage(CF_ANALYTICS_TOKEN));
write('trending/index.html', trendingPage(CF_ANALYTICS_TOKEN));
write('api/index.html', apiDocsPage(CF_ANALYTICS_TOKEN));
write('pricing/index.html', pricingPage(CF_ANALYTICS_TOKEN));

// JSON / text files
write('openapi.json', JSON.stringify(openApiSpec, null, 2));
write('llms.txt', llmsTxt);
write('llms-full.txt', llmsFullTxt);
write('.well-known/ai-plugin.json', JSON.stringify(aiPluginManifest, null, 2));

// _headers — security headers for static assets (served without Worker)
// See: https://developers.cloudflare.com/workers/static-assets/headers/
const csp = [
  "default-src 'none'",
  "script-src 'self' https://challenges.cloudflare.com https://cdn.jsdelivr.net 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://img.shields.io",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

write('_headers', [
  '# Security headers for static assets (pages served without Worker invocation)',
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  `  Content-Security-Policy: ${csp}`,
  '',
].join('\n'));

// Client-side JS — served as static assets (ETag-cached, zero Worker cost)
const jsSrc = resolve(ROOT, 'src/js');
if (existsSync(jsSrc)) {
  const jsDest = resolve(OUT, 'js');
  rmSync(jsDest, { recursive: true, force: true });
  cpSync(jsSrc, jsDest, { recursive: true });
  console.log('  ✅ js/ (copied from src/js/)');
}

console.log(`\n✨ Done — static assets written to public/`);
