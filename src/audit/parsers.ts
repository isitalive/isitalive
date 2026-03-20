// ---------------------------------------------------------------------------
// Manifest parsers — extract dependency lists from go.mod and package.json
// ---------------------------------------------------------------------------

export interface ParsedDep {
  /** Package name: "lodash" (npm) or "github.com/zitadel/zitadel" (go) */
  name: string;
  /** Version constraint: "^4.17.0" or "v2.45.0" */
  version: string;
  /** Whether this is a dev/test dependency */
  dev: boolean;
  /** Source ecosystem */
  ecosystem: 'npm' | 'go';
}

// ---------------------------------------------------------------------------
// go.mod parser
// ---------------------------------------------------------------------------

/**
 * Parse a go.mod file and extract dependencies.
 * Handles both single-line `require` and block `require (...)` syntax.
 * Filters out Go stdlib (golang.org/toolchain, etc.) and indirect deps.
 */
export function parseGoMod(content: string): ParsedDep[] {
  const deps: ParsedDep[] = [];

  // Match block requires: require ( ... )
  const blockRe = /require\s*\(([\s\S]*?)\)/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(content)) !== null) {
    const block = match[1];
    for (const line of block.split('\n')) {
      const dep = parseGoRequireLine(line);
      if (dep) deps.push(dep);
    }
  }

  // Match single-line requires: require github.com/foo/bar v1.2.3
  // Must NOT match block syntax: require (
  const singleRe = /^require\s+(\S+)\s+(v\S+)/gm;
  while ((match = singleRe.exec(content)) !== null) {
    const name = match[1];
    const version = match[2];
    if (!isGoStdlib(name)) {
      deps.push({ name, version, dev: false, ecosystem: 'go' });
    }
  }

  // Deduplicate by name (keep first occurrence)
  const seen = new Set<string>();
  return deps.filter((d) => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

function parseGoRequireLine(line: string): ParsedDep | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;

  // Format: module/path v1.2.3 [// indirect]
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const name = parts[0];
  const version = parts[1];
  const isIndirect = trimmed.includes('// indirect');

  if (isGoStdlib(name)) return null;

  return { name, version, dev: isIndirect, ecosystem: 'go' };
}

/** Go stdlib and toolchain modules to skip */
function isGoStdlib(name: string): boolean {
  return (
    name === 'go' ||
    name.startsWith('toolchain') ||
    name === 'golang.org/toolchain' ||
    // Standard library modules moved to modules in Go 1.21+
    (name.startsWith('golang.org/') && !name.startsWith('golang.org/x/'))
  );
}

// ---------------------------------------------------------------------------
// package.json parser
// ---------------------------------------------------------------------------

/**
 * Parse a package.json and extract dependencies.
 * Merges `dependencies` and `devDependencies` with proper flags.
 */
export function parsePackageJson(content: string): ParsedDep[] {
  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(content);
  } catch {
    throw new Error('Invalid package.json: could not parse JSON');
  }

  const deps: ParsedDep[] = [];

  const prodDeps = pkg.dependencies || {};
  for (const [name, version] of Object.entries(prodDeps)) {
    deps.push({
      name,
      version: String(version),
      dev: false,
      ecosystem: 'npm',
    });
  }

  const devDeps = pkg.devDependencies || {};
  for (const [name, version] of Object.entries(devDeps)) {
    deps.push({
      name,
      version: String(version),
      dev: true,
      ecosystem: 'npm',
    });
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Format detection + dispatch
// ---------------------------------------------------------------------------

export type ManifestFormat = 'go.mod' | 'package.json';

export function parseManifest(format: ManifestFormat, content: string): ParsedDep[] {
  switch (format) {
    case 'go.mod':
      return parseGoMod(content);
    case 'package.json':
      return parsePackageJson(content);
    default:
      throw new Error(`Unsupported format: ${format}. Supported: go.mod, package.json`);
  }
}
