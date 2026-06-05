// ---------------------------------------------------------------------------
// Manifest parsers — extract dependency lists from supported manifest files
// ---------------------------------------------------------------------------

import YAML from 'yaml'

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

function dedupeDeps(deps: ParsedDep[]): ParsedDep[] {
  const byName = new Map<string, ParsedDep>();

  for (const dep of deps) {
    const existing = byName.get(dep.name);
    if (!existing) {
      byName.set(dep.name, dep);
      continue;
    }

    // Prefer production/direct evidence over dev/indirect/transitive evidence.
    if (existing.dev && !dep.dev) {
      byName.set(dep.name, dep);
      continue;
    }

    if (!existing.version && dep.version) {
      byName.set(dep.name, dep);
    }
  }

  return Array.from(byName.values());
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

  return dedupeDeps(deps);
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

  return dedupeDeps(deps);
}

// ---------------------------------------------------------------------------
// package-lock.json parser
// ---------------------------------------------------------------------------

export function parsePackageLock(content: string): ParsedDep[] {
  let lock: Record<string, any>;
  try {
    lock = JSON.parse(content);
  } catch {
    throw new Error('Invalid package-lock.json: could not parse JSON');
  }

  const deps: ParsedDep[] = [];

  if (lock.packages && typeof lock.packages === 'object') {
    for (const [path, entry] of Object.entries(lock.packages) as Array<[string, any]>) {
      if (!path || !path.includes('node_modules/')) continue;
      const name = packageNameFromNodeModulesPath(path);
      if (!name) continue;
      deps.push({
        name,
        version: String(entry?.version ?? ''),
        dev: entry?.dev === true || entry?.devOptional === true,
        ecosystem: 'npm',
      });
    }
  }

  if (deps.length === 0 && lock.dependencies && typeof lock.dependencies === 'object') {
    collectPackageLockV1Deps(lock.dependencies, deps, false);
  }

  return dedupeDeps(deps);
}

function packageNameFromNodeModulesPath(path: string): string | null {
  const parts = path.split('node_modules/').filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];
  const segments = last.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  return segments[0].startsWith('@') && segments.length >= 2
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
}

function collectPackageLockV1Deps(
  entries: Record<string, any>,
  deps: ParsedDep[],
  inheritedDev: boolean,
) {
  for (const [name, entry] of Object.entries(entries)) {
    const dep = entry as any;
    const dev = inheritedDev || dep?.dev === true;
    deps.push({
      name,
      version: String(dep?.version ?? ''),
      dev,
      ecosystem: 'npm',
    });
    if (dep?.dependencies && typeof dep.dependencies === 'object') {
      collectPackageLockV1Deps(dep.dependencies, deps, dev);
    }
  }
}

// ---------------------------------------------------------------------------
// pnpm-lock.yaml parser
// ---------------------------------------------------------------------------

export function parsePnpmLock(content: string): ParsedDep[] {
  let lock: any;
  try {
    lock = YAML.parse(content) ?? {};
  } catch {
    throw new Error('Invalid pnpm-lock.yaml: could not parse YAML');
  }

  const deps: ParsedDep[] = [];
  const importers = lock.importers && typeof lock.importers === 'object' ? lock.importers : {};
  for (const importer of Object.values(importers) as any[]) {
    collectPnpmImporterDeps(importer?.dependencies, deps, false);
    collectPnpmImporterDeps(importer?.optionalDependencies, deps, false);
    collectPnpmImporterDeps(importer?.devDependencies, deps, true);
  }

  const packages = lock.packages && typeof lock.packages === 'object' ? lock.packages : {};
  for (const [key, entry] of Object.entries(packages) as Array<[string, any]>) {
    const parsed = parsePnpmPackageKey(key);
    if (!parsed) continue;
    deps.push({
      name: parsed.name,
      version: String(entry?.version ?? parsed.version ?? ''),
      dev: entry?.dev === true,
      ecosystem: 'npm',
    });
  }

  return dedupeDeps(deps);
}

function collectPnpmImporterDeps(entries: any, deps: ParsedDep[], dev: boolean) {
  if (!entries || typeof entries !== 'object') return;
  for (const [name, spec] of Object.entries(entries) as Array<[string, any]>) {
    deps.push({
      name,
      version: typeof spec === 'object' && spec !== null
        ? String(spec.version ?? spec.specifier ?? '')
        : String(spec ?? ''),
      dev,
      ecosystem: 'npm',
    });
  }
}

function parsePnpmPackageKey(key: string): { name: string; version: string } | null {
  const normalized = key.replace(/^\//, '').split('(')[0].split('_')[0];
  const atIndex = normalized.startsWith('@')
    ? normalized.lastIndexOf('@')
    : normalized.indexOf('@');
  if (atIndex <= 0) return null;
  return {
    name: normalized.slice(0, atIndex),
    version: normalized.slice(atIndex + 1),
  };
}

// ---------------------------------------------------------------------------
// yarn.lock parser
// ---------------------------------------------------------------------------

export function parseYarnLock(content: string): ParsedDep[] {
  if (content.includes('__metadata:') || /^[^#\n][\s\S]*:\n\s+version:/m.test(content)) {
    const modern = parseModernYarnLock(content);
    if (modern.length > 0) return modern;
  }
  return parseYarnV1Lock(content);
}

function parseModernYarnLock(content: string): ParsedDep[] {
  let lock: any;
  try {
    lock = YAML.parse(content) ?? {};
  } catch {
    return [];
  }

  const deps: ParsedDep[] = [];
  for (const [descriptor, entry] of Object.entries(lock) as Array<[string, any]>) {
    if (descriptor === '__metadata') continue;
    const name = packageNameFromYarnDescriptor(descriptor);
    if (!name) continue;
    deps.push({
      name,
      version: String(entry?.version ?? ''),
      dev: false,
      ecosystem: 'npm',
    });
  }
  return dedupeDeps(deps);
}

function parseYarnV1Lock(content: string): ParsedDep[] {
  const deps: ParsedDep[] = [];
  let pendingNames: string[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ') && line.endsWith(':')) {
      pendingNames = line
        .slice(0, -1)
        .split(/,\s*/)
        .map((descriptor) => packageNameFromYarnDescriptor(descriptor.trim().replace(/^"|"$/g, '')))
        .filter((name): name is string => Boolean(name));
      continue;
    }

    const versionMatch = line.match(/^\s+version\s+"?([^"\s]+)"?/);
    if (versionMatch && pendingNames.length > 0) {
      for (const name of pendingNames) {
        deps.push({
          name,
          version: versionMatch[1],
          dev: false,
          ecosystem: 'npm',
        });
      }
      pendingNames = [];
    }
  }

  return dedupeDeps(deps);
}

function packageNameFromYarnDescriptor(descriptor: string): string | null {
  const cleaned = descriptor.replace(/^"|"$/g, '');
  const npmProtocolIndex = cleaned.indexOf('@npm:');
  if (npmProtocolIndex > 0) return cleaned.slice(0, npmProtocolIndex);

  if (cleaned.startsWith('@')) {
    const slash = cleaned.indexOf('/');
    if (slash === -1) return null;
    const versionAt = cleaned.indexOf('@', slash);
    return versionAt === -1 ? cleaned : cleaned.slice(0, versionAt);
  }

  const at = cleaned.indexOf('@');
  return at === -1 ? cleaned : cleaned.slice(0, at);
}

// ---------------------------------------------------------------------------
// go.sum parser
// ---------------------------------------------------------------------------

export function parseGoSum(content: string): ParsedDep[] {
  const deps: ParsedDep[] = [];
  for (const line of content.split('\n')) {
    const [name, version] = line.trim().split(/\s+/);
    if (!name || !version || version.endsWith('/go.mod') || isGoStdlib(name)) continue;
    deps.push({
      name,
      version,
      dev: true,
      ecosystem: 'go',
    });
  }
  return dedupeDeps(deps);
}

// ---------------------------------------------------------------------------
// Format detection + dispatch
// ---------------------------------------------------------------------------

export type ManifestFormat =
  | 'go.mod'
  | 'go.sum'
  | 'package.json'
  | 'package-lock.json'
  | 'pnpm-lock.yaml'
  | 'yarn.lock';

export function parseManifest(format: ManifestFormat, content: string): ParsedDep[] {
  switch (format) {
    case 'go.mod':
      return parseGoMod(content);
    case 'go.sum':
      return parseGoSum(content);
    case 'package.json':
      return parsePackageJson(content);
    case 'package-lock.json':
      return parsePackageLock(content);
    case 'pnpm-lock.yaml':
      return parsePnpmLock(content);
    case 'yarn.lock':
      return parseYarnLock(content);
    default:
      throw new Error(`Unsupported format: ${format}. Supported: go.mod, go.sum, package.json, package-lock.json, pnpm-lock.yaml, yarn.lock`);
  }
}
