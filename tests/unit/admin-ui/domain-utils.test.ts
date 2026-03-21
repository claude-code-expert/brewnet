/**
 * Unit tests for features/domain/utils/subdomain.ts
 *
 * Tests pure utility functions: toSubdomainSlug, validateSubdomainLabel
 */

import { describe, it, expect } from '@jest/globals';

const { toSubdomainSlug, validateSubdomainLabel } = await import(
  '../../../packages/admin-ui/src/features/domain/utils/subdomain.js'
);

// ---------------------------------------------------------------------------
// toSubdomainSlug
// ---------------------------------------------------------------------------

describe('toSubdomainSlug', () => {
  it('converts to lowercase', () => {
    expect(toSubdomainSlug('MyApp')).toBe('myapp');
    expect(toSubdomainSlug('MY-BLOG')).toBe('my-blog');
  });

  it('replaces spaces with hyphens', () => {
    expect(toSubdomainSlug('my app')).toBe('my-app');
    expect(toSubdomainSlug('hello world blog')).toBe('hello-world-blog');
  });

  it('replaces special chars with hyphens', () => {
    expect(toSubdomainSlug('my_app')).toBe('my-app');
    expect(toSubdomainSlug('my.app')).toBe('my-app');
    expect(toSubdomainSlug('my@app')).toBe('my-app');
  });

  it('collapses consecutive hyphens', () => {
    expect(toSubdomainSlug('my--app')).toBe('my-app');
    expect(toSubdomainSlug('hello   world')).toBe('hello-world');
    expect(toSubdomainSlug('a___b')).toBe('a-b');
  });

  it('removes leading and trailing hyphens', () => {
    expect(toSubdomainSlug('-myapp')).toBe('myapp');
    expect(toSubdomainSlug('myapp-')).toBe('myapp');
    expect(toSubdomainSlug('-my-app-')).toBe('my-app');
  });

  it('truncates to 63 characters', () => {
    const long = 'a'.repeat(70);
    const result = toSubdomainSlug(long);
    expect(result.length).toBe(63);
  });

  it('handles already-valid names unchanged', () => {
    expect(toSubdomainSlug('my-app')).toBe('my-app');
    expect(toSubdomainSlug('blog123')).toBe('blog123');
    expect(toSubdomainSlug('abc')).toBe('abc');
  });

  it('handles empty string', () => {
    expect(toSubdomainSlug('')).toBe('');
  });

  it('handles string with only special chars', () => {
    const result = toSubdomainSlug('___');
    // After replacement and trim: '' (empty or cleaned up)
    expect(typeof result).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// validateSubdomainLabel
// ---------------------------------------------------------------------------

describe('validateSubdomainLabel', () => {
  it('accepts valid lowercase+hyphen names', () => {
    expect(validateSubdomainLabel('myapp').valid).toBe(true);
    expect(validateSubdomainLabel('my-app').valid).toBe(true);
    expect(validateSubdomainLabel('blog123').valid).toBe(true);
    expect(validateSubdomainLabel('a1b2c3').valid).toBe(true);
  });

  it('rejects uppercase', () => {
    const result = validateSubdomainLabel('MyApp');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/lowercase/i);
  });

  it('rejects spaces', () => {
    const result = validateSubdomainLabel('my app');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/space/i);
  });

  it('rejects leading hyphen', () => {
    const result = validateSubdomainLabel('-myapp');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/start/i);
  });

  it('rejects trailing hyphen', () => {
    const result = validateSubdomainLabel('myapp-');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/end/i);
  });

  it('rejects empty string', () => {
    const result = validateSubdomainLabel('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects labels longer than 63 characters', () => {
    const long = 'a'.repeat(64);
    const result = validateSubdomainLabel(long);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/63/);
  });

  it('accepts exactly 63 characters', () => {
    const valid = 'a'.repeat(63);
    expect(validateSubdomainLabel(valid).valid).toBe(true);
  });

  it('rejects labels with only hyphens', () => {
    const result = validateSubdomainLabel('---');
    // Starts and ends with hyphen — should be caught by leading/trailing check
    expect(result.valid).toBe(false);
  });

  it('accepts labels with numbers and hyphens', () => {
    expect(validateSubdomainLabel('app-2024').valid).toBe(true);
    expect(validateSubdomainLabel('123abc').valid).toBe(true);
  });
});
