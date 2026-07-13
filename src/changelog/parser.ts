// ---------------------------------------------------------------------------
// Changelog parser — transforms Keep a Changelog markdown into structured JSON
//
// Parses the standard format:
//   ## [version] - date
//   ## [version](compare-url) (date)  (Release Please)
//   ### Added/Changed/Deprecated/Removed/Fixed/Security/Breaking Changes
//   - entry text (or * entry text)
// ---------------------------------------------------------------------------

export interface ChangeEntry {
  type: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security' | 'breaking';
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
  deprecated: 'deprecated',
  removed: 'removed',
  fixed: 'fixed',
  security: 'security',
  'breaking changes': 'breaking',
  '⚠ breaking changes': 'breaking',
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
    // ## [0.3.0](compare-url) (2026-03-20)  (Release Please)
    // ## [Unreleased]
    const versionMatch = line.match(
      /^##\s+\[([^\]]+)\](?:\([^)]*\))?\s*(?:-\s*(.+)|\((\d{4}-\d{2}-\d{2})\))?$/,
    );
    if (versionMatch) {
      if (current) versions.push(current);
      current = {
        version: versionMatch[1],
        date: (versionMatch[2] ?? versionMatch[3] ?? '').trim(),
        entries: [],
      };
      currentType = null;
      continue;
    }

    // Supported Keep a Changelog and Release Please section headings.
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      const key = sectionMatch[1].toLowerCase().trim();
      currentType = TYPE_MAP[key] ?? null;
      continue;
    }

    // - Entry text / * Release Please entry text
    const entryMatch = line.match(/^[-*]\s+(.+)$/);
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
