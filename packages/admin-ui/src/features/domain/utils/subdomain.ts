// features/domain/utils/subdomain.ts — Subdomain slug utilities

/**
 * Convert an app name to a valid DNS subdomain label.
 * - Lowercases the string
 * - Replaces non-alphanumeric chars (except hyphens) with hyphens
 * - Collapses consecutive hyphens into one
 * - Trims leading and trailing hyphens
 * - Truncates to 63 characters (RFC 1035 label limit)
 */
export function toSubdomainSlug(appName: string): string {
  return appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * Validate a subdomain label against RFC 1035 rules.
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateSubdomainLabel(s: string): { valid: boolean; error?: string } {
  // "@" = apex/root domain connection — bypasses DNS label rules
  if (s === '@') return { valid: true };
  if (!s || s.length === 0) {
    return { valid: false, error: 'Subdomain cannot be empty' };
  }
  if (s.length > 63) {
    return { valid: false, error: 'Subdomain must be 63 characters or fewer' };
  }
  if (/[A-Z]/.test(s)) {
    return { valid: false, error: 'Subdomain must be lowercase' };
  }
  if (/\s/.test(s)) {
    return { valid: false, error: 'Subdomain cannot contain spaces' };
  }
  if (s.startsWith('-')) {
    return { valid: false, error: 'Subdomain cannot start with a hyphen' };
  }
  if (s.endsWith('-')) {
    return { valid: false, error: 'Subdomain cannot end with a hyphen' };
  }
  if (!/^[a-z0-9-]+$/.test(s)) {
    return { valid: false, error: 'Subdomain must contain only lowercase letters, numbers, and hyphens' };
  }
  return { valid: true };
}
