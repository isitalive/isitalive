// ---------------------------------------------------------------------------
// GitHub App — manifest file detector
//
// Given a list of changed files in a PR, identify supported dependency
// manifests and lockfiles. Returns the detected manifests with
// their format and path.
// ---------------------------------------------------------------------------

import type { ManifestFormat } from '../audit/parsers';
import type { PullRequestFile } from './types';

export interface DetectedManifest {
  /** The file path in the repo */
  path: string;
  /** The isitalive manifest format */
  format: ManifestFormat;
}

/**
 * Supported manifest filenames and their corresponding format.
 * Only root-level manifests are matched — nested node_modules, vendor,
 * and test fixture manifests are ignored.
 */
const MANIFEST_PATTERNS: Array<{ basename: string; format: ManifestFormat }> = [
  { basename: 'package.json', format: 'package.json' },
  { basename: 'package-lock.json', format: 'package-lock.json' },
  { basename: 'pnpm-lock.yaml', format: 'pnpm-lock.yaml' },
  { basename: 'yarn.lock', format: 'yarn.lock' },
  { basename: 'go.mod', format: 'go.mod' },
  { basename: 'go.sum', format: 'go.sum' },
];

/** Directories that should be excluded from manifest detection */
const EXCLUDED_DIRS = [
  'node_modules/',
  'vendor/',
  'testdata/',
  'test/fixtures/',
  'tests/fixtures/',
  '__tests__/',
  '__mocks__/',
  '.git/',
];

/**
 * Detect manifest files from a list of PR changed files.
 *
 * Rules:
 * - Only files that were added or modified (not deleted)
 * - Only known manifest basenames
 * - Exclude files nested inside ignored directories
 */
export function detectManifests(files: PullRequestFile[]): DetectedManifest[] {
  const manifests: DetectedManifest[] = [];

  for (const file of files) {
    // Skip deleted files — no content to audit
    if (file.status === 'removed') continue;

    // Check if path is in an excluded directory
    if (EXCLUDED_DIRS.some(dir => file.filename.includes(dir))) continue;

    // Match against known manifest basenames
    const basename = file.filename.split('/').pop() ?? '';
    const pattern = MANIFEST_PATTERNS.find(p => p.basename === basename);

    if (pattern) {
      manifests.push({
        path: file.filename,
        format: pattern.format,
      });
    }
  }

  return manifests;
}
