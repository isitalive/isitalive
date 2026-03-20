// ---------------------------------------------------------------------------
// Changelog parser — transforms Keep a Changelog markdown into structured JSON
//
// Parses the standard format:
//   ## [version] - date
//   ### Added/Changed/Fixed/Removed
//   - entry text
// ---------------------------------------------------------------------------

export interface ChangeEntry {
  type: 'added' | 'changed' | 'fixed' | 'removed';
  text: string;
}

export interface Version {
  version: string;
  date: string;
  entries: ChangeEntry[];
}

const TYPE_MAP: Record<string, ChangeEntry['type']> = {
  added: 'added',
  changed: 'changed',
  fixed: 'fixed',
  removed: 'removed',
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

    // ## [0.3.0] - 2026-03-20
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s*-\s*(.+)$/);
    if (versionMatch) {
      if (current) versions.push(current);
      current = {
        version: versionMatch[1],
        date: versionMatch[2].trim(),
        entries: [],
      };
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
