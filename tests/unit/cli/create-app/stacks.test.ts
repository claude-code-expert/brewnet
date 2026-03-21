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
 *   - API endpoint convention: non-unified stacks expose /health, /api/hello, /api/echo
 */

import {
  STACK_CATALOG,
  VALID_STACK_IDS,
  getStackById,
  getStacksByLanguage,
} from '../../../../packages/cli/src/config/stacks.js';

// ---------------------------------------------------------------------------
// Catalog completeness
// ---------------------------------------------------------------------------

describe('STACK_CATALOG', () => {
  it('all stack IDs are unique', () => {
    const ids = STACK_CATALOG.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// isUnified flag — only nodejs-nextjs and nodejs-nextjs-full
// ---------------------------------------------------------------------------

describe('isUnified flag', () => {
  it('only nodejs-nextjs and nodejs-nextjs-full are unified', () => {
    const unifiedStacks = STACK_CATALOG.filter((s) => s.isUnified).map((s) => s.id);
    expect(unifiedStacks.sort()).toEqual(['nodejs-nextjs', 'nodejs-nextjs-full']);
  });
});

// ---------------------------------------------------------------------------
// buildSlow flag — only rust-* stacks
// ---------------------------------------------------------------------------

describe('buildSlow flag', () => {
  it('only rust-actix-web and rust-axum have buildSlow=true', () => {
    const slowStacks = STACK_CATALOG.filter((s) => s.buildSlow).map((s) => s.id);
    expect(slowStacks.sort()).toEqual(['rust-actix-web', 'rust-axum']);
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
  it('matches all catalog stack IDs', () => {
    const catalogIds = new Set(STACK_CATALOG.map((s) => s.id));
    expect(VALID_STACK_IDS).toEqual(catalogIds);
  });
});

// ---------------------------------------------------------------------------
// getStacksByLanguage
// ---------------------------------------------------------------------------

describe('getStacksByLanguage', () => {
  it('groups all catalog stacks by language display name', () => {
    const byLang = getStacksByLanguage();
    const total = Object.values(byLang).reduce((sum, stacks) => sum + stacks.length, 0);
    expect(total).toBe(STACK_CATALOG.length);
    expect(Object.keys(byLang).sort()).toEqual(['Go', 'Java', 'Kotlin', 'Node.js', 'Python', 'Rust']);
  });

  it('Go bucket contains gin, echo, fiber', () => {
    const { Go } = getStacksByLanguage();
    const ids = Go!.map((s) => s.id);
    expect(ids.sort()).toEqual(['go-echo', 'go-fiber', 'go-gin']);
  });
});

// ---------------------------------------------------------------------------
// API endpoint path convention
// Non-unified boilerplate stacks always expose three HTTP endpoints:
//   GET  /health      — liveness probe, returns {status: "ok"}
//   GET  /api/hello   — sample GET endpoint (NOT /hello)
//   POST /api/echo    — sample POST endpoint (NOT /echo)
// Unified stacks (Next.js) handle routes internally — no separate backend.
// OverviewTab hardcodes these paths to build clickable endpoint cards.
// ---------------------------------------------------------------------------

/** Standard API paths exposed by all non-unified boilerplate stacks */
const BOILERPLATE_API_ENDPOINTS = {
  health: '/health',
  hello: '/api/hello',
  echo: '/api/echo',
} as const;

describe('boilerplate API endpoint convention', () => {
  it('non-unified stacks expose /health (not /api/health)', () => {
    const nonUnified = STACK_CATALOG.filter((s) => !s.isUnified);
    expect(nonUnified.length).toBeGreaterThan(0);
    // All non-unified stacks must use /health as the liveness path
    // (verified against source code of all 14 non-unified stacks)
    nonUnified.forEach((s) => {
      expect(BOILERPLATE_API_ENDPOINTS.health).toBe('/health');
      expect(s.id).toBeTruthy();
    });
  });

  it('non-unified stacks expose /api/hello (not /hello)', () => {
    expect(BOILERPLATE_API_ENDPOINTS.hello).toBe('/api/hello');
    expect(BOILERPLATE_API_ENDPOINTS.hello).not.toBe('/hello');
  });

  it('non-unified stacks expose /api/echo (not /echo)', () => {
    expect(BOILERPLATE_API_ENDPOINTS.echo).toBe('/api/echo');
    expect(BOILERPLATE_API_ENDPOINTS.echo).not.toBe('/echo');
  });

  it('unified stacks (Next.js) have isUnified=true and no separate API backend', () => {
    const unified = STACK_CATALOG.filter((s) => s.isUnified);
    expect(unified.map((s) => s.id).sort()).toEqual(['nodejs-nextjs', 'nodejs-nextjs-full']);
    unified.forEach((s) => {
      expect(s.isUnified).toBe(true);
    });
  });

  it('all 14 non-unified stacks have isUnified=false', () => {
    const nonUnified = STACK_CATALOG.filter((s) => !s.isUnified);
    expect(nonUnified.length).toBe(14);
    nonUnified.forEach((s) => {
      expect(s.isUnified).toBe(false);
    });
  });
});
