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
      frontend: null,
    });

    expect(result.languages).toEqual(expect.arrayContaining(['python', 'nodejs']));
    expect(result.languages).toHaveLength(2);
  });

  it('selecting all 6 languages retains all in languages array', () => {
    const allLanguages: Language[] = ['python', 'nodejs', 'java', 'rust', 'go', 'kotlin'];

    const result = buildDevStackState({
      languages: allLanguages,
      frameworks: {},
      frontend: null,
    });

    expect(result.languages).toHaveLength(6);
    for (const lang of allLanguages) {
      expect(result.languages).toContain(lang);
    }
  });

  it('selecting a single language returns an array with one entry', () => {
    const result = buildDevStackState({
      languages: ['java'],
      frameworks: {},
      frontend: null,
    });

    expect(result.languages).toEqual(['java']);
    expect(result.languages).toHaveLength(1);
  });

  it('deselecting all languages returns an empty array', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: null,
    });

    expect(result.languages).toEqual([]);
    expect(result.languages).toHaveLength(0);
  });
});

// ── TC-05-05: Single-select frontend behavior ──────────────────────────────

describe('TC-05-05: Single-select frontend behavior', () => {
  it('selecting React stores "react" in frontend', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: 'react',
    });

    expect(result.frontend).toBe('react');
  });

  it('selecting Vue stores "vue" in frontend', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: 'vue',
    });

    expect(result.frontend).toBe('vue');
  });

  it('selecting Svelte stores "svelte" in frontend', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: 'svelte',
    });

    expect(result.frontend).toBe('svelte');
  });

  it('null frontend means no frontend selected', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: null,
    });

    expect(result.frontend).toBeNull();
  });

  it('frontend selection is independent of language selection', () => {
    // Frontend only, no languages
    const frontendOnly = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: 'vue',
    });
    expect(frontendOnly.frontend).toBe('vue');
    expect(frontendOnly.languages).toEqual([]);

    // Languages only, no frontend
    const languagesOnly = buildDevStackState({
      languages: ['python', 'go'],
      frameworks: {},
      frontend: null,
    });
    expect(languagesOnly.languages).toEqual(expect.arrayContaining(['python', 'go']));
    expect(languagesOnly.frontend).toBeNull();

    // Both together
    const both = buildDevStackState({
      languages: ['nodejs'],
      frameworks: { nodejs: 'express' },
      frontend: 'react',
    });
    expect(both.languages).toEqual(['nodejs']);
    expect(both.frontend).toBe('react');
  });
});

// ── TC-05-08: Skip behavior ────────────────────────────────────────────────

describe('TC-05-08: Skip behavior', () => {
  it('Skip option resets devStack to empty (languages=[], frameworks={}, frontend=null)', () => {
    // Start with a populated devStack
    const state = buildState({
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: 'react',
      },
    });

    const result = applySkipDevStack(state);

    expect(result.devStack.languages).toEqual([]);
    expect(result.devStack.frameworks).toEqual({});
    expect(result.devStack.frontend).toBeNull();
  });

  it('Skip option sets appServer.enabled = false', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs'],
        frameworks: { nodejs: 'express' },
        frontend: 'react',
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
        frontend: null,
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
    expect(result.devStack.frontend).toBeNull();
    expect(result.servers.appServer.enabled).toBe(false);
    expect(result.servers.fileBrowser.enabled).toBe(false);
  });

  it('Skip does not mutate the input state', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs'],
        frameworks: { nodejs: 'nextjs' },
        frontend: 'react',
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
  });

  it('returns empty result when no languages are selected', () => {
    const result = getFilteredFrameworks([]);

    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns Rust frameworks (axum as default, actix-web second)', () => {
    const result = getFilteredFrameworks(['rust']);

    expect(result).toHaveProperty('rust');
    const rustIds = result.rust.map((f: { id: string }) => f.id);
    expect(rustIds[0]).toBe('axum');
    expect(rustIds).toContain('actix-web');
  });

  it('returns Go frameworks (gin, echo, fiber)', () => {
    const result = getFilteredFrameworks(['go']);

    expect(result).toHaveProperty('go');
    const goIds = result.go.map((f: { id: string }) => f.id);
    expect(goIds).toContain('gin');
    expect(goIds).toContain('echo');
    expect(goIds).toContain('fiber');
  });

  it('returns frameworks for all 6 languages when all are selected', () => {
    const allLanguages: Language[] = ['python', 'nodejs', 'java', 'rust', 'go', 'kotlin'];
    const result = getFilteredFrameworks(allLanguages);

    for (const lang of allLanguages) {
      expect(result).toHaveProperty(lang);
    }

    // All languages have frameworks
    expect(result.python.length).toBeGreaterThan(0);
    expect(result.nodejs.length).toBeGreaterThan(0);
    expect(result.java.length).toBeGreaterThan(0);
    expect(result.rust.length).toBeGreaterThan(0);
    expect(result.go.length).toBeGreaterThan(0);
    expect(result.kotlin.length).toBeGreaterThan(0);
  });

  it('returns Java frameworks (spring and springboot, no java-pure)', () => {
    const result = getFilteredFrameworks(['java']);

    const javaIds = result.java.map((f: { id: string }) => f.id);
    expect(javaIds).toContain('spring');
    expect(javaIds).toContain('springboot');
    expect(javaIds).not.toContain('java-pure');
  });

  it('returns Kotlin frameworks (ktor and springboot-kt)', () => {
    const result = getFilteredFrameworks(['kotlin']);

    expect(result).toHaveProperty('kotlin');
    const kotlinIds = result.kotlin.map((f: { id: string }) => f.id);
    expect(kotlinIds).toContain('ktor');
    expect(kotlinIds).toContain('springboot-kt');
  });
});

// ── isDevStackEmpty ────────────────────────────────────────────────────────

describe('isDevStackEmpty', () => {
  it('returns true when languages=[] and frontend=null', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });

    expect(isDevStackEmpty(state)).toBe(true);
  });

  it('returns true for default wizard state (empty devStack)', () => {
    const state = createDefaultWizardState();
    expect(isDevStackEmpty(state)).toBe(true);
  });

  it('returns false when languages has entries', () => {
    const state = buildState({
      devStack: { languages: ['python'], frameworks: {}, frontend: null },
    });

    expect(isDevStackEmpty(state)).toBe(false);
  });

  it('returns false when frontend is set (not null)', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: 'react' },
    });

    expect(isDevStackEmpty(state)).toBe(false);
  });

  it('returns false when both languages and frontend have entries', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs'],
        frameworks: { nodejs: 'express' },
        frontend: 'vue',
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
        frontend: null,
      },
    });

    expect(isDevStackEmpty(state)).toBe(true);
  });
});

// ── Auto-enable rules (using existing applyDevStackAutoEnables) ────────────

describe('Auto-enable rules (applyDevStackAutoEnables)', () => {
  it('languages selected -> appServer.enabled = true', () => {
    const state = buildState({
      devStack: { languages: ['python'], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('frontend selected (no languages) -> appServer.enabled = true', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: 'react' },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('both languages + frontend -> appServer.enabled = true', () => {
    const state = buildState({
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'nextjs', python: 'fastapi' },
        frontend: 'react',
      },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
  });

  it('nothing selected -> appServer.enabled = false', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(false);
  });

  it('appServer auto-enabled -> fileBrowser.enabled = true', () => {
    const state = buildState({
      devStack: { languages: ['go'], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(true);
    expect(result.servers.fileBrowser.enabled).toBe(true);
  });

  it('appServer disabled -> fileBrowser.enabled = false', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });

    const result = applyDevStackAutoEnables(state);
    expect(result.servers.appServer.enabled).toBe(false);
    expect(result.servers.fileBrowser.enabled).toBe(false);
  });
});

// ── buildDevStackState ─────────────────────────────────────────────────────

describe('buildDevStackState', () => {
  it('builds correct DevStackConfig with python + fastapi + react frontend', () => {
    const result = buildDevStackState({
      languages: ['python'],
      frameworks: { python: 'fastapi' },
      frontend: 'react',
    });

    expect(result).toEqual({
      languages: ['python'],
      frameworks: { python: 'fastapi' },
      frontend: 'react',
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
      frontend: 'vue',
    });

    expect(result.languages).toEqual(['nodejs', 'python', 'java']);
    expect(result.frameworks).toEqual({
      nodejs: 'nextjs',
      python: 'django',
      java: 'springboot',
    });
    expect(result.frontend).toBe('vue');
  });

  it('builds empty DevStackConfig with no selections', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: null,
    });

    expect(result).toEqual({
      languages: [],
      frameworks: {},
      frontend: null,
    });
  });

  it('builds DevStackConfig with languages (rust, go) and no frontend', () => {
    const result = buildDevStackState({
      languages: ['rust', 'go'],
      frameworks: {},
      frontend: null,
    });

    expect(result.languages).toEqual(['rust', 'go']);
    expect(result.frameworks).toEqual({});
    expect(result.frontend).toBeNull();
  });

  it('builds DevStackConfig with only frontend, no languages', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: 'svelte',
    });

    expect(result.languages).toEqual([]);
    expect(result.frameworks).toEqual({});
    expect(result.frontend).toBe('svelte');
  });

  it('strips stale framework entries for deselected languages', () => {
    // If a language was previously selected but is now deselected,
    // buildDevStackState should not include its framework in the result.
    const result = buildDevStackState({
      languages: ['python'],
      frameworks: { python: 'fastapi', nodejs: 'express' },  // nodejs is stale
      frontend: null,
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
        frontend: 'react',
      },
      servers: {
        appServer: { enabled: true },
        fileBrowser: { enabled: true, mode: 'directory' },
      },
    });

    const originalLanguages = [...state.devStack.languages];
    const originalFrontend = state.devStack.frontend;
    const originalFrameworks = { ...state.devStack.frameworks };
    const originalAppServer = state.servers.appServer.enabled;
    const originalFileBrowser = state.servers.fileBrowser.enabled;

    applySkipDevStack(state);

    expect(state.devStack.languages).toEqual(originalLanguages);
    expect(state.devStack.frontend).toBe(originalFrontend);
    expect(state.devStack.frameworks).toEqual(originalFrameworks);
    expect(state.servers.appServer.enabled).toBe(originalAppServer);
    expect(state.servers.fileBrowser.enabled).toBe(originalFileBrowser);
  });

  it('buildDevStackState returns a new object, not a reference to input', () => {
    const input = {
      languages: ['python'] as Language[],
      frameworks: { python: 'fastapi' },
      frontend: 'react' as FrontendTech | null,
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
      frontend: 'react',
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
      frontend: null,
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
        frontend: 'react',
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
    expect(final.devStack.frontend).toBeNull();
    expect(final.servers.appServer.enabled).toBe(false);
    expect(final.servers.fileBrowser.enabled).toBe(false);
  });

  it('isDevStackEmpty agrees with auto-enable logic', () => {
    // Non-empty devStack
    const nonEmptyState = buildState({
      devStack: { languages: ['rust'], frameworks: {}, frontend: null },
    });
    expect(isDevStackEmpty(nonEmptyState)).toBe(false);
    const enabledResult = applyDevStackAutoEnables(nonEmptyState);
    expect(enabledResult.servers.appServer.enabled).toBe(true);

    // Empty devStack
    const emptyState = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });
    expect(isDevStackEmpty(emptyState)).toBe(true);
    const disabledResult = applyDevStackAutoEnables(emptyState);
    expect(disabledResult.servers.appServer.enabled).toBe(false);
  });
});

// ── T038: Regression — framework loop shows prompt for each selected language ──

describe('T038: Framework loop regression — prompt for each selected language', () => {
  it('getFilteredFrameworks returns non-empty arrays for every registered language', () => {
    const allLanguages: Language[] = ['python', 'nodejs', 'java', 'rust', 'go', 'kotlin'];

    for (const lang of allLanguages) {
      const result = getFilteredFrameworks([lang]);
      const frameworks = result[lang];

      // Core regression guard: no language should produce an empty array
      // (which would cause the select() crash in the wizard loop)
      expect(frameworks.length).toBeGreaterThan(0);
      expect(frameworks[0]).toBeDefined();
      expect(frameworks[0].id).toBeTruthy();
    }
  });

  it('first framework entry (default) is always defined for every language', () => {
    const allLanguages: Language[] = ['python', 'nodejs', 'java', 'rust', 'go', 'kotlin'];

    for (const lang of allLanguages) {
      const result = getFilteredFrameworks([lang]);
      const first = result[lang]?.[0];

      // This would previously crash: frameworks[0].id when frameworks is empty
      expect(first).toBeDefined();
      expect(typeof first.id).toBe('string');
      expect(first.id.length).toBeGreaterThan(0);
    }
  });

  it('buildDevStackState does not crash when frameworks are not pre-selected', () => {
    // Simulate user selecting languages without pre-existing framework choices
    // (empty frameworks object = no defaults, bug scenario)
    const allLanguages: Language[] = ['python', 'nodejs', 'java', 'rust', 'go', 'kotlin'];

    expect(() => {
      buildDevStackState({
        languages: allLanguages,
        frameworks: {},   // No pre-selections
        frontend: null,
      });
    }).not.toThrow();
  });
});

// ── T039: Framework loop with 0 languages → no framework prompts → no crash ──

describe('T039: Empty language selection — no crash, no framework prompts', () => {
  it('getFilteredFrameworks([]) returns an empty record', () => {
    const result = getFilteredFrameworks([]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('buildDevStackState with empty languages produces valid empty DevStackConfig', () => {
    const result = buildDevStackState({
      languages: [],
      frameworks: {},
      frontend: null,
    });

    expect(result.languages).toEqual([]);
    expect(result.frameworks).toEqual({});
    expect(result.frontend).toBeNull();
  });

  it('isDevStackEmpty returns true when languages is empty and frontend is null', () => {
    const state = buildState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });
    expect(isDevStackEmpty(state)).toBe(true);
  });

  it('applySkipDevStack produces empty/null devStack without throwing', () => {
    const state = createDefaultWizardState(); // already empty
    expect(() => applySkipDevStack(state)).not.toThrow();

    const result = applySkipDevStack(state);
    expect(result.devStack.languages).toEqual([]);
    expect(result.devStack.frameworks).toEqual({});
    expect(result.devStack.frontend).toBeNull();
  });
});
