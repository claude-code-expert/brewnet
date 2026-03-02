/**
 * Unit tests for services/boilerplate-generator module
 *
 * Covers:
 *   - getScaffoldTemplate: returns correct template for each language/framework
 *   - generateBoilerplate: early returns, file generation, sampleData, devMode, fileBrowser
 * All fs calls are mocked.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock node:fs
// ---------------------------------------------------------------------------

const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ''),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { getScaffoldTemplate, generateBoilerplate } = await import(
  '../../../../packages/cli/src/services/boilerplate-generator.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  const base = createDefaultWizardState();
  return {
    ...base,
    projectName: 'test-project',
    projectPath: '/tmp/test-project',
    domain: { ...base.domain, name: 'test.local' },
    admin: { ...base.admin, username: 'admin', password: 'secret' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getScaffoldTemplate
// ---------------------------------------------------------------------------

describe('getScaffoldTemplate — nodejs', () => {
  it('returns nextjs template for nodejs/nextjs', () => {
    const tpl = getScaffoldTemplate('nodejs', 'nextjs');
    expect(tpl.appDir).toContain('nextjs');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns express template for nodejs/express', () => {
    const tpl = getScaffoldTemplate('nodejs', 'express');
    expect(tpl.appDir).toContain('express');
  });

  it('returns nestjs template for nodejs/nestjs', () => {
    const tpl = getScaffoldTemplate('nodejs', 'nestjs');
    expect(tpl.appDir).toContain('nestjs');
  });

  it('falls through to express default for removed fastify framework', () => {
    const tpl = getScaffoldTemplate('nodejs', 'fastify');
    expect(tpl.appDir).toContain('express');
  });

  it('falls through to express default for removed nextjs-api framework', () => {
    const tpl = getScaffoldTemplate('nodejs', 'nextjs-api');
    expect(tpl.appDir).toContain('express');
  });

  it('returns express (default) for unknown nodejs framework', () => {
    const tpl = getScaffoldTemplate('nodejs', 'unknown-framework');
    expect(tpl.appDir).toContain('express');
  });
});

describe('getScaffoldTemplate — python', () => {
  it('returns fastapi template for python/fastapi', () => {
    const tpl = getScaffoldTemplate('python', 'fastapi');
    expect(tpl.appDir).toContain('fastapi');
  });

  it('returns django template for python/django', () => {
    const tpl = getScaffoldTemplate('python', 'django');
    expect(tpl.appDir).toContain('django');
  });

  it('returns flask template for python/flask', () => {
    const tpl = getScaffoldTemplate('python', 'flask');
    expect(tpl.appDir).toContain('flask');
  });

  it('returns fastapi (default) for unknown python framework', () => {
    const tpl = getScaffoldTemplate('python', 'unknown');
    expect(tpl.appDir).toContain('fastapi');
  });
});

describe('getScaffoldTemplate — java', () => {
  it('returns java-pure template', () => {
    const tpl = getScaffoldTemplate('java', 'java-pure');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns spring template', () => {
    const tpl = getScaffoldTemplate('java', 'spring');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns springboot template', () => {
    const tpl = getScaffoldTemplate('java', 'springboot');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns java-pure (default) for unknown java framework', () => {
    const tpl = getScaffoldTemplate('java', 'unknown');
    expect(tpl.appDir).toBeDefined();
  });
});

describe('getScaffoldTemplate — fallback for unknown language', () => {
  it('returns express template for completely unknown language', () => {
    const tpl = getScaffoldTemplate('cobol', '');
    expect(tpl.files.length).toBeGreaterThan(0);
  });
});

describe('getScaffoldTemplate — go', () => {
  it('returns gin template for go/gin', () => {
    const tpl = getScaffoldTemplate('go', 'gin');
    expect(tpl.appDir).toBe('gin-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns echo template for go/echo', () => {
    const tpl = getScaffoldTemplate('go', 'echo');
    expect(tpl.appDir).toBe('echo-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns fiber template for go/fiber', () => {
    const tpl = getScaffoldTemplate('go', 'fiber');
    expect(tpl.appDir).toBe('fiber-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns gin template (default) for go/unknown', () => {
    const tpl = getScaffoldTemplate('go', '');
    expect(tpl.appDir).toBe('gin-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('gin template includes cmd/server/main.go', () => {
    const tpl = getScaffoldTemplate('go', 'gin');
    expect(tpl.files.some((f) => f.path === 'cmd/server/main.go')).toBe(true);
  });

  it('echo template includes cmd/server/main.go', () => {
    const tpl = getScaffoldTemplate('go', 'echo');
    expect(tpl.files.some((f) => f.path === 'cmd/server/main.go')).toBe(true);
  });

  it('fiber template includes cmd/server/main.go', () => {
    const tpl = getScaffoldTemplate('go', 'fiber');
    expect(tpl.files.some((f) => f.path === 'cmd/server/main.go')).toBe(true);
  });

  it('gin template includes internal/database/database.go', () => {
    const tpl = getScaffoldTemplate('go', 'gin');
    expect(tpl.files.some((f) => f.path === 'internal/database/database.go')).toBe(true);
  });

  it('gin template go.mod references gin', () => {
    const tpl = getScaffoldTemplate('go', 'gin');
    const goMod = tpl.files.find((f) => f.path === 'go.mod');
    expect(goMod?.template).toContain('gin-gonic/gin');
  });

  it('echo template go.mod references echo', () => {
    const tpl = getScaffoldTemplate('go', 'echo');
    const goMod = tpl.files.find((f) => f.path === 'go.mod');
    expect(goMod?.template).toContain('labstack/echo');
  });

  it('fiber template go.mod references fiber', () => {
    const tpl = getScaffoldTemplate('go', 'fiber');
    const goMod = tpl.files.find((f) => f.path === 'go.mod');
    expect(goMod?.template).toContain('gofiber/fiber');
  });
});

describe('getScaffoldTemplate — rust', () => {
  it('returns actix-web template for rust/actix-web', () => {
    const tpl = getScaffoldTemplate('rust', 'actix-web');
    expect(tpl.appDir).toBe('actix-web-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns axum template for rust/axum', () => {
    const tpl = getScaffoldTemplate('rust', 'axum');
    expect(tpl.appDir).toBe('axum-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns actix-web template (default) for rust/unknown', () => {
    const tpl = getScaffoldTemplate('rust', '');
    expect(tpl.appDir).toBe('actix-web-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('actix-web template includes src/main.rs', () => {
    const tpl = getScaffoldTemplate('rust', 'actix-web');
    expect(tpl.files.some((f) => f.path === 'src/main.rs')).toBe(true);
  });

  it('axum template includes src/main.rs', () => {
    const tpl = getScaffoldTemplate('rust', 'axum');
    expect(tpl.files.some((f) => f.path === 'src/main.rs')).toBe(true);
  });
});

describe('getScaffoldTemplate — kotlin', () => {
  it('returns ktor template for kotlin/ktor', () => {
    const tpl = getScaffoldTemplate('kotlin', 'ktor');
    expect(tpl.appDir).toBe('ktor-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns springboot-kt template for kotlin/springboot-kt', () => {
    const tpl = getScaffoldTemplate('kotlin', 'springboot-kt');
    expect(tpl.appDir).toBe('springboot-kt-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('returns ktor template (default) for kotlin/unknown', () => {
    const tpl = getScaffoldTemplate('kotlin', '');
    expect(tpl.appDir).toBe('ktor-app');
    expect(tpl.files.length).toBeGreaterThan(0);
  });

  it('ktor template includes Application.kt', () => {
    const tpl = getScaffoldTemplate('kotlin', 'ktor');
    expect(tpl.files.some((f) => f.path.endsWith('Application.kt'))).toBe(true);
  });

  it('ktor template includes Routing.kt', () => {
    const tpl = getScaffoldTemplate('kotlin', 'ktor');
    expect(tpl.files.some((f) => f.path.endsWith('Routing.kt'))).toBe(true);
  });

  it('ktor template includes Database.kt', () => {
    const tpl = getScaffoldTemplate('kotlin', 'ktor');
    expect(tpl.files.some((f) => f.path.endsWith('Database.kt'))).toBe(true);
  });

  it('ktor template build.gradle.kts references ktor plugin', () => {
    const tpl = getScaffoldTemplate('kotlin', 'ktor');
    const gradle = tpl.files.find((f) => f.path === 'build.gradle.kts');
    expect(gradle?.template).toContain('io.ktor.plugin');
  });

  it('springboot-kt template includes Application.kt', () => {
    const tpl = getScaffoldTemplate('kotlin', 'springboot-kt');
    expect(tpl.files.some((f) => f.path.endsWith('Application.kt'))).toBe(true);
  });

  it('springboot-kt template includes ApiController.kt', () => {
    const tpl = getScaffoldTemplate('kotlin', 'springboot-kt');
    expect(tpl.files.some((f) => f.path.endsWith('ApiController.kt'))).toBe(true);
  });

  it('springboot-kt template includes DataSourceConfig.kt', () => {
    const tpl = getScaffoldTemplate('kotlin', 'springboot-kt');
    expect(tpl.files.some((f) => f.path.endsWith('DataSourceConfig.kt'))).toBe(true);
  });

  it('springboot-kt template build.gradle.kts references spring boot', () => {
    const tpl = getScaffoldTemplate('kotlin', 'springboot-kt');
    const gradle = tpl.files.find((f) => f.path === 'build.gradle.kts');
    expect(gradle?.template).toContain('org.springframework.boot');
  });

  it('kotlin version is 2.1.x in both templates', () => {
    const ktorTpl = getScaffoldTemplate('kotlin', 'ktor');
    const sbTpl = getScaffoldTemplate('kotlin', 'springboot-kt');
    const ktorGradle = ktorTpl.files.find((f) => f.path === 'build.gradle.kts');
    const sbGradle = sbTpl.files.find((f) => f.path === 'build.gradle.kts');
    expect(ktorGradle?.template).toContain('2.1.10');
    expect(sbGradle?.template).toContain('2.1.10');
  });
});

describe('getScaffoldTemplate — template content', () => {
  it('each template file has path and template string', () => {
    const tpl = getScaffoldTemplate('nodejs', 'express');
    for (const file of tpl.files) {
      expect(typeof file.path).toBe('string');
      expect(file.path.length).toBeGreaterThan(0);
      expect(typeof file.template).toBe('string');
    }
  });

  it('nextjs template contains PROJECT_NAME placeholder', () => {
    const tpl = getScaffoldTemplate('nodejs', 'nextjs');
    const allContent = tpl.files.map((f) => f.template).join('\n');
    expect(allContent).toContain('${PROJECT_NAME}');
  });
});

// ---------------------------------------------------------------------------
// generateBoilerplate
// ---------------------------------------------------------------------------

describe('generateBoilerplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when boilerplate.generate is false', async () => {
    const state = makeState({ boilerplate: { generate: false, sampleData: false, devMode: null } });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files).toEqual([]);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('returns empty array when no languages selected', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: [], frameworks: {}, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files).toEqual([]);
  });

  it('generates files for nodejs/nextjs', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'nextjs' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.length).toBeGreaterThan(0);
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('writes each generated file to disk', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(mockWriteFileSync.mock.calls.length).toBe(files.length);
  });

  it('creates directories for each file', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
    });
    await generateBoilerplate(state, '/tmp/output');
    expect(mockMkdirSync).toHaveBeenCalled();
    const firstCall = mockMkdirSync.mock.calls[0];
    expect(firstCall?.[1]).toMatchObject({ recursive: true });
  });

  it('substitutes PROJECT_NAME in file content', async () => {
    const state = makeState({
      projectName: 'my-awesome-project',
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'nextjs' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const fileWithName = files.find((f) => f.content.includes('my-awesome-project'));
    expect(fileWithName).toBeDefined();
  });

  it('does not contain raw ${PROJECT_NAME} after substitution', async () => {
    const state = makeState({
      projectName: 'test-project',
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'nextjs' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const allContent = files.map((f) => f.content).join('\n');
    expect(allContent).not.toContain('${PROJECT_NAME}');
  });

  it('generates files for multiple languages', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: {
        languages: ['nodejs', 'python'],
        frameworks: { nodejs: 'express', python: 'fastapi' },
        frontend: null,
      },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const hasExpress = files.some((f) => f.path.includes('express'));
    const hasFastapi = files.some((f) => f.path.includes('fastapi'));
    expect(hasExpress).toBe(true);
    expect(hasFastapi).toBe(true);
  });

  it('adds sample data files when sampleData=true', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
    });
    const filesWithSample = await generateBoilerplate(state, '/tmp/output');

    jest.clearAllMocks();

    const stateNoSample = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
    });
    const filesWithoutSample = await generateBoilerplate(stateNoSample, '/tmp/output');

    // With sample data should have more or equal files
    expect(filesWithSample.length).toBeGreaterThanOrEqual(filesWithoutSample.length);
  });

  it('generates docker-compose.dev.yml when devMode=hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
    expect(devCompose?.content).toContain('services');
  });

  it('does NOT generate docker-compose.dev.yml when devMode is null', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeUndefined();
  });

  it('includes storage .gitkeep files when fileBrowser is enabled', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
      servers: {
        ...makeState().servers,
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const gitkeep = files.find((f) => f.path.includes('.gitkeep'));
    expect(gitkeep).toBeDefined();
  });

  it('does NOT include storage files when fileBrowser is disabled', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'express' }, frontend: null },
      servers: {
        ...makeState().servers,
        fileBrowser: { enabled: false, mode: null },
      },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const gitkeep = files.find((f) => f.path.includes('.gitkeep'));
    expect(gitkeep).toBeUndefined();
  });

  it('returns GeneratedFile objects with path and content', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['python'], frameworks: { python: 'fastapi' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    for (const file of files) {
      expect(typeof file.path).toBe('string');
      expect(typeof file.content).toBe('string');
      expect(file.path.startsWith('apps/')).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // sampleData=true for additional frameworks (covers getSampleData branches)
  // ---------------------------------------------------------------------------

  it('adds sample data for nodejs/nestjs', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'nestjs' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.length).toBeGreaterThan(0);
  });

  it('adds sample data for python/fastapi', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['python'], frameworks: { python: 'fastapi' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.length).toBeGreaterThan(0);
  });

  it('adds sample data for python/django', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['python'], frameworks: { python: 'django' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.length).toBeGreaterThan(0);
  });

  it('adds sample data for rust', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['rust'], frameworks: {}, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.length).toBeGreaterThan(0);
  });

  it('generates files for go/gin', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['go'], frameworks: { go: 'gin' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.path.includes('gin-app'))).toBe(true);
  });

  it('generates files for go/echo', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['go'], frameworks: { go: 'echo' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('echo-app'))).toBe(true);
  });

  it('generates files for go/fiber', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['go'], frameworks: { go: 'fiber' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('fiber-app'))).toBe(true);
  });

  it('generates files for rust/actix-web', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['rust'], frameworks: { rust: 'actix-web' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('actix-web-app'))).toBe(true);
  });

  it('generates files for rust/axum', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['rust'], frameworks: { rust: 'axum' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('axum-app'))).toBe(true);
  });

  it('generates files for kotlin/ktor', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['kotlin'], frameworks: { kotlin: 'ktor' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.path.includes('ktor-app'))).toBe(true);
  });

  it('generates files for kotlin/springboot-kt', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: null },
      devStack: { languages: ['kotlin'], frameworks: { kotlin: 'springboot-kt' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('springboot-kt-app'))).toBe(true);
  });

  it('generates sampleData files for kotlin/ktor', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['kotlin'], frameworks: { kotlin: 'ktor' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('data.json'))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // devMode='hot-reload' for additional frameworks (covers getDevConfig branches)
  // ---------------------------------------------------------------------------

  it('generates dev compose for nodejs/nestjs hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'nestjs' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for python/django hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['python'], frameworks: { python: 'django' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for python/flask hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['python'], frameworks: { python: 'flask' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for java/spring hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['java'], frameworks: { java: 'spring' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for java/springboot hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['java'], frameworks: { java: 'springboot' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for java default (java-pure) hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['java'], frameworks: { java: 'java-pure' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for rust hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['rust'], frameworks: {}, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for go/gin hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['go'], frameworks: { go: 'gin' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
    expect(devCompose?.content).toContain('go run ./cmd/server');
  });

  it('generates dev compose for go/echo hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['go'], frameworks: { go: 'echo' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for go/fiber hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['go'], frameworks: { go: 'fiber' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for rust/axum hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['rust'], frameworks: { rust: 'axum' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for kotlin/ktor hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['kotlin'], frameworks: { kotlin: 'ktor' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
    expect(devCompose?.content).toContain('gradle run');
  });

  it('generates dev compose for kotlin/springboot-kt hot-reload', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['kotlin'], frameworks: { kotlin: 'springboot-kt' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
    expect(devCompose?.content).toContain('gradle bootRun');
  });

  // sampleData=true for remaining frameworks (covers getSampleData default branches)
  it('generates sampleData files for python/flask', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['python'], frameworks: { python: 'flask' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('seed_data.py'))).toBe(true);
  });

  it('returns no sampleData for python/unknown framework (default)', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['python'], frameworks: { python: 'unknown-fw' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    // unknown python framework → getSampleData default → []
    const seedFile = files.find((f) => f.path.includes('seed'));
    expect(seedFile).toBeUndefined();
  });

  it('generates sampleData files for java', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['java'], frameworks: { java: 'spring' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    expect(files.some((f) => f.path.includes('data.json'))).toBe(true);
  });

  it('returns no sampleData for nodejs/unknown framework (default)', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'unknown-fw' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    // unknown nodejs framework → getSampleData default → []
    const hasSeed = files.some(
      (f) => f.path.includes('seed') || f.path.includes('fixture'),
    );
    expect(hasSeed).toBe(false);
  });

  it('returns no sampleData for unknown language (default)', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: true, devMode: null },
      devStack: { languages: ['cobol' as 'nodejs'], frameworks: {}, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    // unknown language → top-level getSampleData default → []
    const hasSeed = files.some((f) => f.path.includes('seed'));
    expect(hasSeed).toBe(false);
  });

  // devMode='hot-reload' for remaining default branches
  it('generates dev compose for nodejs/unknown framework (default devConfig)', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['nodejs'], frameworks: { nodejs: 'unknown-fw' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for python/unknown framework (default devConfig)', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['python'], frameworks: { python: 'unknown-fw' }, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });

  it('generates dev compose for unknown language (default devConfig)', async () => {
    const state = makeState({
      boilerplate: { generate: true, sampleData: false, devMode: 'hot-reload' },
      devStack: { languages: ['cobol' as 'nodejs'], frameworks: {}, frontend: null },
    });
    const files = await generateBoilerplate(state, '/tmp/output');
    const devCompose = files.find((f) => f.path.includes('docker-compose.dev.yml'));
    expect(devCompose).toBeDefined();
  });
});
