// ---------------------------------------------------------------------------
// Register .md loader — import this before running build-static.ts
// Usage: npx tsx --import ./scripts/register-md.mjs scripts/build-static.ts
// ---------------------------------------------------------------------------

import { register } from 'node:module';
register('./md-loader.mjs', import.meta.url);
