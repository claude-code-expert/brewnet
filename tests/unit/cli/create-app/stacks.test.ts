/**
 * Unit tests for the create-app stack catalog (T026).
 *
 * Verifies:
 *   - Catalog has exactly 16 entries
 *   - All stack IDs are unique
 *   - isUnified flag set correctly (only nodejs-nextjs*)
 *   - buildSlow flag set correctly (only rust-*)
 *   - getStackById returns correct entries
 *   - getStacksByLanguage groups stacks correctly
 *   - VALID_STACK_IDS contains all catalog IDs
 */

import {
  STACK_CATALOG,
  VALID_STACK_IDS,
  VALID_DB_DRIVERS,
  getStackById,
  getStacksByLanguage,
} from '../../../../packages/cli/src/config/stacks.js';

// ---------------------------------------------------------------------------
// Catalog completeness
// ---------------------------------------------------------------------------

describe('STACK_CATALOG', () => {
  it('has exactly 16 entries', () => {
    expect(STACK_CATALOG).toHaveLength(16);
  });

  it('all stack IDs are unique', () => {
    const ids = STACK_CATALOG.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every entry has required fields', () => {
    for (const stack of STACK_CATALOG) {
      expect(stack.id).toBeTruthy();
      expect(stack.language).toBeTruthy();
      expect(stack.framework).toBeTruthy();
      expect(stack.version).toBeTruthy();
      expect(stack.orm).toBeTruthy();
      expect(typeof stack.isUnified).toBe('boolean');
      expect(typeof stack.buildSlow).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// isUnified flag — only nodejs-nextjs and nodejs-nextjs-full
// ---------------------------------------------------------------------------

describe('isUnified flag', () => {
  it('only nodejs-nextjs and nodejs-nextjs-full are unified', () => {
    const unifiedStacks = STACK_CATALOG.filter((s) => s.isUnified).map((s) => s.id);
    expect(unifiedStacks).toHaveLength(2);
    expect(unifiedStacks).toContain('nodejs-nextjs');
    expect(unifiedStacks).toContain('nodejs-nextjs-full');
  });

  it('all other stacks are not unified', () => {
    const nonUnified = STACK_CATALOG.filter((s) => !s.isUnified);
    expect(nonUnified).toHaveLength(14);
  });
});

// ---------------------------------------------------------------------------
// buildSlow flag — only rust-* stacks
// ---------------------------------------------------------------------------

describe('buildSlow flag', () => {
  it('only rust-actix-web and rust-axum have buildSlow=true', () => {
    const slowStacks = STACK_CATALOG.filter((s) => s.buildSlow).map((s) => s.id);
    expect(slowStacks).toHaveLength(2);
    expect(slowStacks).toContain('rust-actix-web');
    expect(slowStacks).toContain('rust-axum');
  });

  it('all non-Rust stacks have buildSlow=false', () => {
    const nonRust = STACK_CATALOG.filter((s) => !s.id.startsWith('rust-'));
    for (const stack of nonRust) {
      expect(stack.buildSlow).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// getStackById
// ---------------------------------------------------------------------------

describe('getStackById', () => {
  it('returns the correct entry for a known ID', () => {
    const stack = getStackById('go-gin');
    expect(stack).toBeDefined();
    expect(stack?.id).toBe('go-gin');
    expect(stack?.language).toBe('Go');
    expect(stack?.framework).toBe('Gin');
    expect(stack?.isUnified).toBe(false);
    expect(stack?.buildSlow).toBe(false);
  });

  it('returns correct entry for nodejs-nextjs (unified)', () => {
    const stack = getStackById('nodejs-nextjs');
    expect(stack).toBeDefined();
    expect(stack?.isUnified).toBe(true);
    expect(stack?.buildSlow).toBe(false);
  });

  it('returns correct entry for rust-actix-web (slow build)', () => {
    const stack = getStackById('rust-actix-web');
    expect(stack).toBeDefined();
    expect(stack?.isUnified).toBe(false);
    expect(stack?.buildSlow).toBe(true);
  });

  it('returns undefined for unknown ID', () => {
    expect(getStackById('invalid-stack')).toBeUndefined();
    expect(getStackById('')).toBeUndefined();
    expect(getStackById('GO-GIN')).toBeUndefined(); // case-sensitive
  });
});

// ---------------------------------------------------------------------------
// VALID_STACK_IDS
// ---------------------------------------------------------------------------

describe('VALID_STACK_IDS', () => {
  it('contains all 16 stack IDs from catalog', () => {
    expect(VALID_STACK_IDS.size).toBe(16);
    for (const stack of STACK_CATALOG) {
      expect(VALID_STACK_IDS.has(stack.id)).toBe(true);
    }
  });

  it('does not contain invalid IDs', () => {
    expect(VALID_STACK_IDS.has('invalid')).toBe(false);
    expect(VALID_STACK_IDS.has('GO-GIN')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VALID_DB_DRIVERS
// ---------------------------------------------------------------------------

describe('VALID_DB_DRIVERS', () => {
  it('contains exactly sqlite3, postgres, mysql', () => {
    expect(VALID_DB_DRIVERS).toHaveLength(3);
    expect(VALID_DB_DRIVERS).toContain('sqlite3');
    expect(VALID_DB_DRIVERS).toContain('postgres');
    expect(VALID_DB_DRIVERS).toContain('mysql');
  });
});

// ---------------------------------------------------------------------------
// getStacksByLanguage
// ---------------------------------------------------------------------------

describe('getStacksByLanguage', () => {
  it('groups stacks into 6 language buckets', () => {
    const byLang = getStacksByLanguage();
    const languages = Object.keys(byLang);
    expect(languages).toHaveLength(6);
  });

  it('Go bucket has exactly 3 stacks', () => {
    const { Go } = getStacksByLanguage();
    expect(Go).toHaveLength(3);
    const ids = Go!.map((s) => s.id);
    expect(ids).toContain('go-gin');
    expect(ids).toContain('go-echo');
    expect(ids).toContain('go-fiber');
  });

  it('Rust bucket has exactly 2 stacks', () => {
    const { Rust } = getStacksByLanguage();
    expect(Rust).toHaveLength(2);
  });

  it('Node.js bucket has exactly 4 stacks', () => {
    const { 'Node.js': nodejs } = getStacksByLanguage();
    expect(nodejs).toHaveLength(4);
  });

  it('Python bucket has exactly 3 stacks', () => {
    const { Python } = getStacksByLanguage();
    expect(Python).toHaveLength(3);
  });

  it('Java bucket has exactly 2 stacks', () => {
    const { Java } = getStacksByLanguage();
    expect(Java).toHaveLength(2);
  });

  it('Kotlin bucket has exactly 2 stacks', () => {
    const { Kotlin } = getStacksByLanguage();
    expect(Kotlin).toHaveLength(2);
  });

  it('total stacks across all groups equals 16', () => {
    const byLang = getStacksByLanguage();
    const total = Object.values(byLang).reduce((sum, stacks) => sum + stacks.length, 0);
    expect(total).toBe(16);
  });
});
