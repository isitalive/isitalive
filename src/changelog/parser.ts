// ---------------------------------------------------------------------------
// Changelog parser — transforms Keep a Changelog markdown into structured JSON
//
// Parses the standard format:
//   ## [version] - date
//   ### Added/Changed/Fixed/Removed
//   - entry text
// ---------------------------------------------------------------------------

export interface ChangeEntry {
  type: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security';
  text: string;
}

export interface Version {
  version: string;
  date: string;
  entries: ChangeEntry[];
}

// Full Keep a Changelog section vocabulary. Any heading outside this set is
// dropped from the rendered page, so keep it in sync with the changelog.
const TYPE_MAP: Record<string, ChangeEntry['type']> = {
  added: 'added',
  changed: 'changed',
  deprecated: 'deprecated',
  removed: 'removed',
  fixed: 'fixed',
  security: 'security',
};

/**
 * Parse a Keep a Changelog markdown string into structured versions.
 */
export function parseChangelog(markdown: string): Version[] {
  const versions: Version[] = [];
  let current: Version | null = null;
  let currentType: ChangeEntry['type'] | null = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();

    // ## [0.3.0] - 2026-03-20  (dated release)
    // ## [Unreleased]          (date optional — in-progress section)
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s*(?:-\s*(.+))?$/);
    if (versionMatch) {
      const version = versionMatch[1].trim();
      const date = (versionMatch[2] ?? '').trim();
      // A missing date is only valid for the in-progress [Unreleased] section.
      // Any other dateless heading is malformed — leave the current version
      // context untouched rather than open a broken, dateless release card.
      if (!date && version !== 'Unreleased') continue;
      if (current) versions.push(current);
      current = { version, date, entries: [] };
      currentType = null;
      continue;
    }

    // ### Added / Changed / Fixed / Removed
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      const key = sectionMatch[1].toLowerCase().trim();
      currentType = TYPE_MAP[key] ?? null;
      continue;
    }

    // - Entry text
    const entryMatch = line.match(/^-\s+(.+)$/);
    if (entryMatch && current && currentType) {
      current.entries.push({
        type: currentType,
        text: entryMatch[1],
      });
    }
  }

  if (current) versions.push(current);
  return versions;
}
