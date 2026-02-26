/**
 * Unit tests for wizard/steps/dev-stack module (T076)
 *
 * Tests the pure business logic functions for the Dev Stack & Runtime wizard
 * step (Step 3). Covers multi-select language/frontend behavior, Skip behavior,
 * framework filtering, and integration with the existing applyDevStackAutoEnables.
 *
 * Test cases: TC-05-01, TC-05-05, TC-05-08 (from TEST_CASES.md)
 *
 * Strategy: TDD — tests are written first. The target functions do not exist yet
 * and will be implemented in packages/cli/src/wizard/steps/dev-stack.ts.
 * Tests will fail with import errors until implementation is done.
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Imports — TDD targets (not yet implemented)
// ---------------------------------------------------------------------------

const {
  buildDevStackState,
  applySkipDevStack,
  getFilteredFrameworks,
  isDevStackEmpty,
} = await import(
  '../../../../packages/cli/src/wizard/steps/dev-stack.js'
);

// ---------------------------------------------------------------------------
// Imports — existing modules
// ---------------------------------------------------------------------------

const { applyDevStackAutoEnables } = await import(
  '../../../../packages/cli/src/wizard/steps/server-components.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type {
  WizardState,
  DevStackConfig,
  Language,
  FrontendTech,
} from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a default WizardState with optional deep overrides.
 * Uses structuredClone to avoid shared references between tests.
 */
function buildState(overrides: Partial<{
  servers: Partial<WizardState['servers']>;
  devStack: Partial<WizardState['devStack']>;
  domain: Partial<WizardState['domain']>;
}> = {}): WizardState {
  const base = createDefaultWizardState();
  const state = structuredClone(base);

  if (overrides.servers) {
    for (const [key, value] of Object.entries(overrides.servers)) {
      (state.servers as Record<string, unknown>)[key] = {
        ...(state.servers as Record<string, unknown>)[key] as object,
        ...value as object,
      };
    }
  }
  if (overrides.devStack) {
    Object.assign(state.devStack, overrides.devStack);
  }
  if (overrides.domain) {
    Object.assign(state.domain, overrides.domain);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ── TC-05-01: Multi-select language behavior ────────────────────────────────

describe('TC-05-01: Multi-select language behavior', () => {
  it('selecting Python + Node.js retains both in languages array', () => {
    const result = buildDevStackState({
      languages: ['python', 'nodejs'],
      frameworks: {},
      frontend: [],
    });

    expect(result.languages).toEqual(expect.arrayContaining(['python', 'nodejs']));
    expect(result.languages).toHaveLength(2);
  });

  it('selecting all 7 languages retains all in languages array', () => {
    const allLanguages: Language[] = ['python', 'nodejs', 'java', 'php', 'dotnet', 'rust', 'go'];

    const result = buildDevStackState({
      languages: allLanguages,
      frameworks: {},
      frontend: [],
    });

    expect(result.languages).toHaveLength(7);
    for (const lang of allLanguages) {
      expect(result.languages).toContain(lang);
    }
  });

  it('selecting a single language returns an array with one entry', () => {
    const result = buildDevStackState({
      languages: ['java'],
      frameworks: {},
      frontend: [],
    });

    expect(result.languages).toEqual(['java']);
    expect(result.languages).toHaveLength(1);
  });

  it('deselecting all languages returns an empty array', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: [],
    });

    expect(result.languages).toEqual([]);
    expect(result.languages).toHaveLength(0);
  });
});

// ── TC-05-05: Multi-select frontend behavior ───────────────────────────────

describe('TC-05-05: Multi-select frontend behavior', () => {
  it('selecting React.js + TypeScript retains both in frontend array', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: ['reactjs', 'typescript'],
    });

    expect(result.frontend).toEqual(expect.arrayContaining(['reactjs', 'typescript']));
    expect(result.frontend).toHaveLength(2);
  });

  it('selecting all 4 frontend techs retains all in frontend array', () => {
    const allFrontend: FrontendTech[] = ['vuejs', 'reactjs', 'typescript', 'javascript'];

    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: allFrontend,
    });

    expect(result.frontend).toHaveLength(4);
    for (const tech of allFrontend) {
      expect(result.frontend).toContain(tech);
    }
  });

  it('frontend selection is independent of language selection', () => {
    // Frontend only, no languages
    const frontendOnly = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: ['vuejs', 'javascript'],
    });
    expect(frontendOnly.frontend).toEqual(expect.arrayContaining(['vuejs', 'javascript']));
    expect(frontendOnly.languages).toEqual([]);

    // Languages only, no frontend
    const languagesOnly = buildDevStackState({
      languages: ['python', 'go'],
      frameworks: {},
      frontend: [],
    });
    expect(languagesOnly.languages).toEqual(expect.arrayContaining(['python', 'go']));
    expect(languagesOnly.frontend).toEqual([]);

    // Both together
    const both = buildDevStackState({
      languages: ['nodejs'],
      frameworks: { nodejs: 'express' },
      frontend: ['reactjs', 'typescript'],
    });
    expect(both.languages).toEqual(['nodejs']);
    expect(both.frontend).toEqual(expect.arrayContaining(['reactjs', 'typescript']));
  });
});

// ── TC-05-08: Skip behavior ────────────────────────────────────────────────

describe('TC-05-08: Skip behavior', () => {
  it('Skip option resets devStack to empty (languages=[], frameworks={}, frontend=[])', () => {
    // Start with a populated devStack
    const state = buildState({
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: ['reactjs', 'typescript'],
      },
    });

    const result = applySkipDevStack(state);

    expect(result.devStack.languages).toEqual([]);
    expect(result.devStack.frameworks).toEqual({});
    expect(result.devStack.frontend).toEqual([]);
  });

  it('Skip option sets appServer.enabled = false', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs'],
        frameworks: { nodejs: 'express' },
        frontend: ['reactjs'],
      },
      servers: {
        appServer: { enabled: true },
      },
    });

    const result = applySkipDevStack(state);

    expect(result.servers.appServer.enabled).toBe(false);
  });

  it('Skip option sets fileBrowser.enabled = false (reverts auto-enable)', () => {
    const state = buildState({
      devStack: {
        languages: ['python'],
        frameworks: { python: 'django' },
        frontend: [],
      },
      servers: {
        appServer: { enabled: true },
        fileBrowser: { enabled: true, mode: 'directory' },
      },
    });

    const result = applySkipDevStack(state);

    expect(result.servers.fileBrowser.enabled).toBe(false);
  });

  it('Skip on default (empty) state still produces valid empty devStack', () => {
    const state = createDefaultWizardState();

    const result = applySkipDevStack(state);

    expect(result.devStack.languages).toEqual([]);
    expect(result.devStack.frameworks).toEqual({});
    expect(result.devStack.frontend).toEqual([]);
    expect(result.servers.appServer.enabled).toBe(false);
    expect(result.servers.fileBrowser.enabled).toBe(false);
  });

  it('Skip does not mutate the input state', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs'],
        frameworks: { nodejs: 'nextjs' },
        frontend: ['reactjs'],
      },
      servers: {
        appServer: { enabled: true },
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });

    const originalJson = JSON.stringify(state);
    applySkipDevStack(state);
    expect(JSON.stringify(state)).toBe(originalJson);
  });
});

// ── Framework filtering ────────────────────────────────────────────────────

describe('getFilteredFrameworks', () => {
  it('returns only Python frameworks when ["python"] is selected', () => {
    const result = getFilteredFrameworks(['python']);

    expect(result).toHaveProperty('python');
    expect(result.python.length).toBeGreaterThan(0);

    // Should include known Python frameworks
    const pythonIds = result.python.map((f: { id: string }) => f.id);
    expect(pythonIds).toContain('fastapi');
    expect(pythonIds).toContain('django');
    expect(pythonIds).toContain('flask');

    // Should not include Node.js or other language frameworks
    expect(result).not.toHaveProperty('nodejs');
    expect(result).not.toHaveProperty('java');
  });

  it('returns Python + Node.js frameworks when both are selected', () => {
    const result = getFilteredFrameworks(['python', 'nodejs']);

    expect(result).toHaveProperty('python');
    expect(result).toHaveProperty('nodejs');

    const pythonIds = result.python.map((f: { id: string }) => f.id);
    expect(pythonIds).toContain('fastapi');

    const nodejsIds = result.nodejs.map((f: { id: string }) => f.id);
    expect(nodejsIds).toContain('nextjs');
    expect(nodejsIds).toContain('express');

    // Should not include other languages
    expect(result).not.toHaveProperty('java');
    expect(result).not.toHaveProperty('php');
  });

  it('returns empty result when no languages are selected', () => {
    const result = getFilteredFrameworks([]);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns empty frameworks for Rust (language with no frameworks)', () => {
    const result = getFilteredFrameworks(['rust']);

    expect(result).toHaveProperty('rust');
    expect(result.rust).toEqual([]);
  });

  it('returns empty frameworks for Go (language with no frameworks)', () => {
    const result = getFilteredFrameworks(['go']);

    expect(result).toHaveProperty('go');
    expect(result.go).toEqual([]);
  });

  it('returns frameworks for all 7 languages when all are selected', () => {
    const allLanguages: Language[] = ['python', 'nodejs', 'java', 'php', 'dotnet', 'rust', 'go'];
    const result = getFilteredFrameworks(allLanguages);

    for (const lang of allLanguages) {
      expect(result).toHaveProperty(lang);
    }

    // Languages with frameworks should have entries
    expect(result.python.length).toBeGreaterThan(0);
    expect(result.nodejs.length).toBeGreaterThan(0);
    expect(result.java.length).toBeGreaterThan(0);
    expect(result.php.length).toBeGreaterThan(0);
    expect(result.dotnet.length).toBeGreaterThan(0);

    // Languages without frameworks should have empty arrays
    expect(result.rust).toEqual([]);
    expect(result.go).toEqual([]);
  });

  it('returns Java frameworks including spring and springboot', () => {
    const result = getFilteredFrameworks(['java']);

    const javaIds = result.java.map((f: { id: string }) => f.id);
    expect(javaIds).toContain('java-pure');
    expect(javaIds).toContain('spring');
    expect(javaIds).toContain('springboot');
  });
});

// ── isDevStackEmpty ────────────────────────────────────────────────────────

describe('isDevStackEmpty', () => {
  it('returns true when languages=[] and frontend=[]', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: [] },
    });

    expect(isDevStackEmpty(state)).toBe(true);
  });

  it('returns true for default wizard state (empty devStack)', () => {
    const state = createDefaultWizardState();
    expect(isDevStackEmpty(state)).toBe(true);
  });

  it('returns false when languages has entries', () => {
    const state = buildState({
      devStack: { languages: ['python'], frameworks: {}, frontend: [] },
    });

    expect(isDevStackEmpty(state)).toBe(false);
  });

  it('returns false when frontend has entries', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: ['reactjs'] },
    });

    expect(isDevStackEmpty(state)).toBe(false);
  });

  it('returns false when both languages and frontend have entries', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs'],
        frameworks: { nodejs: 'express' },
        frontend: ['typescript'],
      },
    });

    expect(isDevStackEmpty(state)).toBe(false);
  });

  it('returns true even when frameworks record has stale keys but languages is empty', () => {
    // Edge case: frameworks record may have leftover keys but languages is empty
    // isDevStackEmpty should check languages and frontend, not frameworks
    const state = buildState({
      devStack: {
        languages: [],
        frameworks: { nodejs: 'express' },  // stale entry
        frontend: [],
      },
    });

    expect(isDevStackEmpty(state)).toBe(true);
  });
});

// ── Auto-enable rules (using existing applyDevStackAutoEnables) ────────────

describe('Auto-enable rules (applyDevStackAutoEnables)', () => {
  it('languages selected -> appServer.enabled = true', () => {
    const state = buildState({
      devStack: { languages: ['python'], frameworks: {}, frontend: [] },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('frontend selected (no languages) -> appServer.enabled = true', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: ['reactjs'] },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('both languages + frontend -> appServer.enabled = true', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: ['reactjs', 'typescript'],
      },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('nothing selected -> appServer.enabled = false', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: [] },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(false);
  });

  it('appServer auto-enabled -> fileBrowser.enabled = true', () => {
    const state = buildState({
      devStack: { languages: ['go'], frameworks: {}, frontend: [] },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
    expect(result.servers.fileBrowser.enabled).toBe(true);
  });

  it('appServer disabled -> fileBrowser.enabled = false', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: [] },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(false);
    expect(result.servers.fileBrowser.enabled).toBe(false);
  });
});

// ── buildDevStackState ─────────────────────────────────────────────────────

describe('buildDevStackState', () => {
  it('builds correct DevStackConfig with python + fastapi + reactjs', () => {
    const result = buildDevStackState({
      languages: ['python'],
      frameworks: { python: 'fastapi' },
      frontend: ['reactjs'],
    });

    expect(result).toEqual({
      languages: ['python'],
      frameworks: { python: 'fastapi' },
      frontend: ['reactjs'],
    });
  });

  it('builds correct DevStackConfig with multiple languages, each with framework', () => {
    const result = buildDevStackState({
      languages: ['nodejs', 'python', 'java'],
      frameworks: {
        nodejs: 'nextjs',
        python: 'django',
        java: 'springboot',
      },
      frontend: ['typescript'],
    });

    expect(result.languages).toEqual(['nodejs', 'python', 'java']);
    expect(result.frameworks).toEqual({
      nodejs: 'nextjs',
      python: 'django',
      java: 'springboot',
    });
    expect(result.frontend).toEqual(['typescript']);
  });

  it('builds empty DevStackConfig with no selections', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: [],
    });

    expect(result).toEqual({
      languages: [],
      frameworks: {},
      frontend: [],
    });
  });

  it('builds DevStackConfig with languages that have no framework (rust, go)', () => {
    const result = buildDevStackState({
      languages: ['rust', 'go'],
      frameworks: {},
      frontend: [],
    });

    expect(result.languages).toEqual(['rust', 'go']);
    expect(result.frameworks).toEqual({});
    expect(result.frontend).toEqual([]);
  });

  it('builds DevStackConfig with only frontend, no languages', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: ['vuejs', 'reactjs', 'typescript', 'javascript'],
    });

    expect(result.languages).toEqual([]);
    expect(result.frameworks).toEqual({});
    expect(result.frontend).toHaveLength(4);
    expect(result.frontend).toEqual(
      expect.arrayContaining(['vuejs', 'reactjs', 'typescript', 'javascript']),
    );
  });

  it('strips stale framework entries for deselected languages', () => {
    // If a language was previously selected but is now deselected,
    // buildDevStackState should not include its framework in the result.
    const result = buildDevStackState({
      languages: ['python'],
      frameworks: { python: 'fastapi', nodejs: 'express' },  // nodejs is stale
      frontend: [],
    });

    expect(result.languages).toEqual(['python']);
    expect(result.frameworks).toEqual({ python: 'fastapi' });
    // The stale 'nodejs' framework should be stripped
    expect(result.frameworks).not.toHaveProperty('nodejs');
  });
});

// ── Immutability guarantees ────────────────────────────────────────────────

describe('Immutability guarantees', () => {
  it('applySkipDevStack does not mutate the input state (deep check)', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: ['reactjs'],
      },
      servers: {
        appServer: { enabled: true },
        fileBrowser: { enabled: true, mode: 'directory' },
      },
    });

    const originalLanguages = [...state.devStack.languages];
    const originalFrontend = [...state.devStack.frontend];
    const originalFrameworks = { ...state.devStack.frameworks };
    const originalAppServer = state.servers.appServer.enabled;
    const originalFileBrowser = state.servers.fileBrowser.enabled;

    applySkipDevStack(state);

    expect(state.devStack.languages).toEqual(originalLanguages);
    expect(state.devStack.frontend).toEqual(originalFrontend);
    expect(state.devStack.frameworks).toEqual(originalFrameworks);
    expect(state.servers.appServer.enabled).toBe(originalAppServer);
    expect(state.servers.fileBrowser.enabled).toBe(originalFileBrowser);
  });

  it('buildDevStackState returns a new object, not a reference to input', () => {
    const input = {
      languages: ['python'] as Language[],
      frameworks: { python: 'fastapi' },
      frontend: ['reactjs'] as FrontendTech[],
    };

    const result = buildDevStackState(input);

    // Mutating the result should not affect the input
    result.languages.push('nodejs' as Language);
    expect(input.languages).toEqual(['python']);
  });
});

// ── Integration: buildDevStackState + applyDevStackAutoEnables ─────────────

describe('Integration: dev-stack functions + applyDevStackAutoEnables', () => {
  it('buildDevStackState output drives auto-enable when applied to state', () => {
    const devStack = buildDevStackState({
      languages: ['nodejs'],
      frameworks: { nodejs: 'express' },
      frontend: ['reactjs', 'typescript'],
    });

    const state = buildState({ devStack });
    const result = applyDevStackAutoEnables(state);

    expect(result.servers.appServer.enabled).toBe(true);
    expect(result.servers.fileBrowser.enabled).toBe(true);
  });

  it('empty buildDevStackState output disables auto-enables', () => {
    const devStack = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: [],
    });

    const state = buildState({ devStack });
    const result = applyDevStackAutoEnables(state);

    expect(result.servers.appServer.enabled).toBe(false);
    expect(result.servers.fileBrowser.enabled).toBe(false);
  });

  it('Skip followed by auto-enables produces fully disabled state', () => {
    const state = buildState({
      devStack: {
        languages: ['python', 'nodejs'],
        frameworks: { python: 'fastapi', nodejs: 'nextjs' },
        frontend: ['reactjs'],
      },
      servers: {
        appServer: { enabled: true },
        fileBrowser: { enabled: true, mode: 'directory' },
      },
    });

    // Skip clears devStack and disables appServer + fileBrowser
    const skipped = applySkipDevStack(state);

    // Apply auto-enables should confirm disabled state
    const final = applyDevStackAutoEnables(skipped);

    expect(final.devStack.languages).toEqual([]);
    expect(final.devStack.frameworks).toEqual({});
    expect(final.devStack.frontend).toEqual([]);
    expect(final.servers.appServer.enabled).toBe(false);
    expect(final.servers.fileBrowser.enabled).toBe(false);
  });

  it('isDevStackEmpty agrees with auto-enable logic', () => {
    // Non-empty devStack
    const nonEmptyState = buildState({
      devStack: { languages: ['rust'], frameworks: {}, frontend: [] },
    });
    expect(isDevStackEmpty(nonEmptyState)).toBe(false);
    const enabledResult = applyDevStackAutoEnables(nonEmptyState);
    expect(enabledResult.servers.appServer.enabled).toBe(true);

    // Empty devStack
    const emptyState = buildState({
      devStack: { languages: [], frameworks: {}, frontend: [] },
    });
    expect(isDevStackEmpty(emptyState)).toBe(true);
    const disabledResult = applyDevStackAutoEnables(emptyState);
    expect(disabledResult.servers.appServer.enabled).toBe(false);
  });
});
