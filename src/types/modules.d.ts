// Type declarations for non-code module imports

declare module '*.md' {
  const content: string;
  export default content;
}

declare module '@yarnpkg/lockfile' {
  export function parse(content: string): {
    type: 'success' | 'merge' | 'conflict'
    object: Record<string, {
      version?: string
      resolved?: string
      dependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }>
  }
}
