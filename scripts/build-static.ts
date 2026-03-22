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

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'public');

// ── Load tokens from environment or .dev.vars ──────────────────────────

function loadDevVars(): Record<string, string> {
  const devVarsPath = resolve(ROOT, '.dev.vars');
  if (!existsSync(devVarsPath)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(devVarsPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const devVars = loadDevVars();
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || devVars.TURNSTILE_SITE_KEY || '';
const CF_ANALYTICS_TOKEN = process.env.CF_ANALYTICS_TOKEN || devVars.CF_ANALYTICS_TOKEN || '';

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

// JSON / text files
write('openapi.json', JSON.stringify(openApiSpec, null, 2));
write('llms.txt', llmsTxt);
write('llms-full.txt', llmsFullTxt);
write('.well-known/ai-plugin.json', JSON.stringify(aiPluginManifest, null, 2));

console.log(`\n✨ Done — ${10} static files written to public/`);
