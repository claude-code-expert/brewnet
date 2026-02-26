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
} from '../../../../packages/cli/src/config/frameworks.js';
import type { Language, FrontendTech, FrameworkOption } from '../../../../packages/cli/src/config/frameworks.js';

// ---------------------------------------------------------------------------
// Expected constants for assertions
// ---------------------------------------------------------------------------

const EXPECTED_LANGUAGES: Language[] = ['python', 'nodejs', 'java', 'php', 'dotnet', 'rust', 'go'];

const EXPECTED_FRONTEND_TECHS: FrontendTech[] = ['vuejs', 'reactjs', 'typescript', 'javascript'];

const EXPECTED_FRAMEWORKS_BY_LANGUAGE: Record<Language, string[]> = {
  python: ['fastapi', 'django', 'flask'],
  nodejs: ['nextjs', 'nextjs-api', 'express', 'nestjs', 'fastify'],
  java: ['java-pure', 'spring', 'springboot'],
  php: ['laravel', 'symfony'],
  dotnet: ['aspnet', 'blazor'],
  rust: [],
  go: [],
};

// ===========================================================================
// LANGUAGE_REGISTRY -- structure & completeness
// ===========================================================================

describe('LANGUAGE_REGISTRY', () => {
  it('has exactly 7 language entries', () => {
    const keys = Object.keys(LANGUAGE_REGISTRY);
    expect(keys).toHaveLength(7);
  });

  it('contains every expected language key', () => {
    for (const lang of EXPECTED_LANGUAGES) {
      expect(LANGUAGE_REGISTRY).toHaveProperty(lang);
    }
  });

  it('contains no unexpected language keys', () => {
    const keys = Object.keys(LANGUAGE_REGISTRY);
    for (const key of keys) {
      expect(EXPECTED_LANGUAGES).toContain(key);
    }
  });

  it('each entry has a non-empty name string', () => {
    for (const lang of EXPECTED_LANGUAGES) {
      const entry = LANGUAGE_REGISTRY[lang];
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('each entry has a frameworks array', () => {
    for (const lang of EXPECTED_LANGUAGES) {
      expect(Array.isArray(LANGUAGE_REGISTRY[lang].frameworks)).toBe(true);
    }
  });

  it('has correct display names for each language', () => {
    expect(LANGUAGE_REGISTRY.python.name).toBe('Python');
    expect(LANGUAGE_REGISTRY.nodejs.name).toBe('Node.js');
    expect(LANGUAGE_REGISTRY.java.name).toBe('Java');
    expect(LANGUAGE_REGISTRY.php.name).toBe('PHP');
    expect(LANGUAGE_REGISTRY.dotnet.name).toBe('.NET');
    expect(LANGUAGE_REGISTRY.rust.name).toBe('Rust');
    expect(LANGUAGE_REGISTRY.go.name).toBe('Go');
  });
});

// ===========================================================================
// FRONTEND_REGISTRY -- structure & completeness
// ===========================================================================

describe('FRONTEND_REGISTRY', () => {
  it('has exactly 4 frontend tech entries', () => {
    const keys = Object.keys(FRONTEND_REGISTRY);
    expect(keys).toHaveLength(4);
  });

  it('contains every expected frontend tech key', () => {
    for (const tech of EXPECTED_FRONTEND_TECHS) {
      expect(FRONTEND_REGISTRY).toHaveProperty(tech);
    }
  });

  it('contains no unexpected frontend tech keys', () => {
    const keys = Object.keys(FRONTEND_REGISTRY);
    for (const key of keys) {
      expect(EXPECTED_FRONTEND_TECHS).toContain(key);
    }
  });

  it('each entry has a non-empty name string', () => {
    for (const tech of EXPECTED_FRONTEND_TECHS) {
      const entry = FRONTEND_REGISTRY[tech];
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('each entry has a non-empty description string', () => {
    for (const tech of EXPECTED_FRONTEND_TECHS) {
      const entry = FRONTEND_REGISTRY[tech];
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('has correct display names for each frontend tech', () => {
    expect(FRONTEND_REGISTRY.vuejs.name).toBe('Vue.js');
    expect(FRONTEND_REGISTRY.reactjs.name).toBe('React');
    expect(FRONTEND_REGISTRY.typescript.name).toBe('TypeScript');
    expect(FRONTEND_REGISTRY.javascript.name).toBe('JavaScript');
  });
});

// ===========================================================================
// FrameworkOption shape -- every framework entry must satisfy the interface
// ===========================================================================

describe('FrameworkOption shape', () => {
  const allFrameworks: Array<[string, FrameworkOption]> = [];
  for (const lang of EXPECTED_LANGUAGES) {
    for (const fw of LANGUAGE_REGISTRY[lang].frameworks) {
      allFrameworks.push([`${lang}/${fw.id}`, fw]);
    }
  }

  it.each(allFrameworks)(
    '%s has a non-empty id string',
    (_label: string, fw: FrameworkOption) => {
      expect(typeof fw.id).toBe('string');
      expect(fw.id.length).toBeGreaterThan(0);
    },
  );

  it.each(allFrameworks)(
    '%s has a non-empty name string',
    (_label: string, fw: FrameworkOption) => {
      expect(typeof fw.name).toBe('string');
      expect(fw.name.length).toBeGreaterThan(0);
    },
  );

  it.each(allFrameworks)(
    '%s has a non-empty description string',
    (_label: string, fw: FrameworkOption) => {
      expect(typeof fw.description).toBe('string');
      expect(fw.description.length).toBeGreaterThan(0);
    },
  );
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
    it('returns exactly 5 frameworks', () => {
      const frameworks = getFrameworksForLanguage('nodejs');
      expect(frameworks).toHaveLength(5);
    });

    it('returns Next.js, Next.js API, Express, NestJS, and Fastify', () => {
      const ids = getFrameworksForLanguage('nodejs').map((fw) => fw.id);
      expect(ids).toContain('nextjs');
      expect(ids).toContain('nextjs-api');
      expect(ids).toContain('express');
      expect(ids).toContain('nestjs');
      expect(ids).toContain('fastify');
    });

    it('does not include frameworks from other languages', () => {
      const ids = getFrameworksForLanguage('nodejs').map((fw) => fw.id);
      expect(ids).not.toContain('fastapi');
      expect(ids).not.toContain('django');
      expect(ids).not.toContain('laravel');
      expect(ids).not.toContain('spring');
    });
  });

  // -- Java (TC-05-02) -----------------------------------------------------
  describe('java', () => {
    it('returns exactly 3 frameworks', () => {
      const frameworks = getFrameworksForLanguage('java');
      expect(frameworks).toHaveLength(3);
    });

    it('returns Pure Java, Spring, and Spring Boot', () => {
      const ids = getFrameworksForLanguage('java').map((fw) => fw.id);
      expect(ids).toContain('java-pure');
      expect(ids).toContain('spring');
      expect(ids).toContain('springboot');
    });

    it('does not include frameworks from other languages', () => {
      const ids = getFrameworksForLanguage('java').map((fw) => fw.id);
      expect(ids).not.toContain('express');
      expect(ids).not.toContain('fastapi');
      expect(ids).not.toContain('laravel');
    });
  });

  // -- PHP -----------------------------------------------------------------
  describe('php', () => {
    it('returns exactly 2 frameworks', () => {
      const frameworks = getFrameworksForLanguage('php');
      expect(frameworks).toHaveLength(2);
    });

    it('returns Laravel and Symfony', () => {
      const ids = getFrameworksForLanguage('php').map((fw) => fw.id);
      expect(ids).toContain('laravel');
      expect(ids).toContain('symfony');
    });
  });

  // -- .NET ----------------------------------------------------------------
  describe('dotnet', () => {
    it('returns exactly 2 frameworks', () => {
      const frameworks = getFrameworksForLanguage('dotnet');
      expect(frameworks).toHaveLength(2);
    });

    it('returns ASP.NET Core and Blazor', () => {
      const ids = getFrameworksForLanguage('dotnet').map((fw) => fw.id);
      expect(ids).toContain('aspnet');
      expect(ids).toContain('blazor');
    });
  });

  // -- Rust (TC-05-03: empty frameworks) -----------------------------------
  describe('rust', () => {
    it('returns an empty array (no frameworks available)', () => {
      const frameworks = getFrameworksForLanguage('rust');
      expect(frameworks).toEqual([]);
    });

    it('returns an array type even when empty', () => {
      expect(Array.isArray(getFrameworksForLanguage('rust'))).toBe(true);
    });
  });

  // -- Go (TC-05-03: empty frameworks) -------------------------------------
  describe('go', () => {
    it('returns an empty array (no frameworks available)', () => {
      const frameworks = getFrameworksForLanguage('go');
      expect(frameworks).toEqual([]);
    });

    it('returns an array type even when empty', () => {
      expect(Array.isArray(getFrameworksForLanguage('go'))).toBe(true);
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
  it('returns an array of 7 language keys', () => {
    const languages = getAllLanguages();
    expect(Array.isArray(languages)).toBe(true);
    expect(languages).toHaveLength(7);
  });

  it('contains every expected language key', () => {
    const languages = getAllLanguages();
    for (const lang of EXPECTED_LANGUAGES) {
      expect(languages).toContain(lang);
    }
  });

  it('contains no unexpected language keys', () => {
    const languages = getAllLanguages();
    for (const lang of languages) {
      expect(EXPECTED_LANGUAGES).toContain(lang);
    }
  });

  it('returns a new array on each call (no shared reference)', () => {
    const a = getAllLanguages();
    const b = getAllLanguages();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ===========================================================================
// getAllFrontendTechs() -- TC-05-04
// ===========================================================================

describe('getAllFrontendTechs()', () => {
  it('returns an array of 4 frontend tech keys', () => {
    const techs = getAllFrontendTechs();
    expect(Array.isArray(techs)).toBe(true);
    expect(techs).toHaveLength(4);
  });

  it('contains every expected frontend tech key', () => {
    const techs = getAllFrontendTechs();
    for (const tech of EXPECTED_FRONTEND_TECHS) {
      expect(techs).toContain(tech);
    }
  });

  it('contains no unexpected frontend tech keys', () => {
    const techs = getAllFrontendTechs();
    for (const tech of techs) {
      expect(EXPECTED_FRONTEND_TECHS).toContain(tech);
    }
  });

  it('returns a new array on each call (no shared reference)', () => {
    const a = getAllFrontendTechs();
    const b = getAllFrontendTechs();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
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

  it('has no duplicate framework IDs within any single language', () => {
    for (const lang of EXPECTED_LANGUAGES) {
      const ids = getFrameworksForLanguage(lang).map((fw) => fw.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });
});

// ===========================================================================
// Total framework count
// ===========================================================================

describe('Total framework count', () => {
  it('has 15 frameworks across all languages (3+5+3+2+2+0+0)', () => {
    let total = 0;
    for (const lang of EXPECTED_LANGUAGES) {
      total += getFrameworksForLanguage(lang).length;
    }
    expect(total).toBe(15);
  });
});
