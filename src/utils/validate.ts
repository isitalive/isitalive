// ---------------------------------------------------------------------------
// Shared validation utilities
// ---------------------------------------------------------------------------

/**
 * Validate URL path params — only allow valid GitHub-style identifiers.
 * Blocks XSS / path-traversal payloads in owner/repo params.
 */
export function isValidParam(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value) && value.length <= 100
}
