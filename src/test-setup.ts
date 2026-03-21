// ---------------------------------------------------------------------------
// fast-check global configuration — respects FC_NUM_RUNS env var
//
// In CI or local extended runs, set FC_NUM_RUNS to increase iterations:
//   FC_NUM_RUNS=10000 npm run test:fuzz
// ---------------------------------------------------------------------------

import fc from 'fast-check'

const numRuns = process.env.FC_NUM_RUNS ? parseInt(process.env.FC_NUM_RUNS, 10) : undefined

if (numRuns && numRuns > 0) {
  fc.configureGlobal({ numRuns })
}
