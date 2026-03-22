// ---------------------------------------------------------------------------
// Custom ESM loader for .md files — exports the file content as a string.
// Used by scripts/build-static.ts (run via tsx) to replicate wrangler's
// [[rules]] { type = "Text", globs = ["**/*.md"] } behavior in Node.js.
//
// Usage: node --import ./scripts/md-loader.mjs scripts/build-static.ts
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @param {string} specifier */
/** @param {{ parentURL?: string }} context */
/** @param {Function} nextResolve */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.md')) {
    // Pass through to default resolution but tag with our custom format
    const resolved = await nextResolve(specifier, context);
    return { ...resolved, format: 'module' };
  }
  return nextResolve(specifier, context);
}

/** @param {string} url */
/** @param {{ format?: string }} context */
/** @param {Function} nextLoad */
export async function load(url, context, nextLoad) {
  if (url.endsWith('.md')) {
    const path = fileURLToPath(url);
    const content = readFileSync(path, 'utf-8');
    // Export the markdown content as a default export string
    const source = `export default ${JSON.stringify(content)};`;
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
