// ---------------------------------------------------------------------------
// Manifest parsers — extract dependency lists from manifests and lockfiles
// ---------------------------------------------------------------------------

import { parse as parseYaml } from 'yaml';
import { parse as parseYarnLock } from '@yarnpkg/lockfile';
import { parse as parseToml } from 'smol-toml';

export type ManifestFormat =
  | 'go.mod'
  | 'go.sum'
  | 'package.json'
  | 'package-lock.json'
  | 'pnpm-lock.yaml'
  | 'yarn.lock'
  | 'requirements.txt'
  | 'pyproject.toml';

export type DependencyType = 'direct' | 'dev' | 'transitive';

export type ParsedEcosystem = 'npm' | 'go' | 'pypi' | 'github' | 'unsupported';

export interface ParsedDep {
  /** Package name: "lodash" (npm) or "github.com/zitadel/zitadel" (go) */
  name: string;
  /** Version constraint: "^4.17.0" or "v2.45.0" */
  version: string;
  /** Whether this is a dev/test dependency */
  dev: boolean;
  /** Source ecosystem */
  ecosystem: ParsedEcosystem;
  /** Direct, dev, or transitive dependency context */
  dependencyType: DependencyType;
  /** Source manifest or lockfile format */
  sourceFormat?: ManifestFormat | 'batch';
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

  // Match single-line requires: require github.com/foo/bar v1.2.3 [// indirect]
  // Must NOT match block syntax: require (
  const singleRe = /^require\s+(.+)$/gm;
  while ((match = singleRe.exec(content)) !== null) {
    const dep = parseGoRequireLine(match[1]);
    if (dep) deps.push(dep);
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

  return makeDep({
    name,
    version,
    dev: isIndirect,
    ecosystem: 'go',
    dependencyType: isIndirect ? 'transitive' : 'direct',
    sourceFormat: 'go.mod',
  });
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
// go.sum parser
// ---------------------------------------------------------------------------

export function parseGoSum(content: string): ParsedDep[] {
  const deps: ParsedDep[] = [];
  const seen = new Set<string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, rawVersion] = trimmed.split(/\s+/);
    if (!name || !rawVersion) continue;
    const version = rawVersion.replace(/\/go\.mod$/, '');
    if (isGoStdlib(name)) continue;
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deps.push(makeDep({
      name,
      version,
      dev: true,
      ecosystem: 'go',
      dependencyType: 'transitive',
      sourceFormat: 'go.sum',
    }));
  }

  return deps;
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
      dependencyType: 'direct',
      sourceFormat: 'package.json',
    });
  }

  const devDeps = pkg.devDependencies || {};
  for (const [name, version] of Object.entries(devDeps)) {
    deps.push({
      name,
      version: String(version),
      dev: true,
      ecosystem: 'npm',
      dependencyType: 'dev',
      sourceFormat: 'package.json',
    });
  }

  return deps;
}

// ---------------------------------------------------------------------------
// npm lockfile parsers
// ---------------------------------------------------------------------------

export function parsePackageLock(content: string): ParsedDep[] {
  let lock: any;
  try {
    lock = JSON.parse(content);
  } catch {
    throw new Error('Invalid package-lock.json: could not parse JSON');
  }

  if (lock?.packages && typeof lock.packages === 'object') {
    const deps: ParsedDep[] = [];
    const root = lock.packages[''] && typeof lock.packages[''] === 'object' ? lock.packages[''] : {};
    const rootProd = new Set(Object.keys(root.dependencies ?? {}));
    const rootDev = new Set(Object.keys(root.devDependencies ?? {}));
    const rootOptional = new Set(Object.keys(root.optionalDependencies ?? {}));
    for (const [path, entry] of Object.entries(lock.packages) as Array<[string, any]>) {
      if (!path || !entry || typeof entry !== 'object') continue;
      const name = packageNameFromNodeModulesPath(path);
      const version = typeof entry.version === 'string' ? entry.version : '';
      if (!name || !version) continue;
      const rootPath = isRootNodeModulesPath(path, name);
      const depType = Boolean(entry.dev)
        ? 'dev'
        : rootPath && rootDev.has(name)
        ? 'dev'
        : rootPath && (rootProd.has(name) || rootOptional.has(name))
          ? 'direct'
          : 'transitive';
      deps.push(makeNpmLockDep(name, version, depType, 'package-lock.json'));
    }
    return dedupeDeps(deps);
  }

  if (lock?.dependencies && typeof lock.dependencies === 'object') {
    return dedupeDeps(flattenPackageLockV1(lock.dependencies, false));
  }

  return [];
}

function flattenPackageLockV1(dependencies: Record<string, any>, parentDev: boolean): ParsedDep[] {
  const deps: ParsedDep[] = [];
  for (const [name, entry] of Object.entries(dependencies)) {
    if (!entry || typeof entry !== 'object') continue;
    const dev = Boolean((entry as any).dev) || parentDev;
    const version = typeof (entry as any).version === 'string' ? (entry as any).version : '';
    if (version) deps.push(makeNpmLockDep(name, version, dev ? 'dev' : 'transitive', 'package-lock.json'));
    if ((entry as any).dependencies && typeof (entry as any).dependencies === 'object') {
      deps.push(...flattenPackageLockV1((entry as any).dependencies, dev));
    }
  }
  return deps;
}

export function parsePnpmLock(content: string): ParsedDep[] {
  let lock: any;
  try {
    lock = parseYaml(content);
  } catch {
    throw new Error('Invalid pnpm-lock.yaml: could not parse YAML');
  }

  if (!lock || typeof lock !== 'object') return [];

  const direct = collectPnpmImporterDeps(lock.importers, 'dependencies');
  const dev = collectPnpmImporterDeps(lock.importers, 'devDependencies');
  const optional = collectPnpmImporterDeps(lock.importers, 'optionalDependencies');
  const packages = {
    ...(lock.packages && typeof lock.packages === 'object' ? lock.packages : {}),
    ...(lock.snapshots && typeof lock.snapshots === 'object' ? lock.snapshots : {}),
  };

  const deps: ParsedDep[] = [];
  for (const [rawKey, entry] of Object.entries(packages) as Array<[string, any]>) {
    const parsed = parsePnpmPackageKey(rawKey);
    if (!parsed) continue;
    const depType = dev.has(parsed.name)
      ? 'dev'
      : direct.has(parsed.name) || optional.has(parsed.name)
        ? 'direct'
        : 'transitive';
    deps.push(makeDep({
      name: parsed.name,
      version: parsed.version,
      dev: depType !== 'direct',
      ecosystem: 'npm',
      dependencyType: depType,
      sourceFormat: 'pnpm-lock.yaml',
    }));
    void entry;
  }

  return dedupeDeps(deps);
}

function collectPnpmImporterDeps(importers: unknown, field: 'dependencies' | 'devDependencies' | 'optionalDependencies'): Set<string> {
  const names = new Set<string>();
  if (!importers || typeof importers !== 'object') return names;
  for (const importer of Object.values(importers as Record<string, any>)) {
    const deps = importer?.[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const name of Object.keys(deps)) names.add(name);
  }
  return names;
}

export function parseYarnLockFile(content: string): ParsedDep[] {
  const parsed = parseYarnLock(content);
  if (parsed.type === 'conflict') {
    throw new Error('Invalid yarn.lock: conflict markers present');
  }

  const deps: ParsedDep[] = [];
  for (const [descriptor, entry] of Object.entries(parsed.object)) {
    const name = packageNameFromYarnDescriptor(descriptor);
    const version = entry.version ?? '';
    if (!name || !version) continue;
    deps.push(makeDep({
      name,
      version,
      dev: true,
      ecosystem: 'npm',
      dependencyType: 'transitive',
      sourceFormat: 'yarn.lock',
    }));
  }

  return dedupeDeps(deps);
}

function makeNpmLockDep(
  name: string,
  version: string,
  dependencyType: DependencyType,
  sourceFormat: Extract<ManifestFormat, 'package-lock.json'>,
): ParsedDep {
  return makeDep({
    name,
    version,
    dev: dependencyType !== 'direct',
    ecosystem: 'npm',
    dependencyType,
    sourceFormat,
  });
}

function makeDep(dep: ParsedDep): ParsedDep {
  return dep;
}

function packageNameFromNodeModulesPath(path: string): string | null {
  const marker = 'node_modules/';
  const index = path.lastIndexOf(marker);
  const tail = index >= 0 ? path.slice(index + marker.length) : path;
  if (!tail) return null;
  const segments = tail.split('/');
  if (segments[0]?.startsWith('@') && segments[1]) return `${segments[0]}/${segments[1]}`;
  return segments[0] || null;
}

function isRootNodeModulesPath(path: string, name: string): boolean {
  return path === `node_modules/${name}`;
}

function parsePnpmPackageKey(rawKey: string): { name: string; version: string } | null {
  const normalized = rawKey
    .replace(/^\/+/, '')
    .replace(/\(.+\)$/, '');
  const key = normalized.includes('_') ? normalized.split('_')[0] : normalized;
  const atIndex = key.lastIndexOf('@');
  if (atIndex <= 0) return null;
  const name = key.slice(0, atIndex);
  const version = key.slice(atIndex + 1).replace(/^npm:/, '');
  if (!name || !version) return null;
  return { name, version };
}

function packageNameFromYarnDescriptor(descriptor: string): string | null {
  const first = descriptor.split(',')[0].trim().replace(/^"|"$/g, '');
  const atIndex = first.startsWith('@')
    ? first.indexOf('@', 1)
    : first.indexOf('@');
  if (atIndex <= 0) return null;
  const name = first.slice(0, atIndex);
  return name || null;
}

function dedupeDeps(deps: ParsedDep[]): ParsedDep[] {
  const seen = new Set<string>();
  return deps.filter((dep) => {
    const key = `${dep.ecosystem}:${dep.name}:${dep.version}:${dep.dependencyType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Python parsers — requirements.txt and pyproject.toml
// ---------------------------------------------------------------------------

/** PEP 503 name normalization: lowercase, runs of -_. collapse to a hyphen */
export function normalizePypiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Parse a single PEP 508 requirement string into a dep.
 * Handles extras (`name[extra]`), version specifiers, environment markers
 * (`; python_version < "3.11"`), and direct URL references (`name @ url`).
 * Returns null for lines that don't declare a named package.
 */
export function parsePep508(spec: string, dev = false, sourceFormat: ManifestFormat = 'requirements.txt'): ParsedDep | null {
  // Strip environment markers and comments
  const base = spec.split(';')[0].split('#')[0].trim();
  if (!base) return null;

  // name[extras] @ url  |  name[extras] (specifier)  |  name[extras] specifier
  const match = base.match(/^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\s*(?:\[[^\]]*\])?\s*(.*)$/);
  if (!match) return null;

  const name = normalizePypiName(match[1]);
  let version = '';
  const rest = match[2].trim();
  if (rest && !rest.startsWith('@')) {
    // Version specifier: strip parentheses, keep the raw constraint
    version = rest.replace(/^\(|\)$/g, '').trim();
  }

  return makeDep({
    name,
    version,
    dev,
    ecosystem: 'pypi',
    dependencyType: dev ? 'dev' : 'direct',
    sourceFormat,
  });
}

/**
 * Parse a requirements.txt file (pip requirements format).
 * Skips comments, pip options (-r, -e, --index-url, ...), bare URLs,
 * and local paths — only named PEP 508 requirements are returned.
 */
export function parseRequirementsTxt(content: string): ParsedDep[] {
  const deps: ParsedDep[] = [];

  // Join backslash line continuations before splitting into logical lines
  const logical = content.replace(/\\\r?\n/g, ' ');

  for (const line of logical.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // pip options: -r other.txt, -e ., --index-url, --hash, etc.
    if (trimmed.startsWith('-')) continue;
    // Bare URLs and local paths have no registry name to resolve
    if (/^(https?|git\+|file:)/i.test(trimmed) || trimmed.startsWith('.') || trimmed.startsWith('/')) continue;

    const dep = parsePep508(trimmed);
    if (dep) deps.push(dep);
  }

  return dedupeDeps(deps);
}

/**
 * Parse a pyproject.toml and extract dependencies.
 * Supports PEP 621 (`[project] dependencies` + `[project.optional-dependencies]`)
 * and Poetry (`[tool.poetry.dependencies]`, dependency groups, and legacy
 * `[tool.poetry.dev-dependencies]`).
 */
export function parsePyprojectToml(content: string): ParsedDep[] {
  let doc: Record<string, any>;
  try {
    doc = parseToml(content) as Record<string, any>;
  } catch {
    throw new Error('Invalid pyproject.toml: could not parse TOML');
  }

  const deps: ParsedDep[] = [];

  // ── PEP 621 ────────────────────────────────────────────────────────
  const project = doc.project;
  if (project && typeof project === 'object') {
    for (const spec of asStringArray(project.dependencies)) {
      const dep = parsePep508(spec, false, 'pyproject.toml');
      if (dep) deps.push(dep);
    }
    const optional = project['optional-dependencies'];
    if (optional && typeof optional === 'object') {
      for (const specs of Object.values(optional)) {
        for (const spec of asStringArray(specs)) {
          const dep = parsePep508(spec, true, 'pyproject.toml');
          if (dep) deps.push(dep);
        }
      }
    }
  }

  // ── Poetry ─────────────────────────────────────────────────────────
  const poetry = doc.tool?.poetry;
  if (poetry && typeof poetry === 'object') {
    deps.push(...parsePoetryTable(poetry.dependencies, false));
    deps.push(...parsePoetryTable(poetry['dev-dependencies'], true));
    if (poetry.group && typeof poetry.group === 'object') {
      for (const group of Object.values(poetry.group as Record<string, any>)) {
        deps.push(...parsePoetryTable(group?.dependencies, true));
      }
    }
  }

  return dedupeDeps(deps);
}

/** Poetry dependency tables: name = "^1.0" or name = { version = "^1.0", ... } */
function parsePoetryTable(table: unknown, dev: boolean): ParsedDep[] {
  const deps: ParsedDep[] = [];
  if (!table || typeof table !== 'object') return deps;

  for (const [rawName, value] of Object.entries(table as Record<string, unknown>)) {
    const name = normalizePypiName(rawName);
    if (name === 'python') continue; // interpreter constraint, not a package
    let version = '';
    if (typeof value === 'string') {
      version = value;
    } else if (value && typeof value === 'object') {
      const spec = value as { version?: unknown; git?: unknown; path?: unknown; url?: unknown };
      // Git/path/url deps have no PyPI registry entry to resolve
      if (typeof spec.version === 'string') version = spec.version;
      else if (spec.git || spec.path || spec.url) continue;
    }
    deps.push(makeDep({
      name,
      version,
      dev,
      ecosystem: 'pypi',
      dependencyType: dev ? 'dev' : 'direct',
      sourceFormat: 'pyproject.toml',
    }));
  }

  return deps;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

// ---------------------------------------------------------------------------
// Format detection + dispatch
// ---------------------------------------------------------------------------

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
      return parseYarnLockFile(content);
    case 'requirements.txt':
      return parseRequirementsTxt(content);
    case 'pyproject.toml':
      return parsePyprojectToml(content);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
