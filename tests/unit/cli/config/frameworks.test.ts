/**
 * Unit tests for the language/framework registry (T075).
 *
 * Covers: LANGUAGE_REGISTRY structure, FRONTEND_REGISTRY structure,
 * getFrameworksForLanguage(), getAllLanguages(), getAllFrontendTechs(),
 * framework filtering by language, empty-framework languages,
 * FrameworkOption shape validation, and uniqueness constraints.
 *
 * Test case references: TC-05-02, TC-05-03, TC-05-04
 */

import {
  LANGUAGE_REGISTRY,
  FRONTEND_REGISTRY,
  getFrameworksForLanguage,
  getAllLanguages,
  getAllFrontendTechs,
  resolveStackId,
} from '../../../../packages/cli/src/config/frameworks.js';
import type { Language, FrontendTech } from '../../../../packages/cli/src/config/frameworks.js';

// ---------------------------------------------------------------------------
// Expected constants for assertions
// ---------------------------------------------------------------------------

const EXPECTED_LANGUAGES: Language[] = ['python', 'nodejs', 'java', 'rust', 'go', 'kotlin'];

const EXPECTED_FRONTEND_TECHS: FrontendTech[] = ['react', 'vue', 'none'];

const EXPECTED_FRAMEWORKS_BY_LANGUAGE: Record<Language, string[]> = {
  python: ['fastapi', 'django', 'flask'],
  nodejs: ['nextjs', 'nextjs-app', 'express', 'nestjs'],
  java: ['spring', 'springboot'],
  rust: ['axum', 'actix-web'],
  go: ['gin', 'echo', 'fiber'],
  kotlin: ['ktor', 'springboot-kt'],
};

// ===========================================================================
// LANGUAGE_REGISTRY -- structure & completeness
// ===========================================================================

describe('LANGUAGE_REGISTRY', () => {
  it('contains exactly the expected language keys', () => {
    const keys = Object.keys(LANGUAGE_REGISTRY);
    expect(keys.sort()).toEqual([...EXPECTED_LANGUAGES].sort());
  });

  it('has correct display names for each language', () => {
    expect(LANGUAGE_REGISTRY.python.name).toBe('Python');
    expect(LANGUAGE_REGISTRY.nodejs.name).toBe('Node.js');
    expect(LANGUAGE_REGISTRY.java.name).toBe('Java');
    expect(LANGUAGE_REGISTRY.rust.name).toBe('Rust');
    expect(LANGUAGE_REGISTRY.go.name).toBe('Go');
    expect(LANGUAGE_REGISTRY.kotlin.name).toBe('Kotlin');
  });
});

// ===========================================================================
// FRONTEND_REGISTRY -- structure & completeness
// ===========================================================================

describe('FRONTEND_REGISTRY', () => {
  it('contains exactly the expected frontend tech keys', () => {
    const keys = Object.keys(FRONTEND_REGISTRY);
    expect(keys.sort()).toEqual([...EXPECTED_FRONTEND_TECHS].sort());
  });

  it('has correct display names for each frontend tech', () => {
    expect(FRONTEND_REGISTRY.react.name).toBe('React (TypeScript)');
    expect(FRONTEND_REGISTRY.vue.name).toBe('Vue.js (Vite)');
    expect(FRONTEND_REGISTRY.none.name).toBe('Skip frontend');
  });
});

// ===========================================================================
// getFrameworksForLanguage() -- TC-05-02, TC-05-03
// ===========================================================================

describe('getFrameworksForLanguage()', () => {
  // -- Python (TC-05-02) ---------------------------------------------------
  describe('python', () => {
    it('returns exactly 3 frameworks', () => {
      const frameworks = getFrameworksForLanguage('python');
      expect(frameworks).toHaveLength(3);
    });

    it('returns FastAPI, Django, and Flask', () => {
      const ids = getFrameworksForLanguage('python').map((fw) => fw.id);
      expect(ids).toContain('fastapi');
      expect(ids).toContain('django');
      expect(ids).toContain('flask');
    });

    it('does not include frameworks from other languages', () => {
      const ids = getFrameworksForLanguage('python').map((fw) => fw.id);
      expect(ids).not.toContain('express');
      expect(ids).not.toContain('nextjs');
      expect(ids).not.toContain('laravel');
      expect(ids).not.toContain('spring');
    });
  });

  // -- Node.js (TC-05-02) --------------------------------------------------
  describe('nodejs', () => {
    it('returns exactly 4 frameworks', () => {
      const frameworks = getFrameworksForLanguage('nodejs');
      expect(frameworks).toHaveLength(4);
    });

    it('returns Next.js, Next.js 15.x (App Router), Express, and NestJS', () => {
      const ids = getFrameworksForLanguage('nodejs').map((fw) => fw.id);
      expect(ids).toContain('nextjs');
      expect(ids).toContain('nextjs-app');
      expect(ids).toContain('express');
      expect(ids).toContain('nestjs');
    });

    it('does not include removed frameworks (nextjs-api, fastify)', () => {
      const ids = getFrameworksForLanguage('nodejs').map((fw) => fw.id);
      expect(ids).not.toContain('nextjs-api');
      expect(ids).not.toContain('fastify');
    });

    it('does not include frameworks from other languages', () => {
      const ids = getFrameworksForLanguage('nodejs').map((fw) => fw.id);
      expect(ids).not.toContain('fastapi');
      expect(ids).not.toContain('django');
      expect(ids).not.toContain('spring');
    });
  });

  // -- Java (TC-05-02) -----------------------------------------------------
  describe('java', () => {
    it('returns exactly 2 frameworks', () => {
      const frameworks = getFrameworksForLanguage('java');
      expect(frameworks).toHaveLength(2);
    });

    it('returns Spring and Spring Boot (java-pure removed)', () => {
      const ids = getFrameworksForLanguage('java').map((fw) => fw.id);
      expect(ids).toContain('spring');
      expect(ids).toContain('springboot');
      expect(ids).not.toContain('java-pure');
    });

    it('does not include frameworks from other languages', () => {
      const ids = getFrameworksForLanguage('java').map((fw) => fw.id);
      expect(ids).not.toContain('express');
      expect(ids).not.toContain('fastapi');
      expect(ids).not.toContain('laravel');
    });
  });

  // -- Rust (TC-05-03: Rust frameworks) -----------------------------------
  describe('rust', () => {
    it('returns Axum (index 0, default) and Actix Web (index 1)', () => {
      const frameworks = getFrameworksForLanguage('rust');
      expect(frameworks[0].id).toBe('axum');
      expect(frameworks[1].id).toBe('actix-web');
    });
  });

  // -- Go (TC-05-03: Go frameworks) ----------------------------------------
  describe('go', () => {
    it('returns Gin, Echo, and Fiber frameworks', () => {
      const ids = getFrameworksForLanguage('go').map((fw) => fw.id);
      expect(ids).toContain('gin');
      expect(ids).toContain('echo');
      expect(ids).toContain('fiber');
    });
  });

  // -- Kotlin (new) --------------------------------------------------------
  describe('kotlin', () => {
    it('returns exactly 2 frameworks', () => {
      const frameworks = getFrameworksForLanguage('kotlin');
      expect(frameworks).toHaveLength(2);
    });

    it('returns Ktor (index 0, default) and Spring Boot Kotlin', () => {
      const frameworks = getFrameworksForLanguage('kotlin');
      expect(frameworks[0].id).toBe('ktor');
      expect(frameworks[1].id).toBe('springboot-kt');
    });
  });

  // -- Cross-language validation: each language returns the correct IDs -----
  describe('framework IDs match expected values for every language', () => {
    it.each(EXPECTED_LANGUAGES)(
      '%s returns exactly the expected framework IDs',
      (lang: Language) => {
        const actual = getFrameworksForLanguage(lang).map((fw) => fw.id);
        expect(actual).toEqual(EXPECTED_FRAMEWORKS_BY_LANGUAGE[lang]);
      },
    );
  });
});

// ===========================================================================
// getAllLanguages() -- TC-05-04
// ===========================================================================

describe('getAllLanguages()', () => {
  it('returns exactly the expected language keys', () => {
    const languages = getAllLanguages();
    expect(languages.sort()).toEqual([...EXPECTED_LANGUAGES].sort());
  });
});

// ===========================================================================
// getAllFrontendTechs() -- TC-05-04
// ===========================================================================

describe('getAllFrontendTechs()', () => {
  it('returns exactly the expected frontend tech keys', () => {
    const techs = getAllFrontendTechs();
    expect(techs.sort()).toEqual([...EXPECTED_FRONTEND_TECHS].sort());
  });
});

// ===========================================================================
// Uniqueness constraints
// ===========================================================================

describe('Framework ID uniqueness', () => {
  it('has no duplicate framework IDs across all languages', () => {
    const allIds: string[] = [];
    for (const lang of EXPECTED_LANGUAGES) {
      const frameworks = getFrameworksForLanguage(lang);
      for (const fw of frameworks) {
        allIds.push(fw.id);
      }
    }
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});

// ===========================================================================
// resolveStackId() — wizard devStack → CONNECT_BOILERPLATE.md stack IDs
// ===========================================================================

describe('resolveStackId()', () => {
  // --- Standard pattern: <language>-<frameworkId> -------------------------
  it('python + fastapi → python-fastapi', () => {
    expect(resolveStackId('python', 'fastapi')).toBe('python-fastapi');
  });

  it('python + django → python-django', () => {
    expect(resolveStackId('python', 'django')).toBe('python-django');
  });

  it('python + flask → python-flask', () => {
    expect(resolveStackId('python', 'flask')).toBe('python-flask');
  });

  it('go + gin → go-gin', () => {
    expect(resolveStackId('go', 'gin')).toBe('go-gin');
  });

  it('go + echo → go-echo', () => {
    expect(resolveStackId('go', 'echo')).toBe('go-echo');
  });

  it('go + fiber → go-fiber', () => {
    expect(resolveStackId('go', 'fiber')).toBe('go-fiber');
  });

  it('rust + axum → rust-axum', () => {
    expect(resolveStackId('rust', 'axum')).toBe('rust-axum');
  });

  it('rust + actix-web → rust-actix-web', () => {
    expect(resolveStackId('rust', 'actix-web')).toBe('rust-actix-web');
  });

  it('java + spring → java-spring', () => {
    expect(resolveStackId('java', 'spring')).toBe('java-spring');
  });

  it('java + springboot → java-springboot', () => {
    expect(resolveStackId('java', 'springboot')).toBe('java-springboot');
  });

  it('kotlin + ktor → kotlin-ktor', () => {
    expect(resolveStackId('kotlin', 'ktor')).toBe('kotlin-ktor');
  });

  it('nodejs + express → nodejs-express', () => {
    expect(resolveStackId('nodejs', 'express')).toBe('nodejs-express');
  });

  it('nodejs + nestjs → nodejs-nestjs', () => {
    expect(resolveStackId('nodejs', 'nestjs')).toBe('nodejs-nestjs');
  });

  // --- Exception cases (wizard ID ≠ CONNECT_BOILERPLATE.md stack ID) -------
  it('nodejs + nextjs (Full-Stack) → nodejs-nextjs-full', () => {
    expect(resolveStackId('nodejs', 'nextjs')).toBe('nodejs-nextjs-full');
  });

  it('nodejs + nextjs-app (API Routes) → nodejs-nextjs', () => {
    expect(resolveStackId('nodejs', 'nextjs-app')).toBe('nodejs-nextjs');
  });

  it('kotlin + springboot-kt → kotlin-springboot', () => {
    expect(resolveStackId('kotlin', 'springboot-kt')).toBe('kotlin-springboot');
  });

  // --- Unknown / invalid inputs → null --------------------------------------
  it('returns null for unknown language', () => {
    expect(resolveStackId('ruby', 'rails')).toBeNull();
  });

  it('returns null for unknown framework within valid language', () => {
    expect(resolveStackId('python', 'unknown-framework')).toBeNull();
  });

  it('returns null for empty strings', () => {
    expect(resolveStackId('', '')).toBeNull();
  });

  // --- All 16 CONNECT_BOILERPLATE.md stacks are reachable ------------------
  it('all 16 stacks from CONNECT_BOILERPLATE.md are resolvable', () => {
    const expectedStacks = [
      ['go', 'gin'], ['go', 'echo'], ['go', 'fiber'],
      ['rust', 'actix-web'], ['rust', 'axum'],
      ['java', 'springboot'], ['java', 'spring'],
      ['kotlin', 'ktor'], ['kotlin', 'springboot-kt'],
      ['nodejs', 'express'], ['nodejs', 'nestjs'],
      ['nodejs', 'nextjs'], ['nodejs', 'nextjs-app'],
      ['python', 'fastapi'], ['python', 'django'], ['python', 'flask'],
    ] as const;

    const resolved = expectedStacks.map(([lang, fw]) => resolveStackId(lang, fw));
    expect(resolved.every((id) => id !== null)).toBe(true);

    const uniqueIds = new Set(resolved.filter(Boolean));
    expect(uniqueIds.size).toBe(16);
  });
});
