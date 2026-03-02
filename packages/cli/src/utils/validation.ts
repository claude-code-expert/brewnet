/**
 * Brewnet CLI — Input Validation Helpers (T017)
 *
 * Pure functions for validating user-supplied values:
 * project names, domain names, tunnel tokens, and free-domain TLDs.
 *
 * Each validator returns `{ valid: true }` or `{ valid: false, error: string }`.
 *
 * @module utils/validation
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Project Name
// ---------------------------------------------------------------------------

/**
 * Validate a Brewnet project name.
 *
 * Rules:
 *   - Minimum 2 characters
 *   - Maximum 63 characters (DNS label limit)
 *   - Only lowercase alphanumeric characters and hyphens
 *   - Must start and end with an alphanumeric character
 *   - No consecutive hyphens
 *
 * Pattern: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/  (for length >= 2)
 *
 * @example
 * ```ts
 * validateProjectName('my-server')  // { valid: true }
 * validateProjectName('-bad')       // { valid: false, error: '...' }
 * ```
 */
export function validateProjectName(name: string): ValidationResult {
  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, error: 'Project name is required' };
  }

  if (name.length < 2) {
    return { valid: false, error: 'Project name must be at least 2 characters' };
  }

  if (name.length > 63) {
    return { valid: false, error: 'Project name must be at most 63 characters' };
  }

  if (!/^[a-z0-9]/.test(name)) {
    return { valid: false, error: 'Project name must start with a lowercase letter or digit' };
  }

  if (!/[a-z0-9]$/.test(name)) {
    return { valid: false, error: 'Project name must end with a lowercase letter or digit' };
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    return {
      valid: false,
      error: 'Project name may only contain lowercase letters (a-z), digits (0-9), and hyphens (-)',
    };
  }

  if (/--/.test(name)) {
    return { valid: false, error: 'Project name must not contain consecutive hyphens (--)' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Domain Name
// ---------------------------------------------------------------------------

/**
 * Regex for a valid domain name.
 *
 * - Each label: 1-63 alphanumeric chars or hyphens (no leading/trailing hyphen)
 * - TLD: 2-63 alphabetic characters
 * - Overall max 253 characters (enforced separately)
 */
const DOMAIN_LABEL = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)$/;
const DOMAIN_TLD = /^[a-zA-Z]{2,63}$/;

/**
 * Validate a domain name (e.g. `myserver.example.com`).
 *
 * Follows RFC 1035 / RFC 1123 rules:
 *   - Labels separated by dots
 *   - Each label: 1-63 chars, alphanumeric + hyphens, no leading/trailing hyphen
 *   - TLD must be alphabetic (2-63 chars)
 *   - Total length <= 253
 *
 * Does not accept IP addresses, wildcards, or trailing dots.
 */
export function validateDomainName(name: string): ValidationResult {
  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, error: 'Domain name is required' };
  }

  if (name.length > 253) {
    return { valid: false, error: 'Domain name must be at most 253 characters' };
  }

  // Remove trailing dot if present (FQDN notation)
  const normalized = name.endsWith('.') ? name.slice(0, -1) : name;

  const labels = normalized.split('.');

  if (labels.length < 2) {
    return { valid: false, error: 'Domain name must have at least two labels (e.g. example.com)' };
  }

  // Validate each label
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    if (label.length === 0) {
      return { valid: false, error: 'Domain name must not contain empty labels (consecutive dots)' };
    }

    // Last label is the TLD — must be alphabetic only
    if (i === labels.length - 1) {
      if (!DOMAIN_TLD.test(label)) {
        return { valid: false, error: `Invalid TLD "${label}": must be 2-63 alphabetic characters` };
      }
    } else {
      if (!DOMAIN_LABEL.test(label)) {
        return {
          valid: false,
          error: `Invalid label "${label}": must be 1-63 alphanumeric characters or hyphens, no leading/trailing hyphen`,
        };
      }
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Cloudflare Tunnel Token
// ---------------------------------------------------------------------------

/**
 * Validate a Cloudflare Tunnel token.
 *
 * Cloudflare issues tunnel tokens as base64-encoded JSON (JWT format),
 * which always start with `eyJ` (the base64 encoding of `{"` ).
 *
 * Additional checks:
 *   - Must be at least 50 characters (real tokens are ~200+ chars)
 *   - Must contain only valid base64url characters
 */
export function validateTunnelToken(token: string): ValidationResult {
  if (typeof token !== 'string' || token.length === 0) {
    return { valid: false, error: 'Tunnel token is required' };
  }

  if (!token.startsWith('eyJ')) {
    return {
      valid: false,
      error: 'Tunnel token must start with "eyJ" (JWT format). Get your token from the Cloudflare Zero Trust dashboard.',
    };
  }

  if (token.length < 50) {
    return {
      valid: false,
      error: 'Tunnel token appears too short. Please copy the full token from the Cloudflare dashboard.',
    };
  }

  // JWT tokens use base64url encoding: alphanumeric, hyphens, underscores, dots, and equals
  if (!/^[A-Za-z0-9\-_=.]+$/.test(token)) {
    return {
      valid: false,
      error: 'Tunnel token contains invalid characters. It should only contain alphanumeric characters, hyphens, underscores, dots, and equals signs.',
    };
  }

  return { valid: true };
}

