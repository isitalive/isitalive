// ---------------------------------------------------------------------------
// Shared HTML utilities
// ---------------------------------------------------------------------------

/**
 * Escape HTML entities to prevent XSS when interpolating strings into templates.
 *
 * Neutralizes: & < > " (the four metacharacters that can break out of
 * HTML text content or attribute values).
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
