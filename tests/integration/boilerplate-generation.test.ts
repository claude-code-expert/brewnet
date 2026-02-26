/**
 * T077 — Boilerplate Scaffold Generation Integration Tests
 *
 * Tests the boilerplate generation logic used during Step 3 (Dev Stack & Runtime):
 *   - Scaffold file generation for selected frameworks
 *   - Template variable substitution (PROJECT_NAME, DOMAIN, ADMIN_USER)
 *   - Dev mode compose overlay (hot-reload vs production)
 *   - FileBrowser storage directory generation
 *   - Multi-framework scaffold generation
 *   - Sample data inclusion / exclusion
 *
 * Test case references:
 *   TC-05-06: Next.js scaffold generation
 *   TC-05-07: Dev mode compose overlay (hot-reload / production)
 *   TC-05-09: FileBrowser storage directories
 *
 * Approach: TDD — the module `packages/cli/src/services/boilerplate-generator.ts`
 * does NOT exist yet. These tests define the expected behavior and will fail until
 * the implementation is created.
 *
 * @module tests/integration/boilerplate-generation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  generateBoilerplate,
  getScaffoldTemplate,
} from '../../packages/cli/src/services/boilerplate-generator.js';

import { createDefaultWizardState } from '../../packages/cli/src/config/defaults.js';

import type { WizardState } from '../../packages/shared/src/types/wizard-state.js';
import type { Language } from '../../packages/shared/src/types/wizard-state.js';

// ---------------------------------------------------------------------------
// Types (mirrors planned boilerplate-generator module exports)
// ---------------------------------------------------------------------------

interface GeneratedFile {
  path: string;      // relative path like "apps/nextjs-app/package.json"
  content: string;   // file content
}

interface ScaffoldTemplate {
  appDir: string;    // directory name like "nextjs-app"
  files: { path: string; template: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a unique temporary directory for test isolation.
 */
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'brewnet-boilerplate-test-'));
}

/**
 * Create a WizardState configured for Next.js scaffold generation.
 */
function createNextjsState(): WizardState {
  const state = createDefaultWizardState();
  return {
    ...state,
    projectName: 'my-homeserver',
    projectPath: '~/brewnet/my-homeserver',
    devStack: {
      languages: ['nodejs'] as Language[],
      frameworks: { nodejs: 'nextjs' },
      frontend: ['reactjs', 'typescript'],
    },
    boilerplate: {
      generate: true,
      sampleData: false,
      devMode: 'hot-reload',
    },
    admin: {
      ...state.admin,
      username: 'admin',
      password: 'TestPassword123!',
    },
    domain: {
      ...state.domain,
      name: 'myserver.example.com',
    },
  };
}

/**
 * Create a WizardState configured for Python FastAPI scaffold generation.
 */
function createFastapiState(): WizardState {
  const state = createDefaultWizardState();
  return {
    ...state,
    projectName: 'py-server',
    projectPath: '~/brewnet/py-server',
    devStack: {
      languages: ['python'] as Language[],
      frameworks: { python: 'fastapi' },
      frontend: [],
    },
    boilerplate: {
      generate: true,
      sampleData: false,
      devMode: 'production',
    },
    admin: {
      ...state.admin,
      username: 'admin',
      password: 'TestPassword123!',
    },
    domain: {
      ...state.domain,
      name: 'pyserver.example.com',
    },
  };
}

/**
 * Create a WizardState with multiple frameworks selected.
 */
function createMultiFrameworkState(): WizardState {
  const state = createDefaultWizardState();
  return {
    ...state,
    projectName: 'multi-app',
    projectPath: '~/brewnet/multi-app',
    devStack: {
      languages: ['python', 'nodejs'] as Language[],
      frameworks: { python: 'fastapi', nodejs: 'express' },
      frontend: [],
    },
    boilerplate: {
      generate: true,
      sampleData: false,
      devMode: 'hot-reload',
    },
    admin: {
      ...state.admin,
      username: 'admin',
      password: 'TestPassword123!',
    },
    domain: {
      ...state.domain,
      name: 'multi.example.com',
    },
  };
}

/**
 * Create a WizardState with FileBrowser enabled.
 */
function createFileBrowserState(): WizardState {
  const state = createNextjsState();
  return {
    ...state,
    servers: {
      ...state.servers,
      fileBrowser: { enabled: true, mode: 'standalone' },
    },
  };
}

/**
 * Find a generated file by a path substring.
 */
function findFile(files: GeneratedFile[], pathFragment: string): GeneratedFile | undefined {
  return files.find((f) => f.path.includes(pathFragment));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T077 — Boilerplate Scaffold Generation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // =========================================================================
  // TC-05-06: Next.js scaffold generation
  // =========================================================================

  describe('TC-05-06: Next.js scaffold generation', () => {
    it('creates apps/nextjs-app/ directory structure', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      expect(files.length).toBeGreaterThan(0);

      // All generated files should be under apps/nextjs-app/
      const nextjsFiles = files.filter((f) => f.path.startsWith('apps/nextjs-app/'));
      expect(nextjsFiles.length).toBeGreaterThan(0);
    });

    it('generated files include package.json', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      const packageJson = findFile(files, 'apps/nextjs-app/package.json');
      expect(packageJson).toBeDefined();
      expect(packageJson!.content).toBeTruthy();
    });

    it('generated files include Dockerfile', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      const dockerfile = findFile(files, 'apps/nextjs-app/Dockerfile');
      expect(dockerfile).toBeDefined();
      expect(dockerfile!.content).toBeTruthy();
    });

    it('generated files include next.config.js', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      const nextConfig = findFile(files, 'apps/nextjs-app/next.config.');
      expect(nextConfig).toBeDefined();
      expect(nextConfig!.content).toBeTruthy();
    });

    it('generated files include src/app/page.tsx', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      const pageTsx = findFile(files, 'apps/nextjs-app/src/app/page.tsx');
      expect(pageTsx).toBeDefined();
      expect(pageTsx!.content).toBeTruthy();
    });

    it('package.json contains project name and correct dependencies', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      const packageJson = findFile(files, 'apps/nextjs-app/package.json');
      expect(packageJson).toBeDefined();

      const parsed = JSON.parse(packageJson!.content);
      expect(parsed.name).toBe('my-homeserver');
      expect(parsed.dependencies).toBeDefined();
      expect(parsed.dependencies['next']).toBeDefined();
      expect(parsed.dependencies['react']).toBeDefined();
      expect(parsed.dependencies['react-dom']).toBeDefined();
    });

    it('Dockerfile uses Node.js base image', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      const dockerfile = findFile(files, 'apps/nextjs-app/Dockerfile');
      expect(dockerfile).toBeDefined();
      expect(dockerfile!.content).toMatch(/FROM\s+node:/i);
    });
  });

  // =========================================================================
  // TC-05-07: Dev mode compose overlay
  // =========================================================================

  describe('TC-05-07: Dev mode compose overlay', () => {
    it('devMode=hot-reload includes source mount volume in compose snippet', async () => {
      const state = createNextjsState();
      state.boilerplate.devMode = 'hot-reload';
      const files = await generateBoilerplate(state, tempDir);

      // Look for docker-compose dev overlay or compose snippet
      const composeFile = files.find(
        (f) =>
          f.path.includes('docker-compose') ||
          f.path.includes('compose') && f.path.endsWith('.yml'),
      );
      expect(composeFile).toBeDefined();
      // Hot-reload mode should mount the source directory as a volume
      expect(composeFile!.content).toMatch(/volumes:/);
      expect(composeFile!.content).toMatch(/\.\/apps\//);
    });

    it('devMode=production does not include source mount', async () => {
      const state = createNextjsState();
      state.boilerplate.devMode = 'production';
      const files = await generateBoilerplate(state, tempDir);

      const composeFile = files.find(
        (f) =>
          f.path.includes('docker-compose') ||
          f.path.includes('compose') && f.path.endsWith('.yml'),
      );

      // If a compose snippet exists in production mode, it should not mount source dirs
      if (composeFile) {
        // Production mode should NOT have source directory mounts
        // (data volumes like named volumes are OK)
        expect(composeFile.content).not.toMatch(/\.\/apps\/nextjs-app\/src/);
      }
    });

    it('devMode=production generates optimized Dockerfile', async () => {
      const state = createNextjsState();
      state.boilerplate.devMode = 'production';
      const files = await generateBoilerplate(state, tempDir);

      const dockerfile = findFile(files, 'apps/nextjs-app/Dockerfile');
      expect(dockerfile).toBeDefined();

      // Production Dockerfile should use multi-stage build or production start command
      // It should NOT contain dev command like 'npm run dev'
      expect(dockerfile!.content).not.toMatch(/npm run dev/);
    });

    it('hot-reload config contains correct dev command for nextjs', async () => {
      const state = createNextjsState();
      state.boilerplate.devMode = 'hot-reload';
      const files = await generateBoilerplate(state, tempDir);

      // Either in the compose snippet or in a dev script, the dev command should be present
      const allContent = files.map((f) => f.content).join('\n');
      expect(allContent).toMatch(/npm run dev/);
    });
  });

  // =========================================================================
  // TC-05-09: FileBrowser storage directories
  // =========================================================================

  describe('TC-05-09: FileBrowser storage directories', () => {
    it('FileBrowser enabled generates storage directory config', async () => {
      const state = createFileBrowserState();
      const files = await generateBoilerplate(state, tempDir);

      const allPaths = files.map((f) => f.path);

      // Should include storage directory paths or a config referencing them
      const hasUploads = allPaths.some((p) => p.includes('storage/uploads'));
      const hasTemp = allPaths.some((p) => p.includes('storage/temp'));
      const hasBackups = allPaths.some((p) => p.includes('storage/backups'));

      // At least the storage directories should be represented
      // (either as .gitkeep files or referenced in config)
      const storageRelated = files.filter(
        (f) => f.path.includes('storage/uploads') ||
               f.path.includes('storage/temp') ||
               f.path.includes('storage/backups'),
      );

      expect(storageRelated.length).toBeGreaterThan(0);
    });

    it('FileBrowser not enabled does not include storage directories', async () => {
      const state = createNextjsState();
      state.servers.fileBrowser = { enabled: false, mode: '' };
      const files = await generateBoilerplate(state, tempDir);

      const storageRelated = files.filter(
        (f) => f.path.includes('storage/uploads') ||
               f.path.includes('storage/temp') ||
               f.path.includes('storage/backups'),
      );

      expect(storageRelated.length).toBe(0);
    });
  });

  // =========================================================================
  // Template variable substitution
  // =========================================================================

  describe('Template variable substitution', () => {
    it('${PROJECT_NAME} in templates is replaced with actual project name', async () => {
      const state = createNextjsState();
      state.projectName = 'awesome-server';
      const files = await generateBoilerplate(state, tempDir);

      // No file content should contain the literal placeholder
      for (const file of files) {
        expect(file.content).not.toContain('${PROJECT_NAME}');
      }

      // The project name should appear in relevant files (e.g., package.json)
      const packageJson = findFile(files, 'package.json');
      if (packageJson) {
        expect(packageJson.content).toContain('awesome-server');
      }
    });

    it('${DOMAIN} is replaced with domain name', async () => {
      const state = createNextjsState();
      state.domain.name = 'myspecial.domain.com';
      const files = await generateBoilerplate(state, tempDir);

      // No file content should contain the literal placeholder
      for (const file of files) {
        expect(file.content).not.toContain('${DOMAIN}');
      }

      // The domain should appear in config files if referenced
      const allContent = files.map((f) => f.content).join('\n');
      // Domain may appear in env files, compose config, or app config
      if (allContent.includes('domain') || allContent.includes('DOMAIN')) {
        expect(allContent).toContain('myspecial.domain.com');
      }
    });

    it('${ADMIN_USER} is replaced with admin username', async () => {
      const state = createNextjsState();
      state.admin.username = 'superadmin';
      const files = await generateBoilerplate(state, tempDir);

      // No file content should contain the literal placeholder
      for (const file of files) {
        expect(file.content).not.toContain('${ADMIN_USER}');
      }
    });
  });

  // =========================================================================
  // Multi-framework scaffold
  // =========================================================================

  describe('Multi-framework scaffold generation', () => {
    it('python:fastapi + nodejs:express generates both app directories', async () => {
      const state = createMultiFrameworkState();
      const files = await generateBoilerplate(state, tempDir);

      const fastapiFiles = files.filter((f) => f.path.startsWith('apps/fastapi-app/'));
      const expressFiles = files.filter((f) => f.path.startsWith('apps/express-app/'));

      expect(fastapiFiles.length).toBeGreaterThan(0);
      expect(expressFiles.length).toBeGreaterThan(0);
    });

    it('each app directory has its own Dockerfile', async () => {
      const state = createMultiFrameworkState();
      const files = await generateBoilerplate(state, tempDir);

      const fastapiDockerfile = findFile(files, 'apps/fastapi-app/Dockerfile');
      const expressDockerfile = findFile(files, 'apps/express-app/Dockerfile');

      expect(fastapiDockerfile).toBeDefined();
      expect(expressDockerfile).toBeDefined();

      // FastAPI should use Python image, Express should use Node image
      expect(fastapiDockerfile!.content).toMatch(/FROM\s+python:/i);
      expect(expressDockerfile!.content).toMatch(/FROM\s+node:/i);
    });
  });

  // =========================================================================
  // Boilerplate disabled
  // =========================================================================

  describe('Boilerplate disabled', () => {
    it('boilerplate.generate=false returns empty array', async () => {
      const state = createNextjsState();
      state.boilerplate.generate = false;
      const files = await generateBoilerplate(state, tempDir);

      expect(files).toEqual([]);
    });

    it('boilerplate.generate=true but no languages returns empty array', async () => {
      const state = createDefaultWizardState();
      state.boilerplate.generate = true;
      state.devStack = {
        languages: [],
        frameworks: {},
        frontend: [],
      };
      const files = await generateBoilerplate(state, tempDir);

      expect(files).toEqual([]);
    });
  });

  // =========================================================================
  // Sample data
  // =========================================================================

  describe('Sample data generation', () => {
    it('sampleData=true includes seed files or sample code', async () => {
      const state = createNextjsState();
      state.boilerplate.sampleData = true;
      const files = await generateBoilerplate(state, tempDir);

      // Should contain sample/seed files (e.g., seed data, example pages, sample API routes)
      const sampleFiles = files.filter(
        (f) =>
          f.path.includes('seed') ||
          f.path.includes('sample') ||
          f.path.includes('example') ||
          f.path.includes('demo'),
      );

      expect(sampleFiles.length).toBeGreaterThan(0);
    });

    it('sampleData=false does not include sample data files', async () => {
      const state = createNextjsState();
      state.boilerplate.sampleData = false;
      const files = await generateBoilerplate(state, tempDir);

      const sampleFiles = files.filter(
        (f) =>
          f.path.includes('seed') ||
          f.path.includes('sample') ||
          f.path.includes('example') ||
          f.path.includes('demo'),
      );

      expect(sampleFiles.length).toBe(0);
    });
  });

  // =========================================================================
  // Python scaffold generation
  // =========================================================================

  describe('Python FastAPI scaffold generation', () => {
    it('creates apps/fastapi-app/ directory structure', async () => {
      const state = createFastapiState();
      const files = await generateBoilerplate(state, tempDir);

      expect(files.length).toBeGreaterThan(0);

      const fastapiFiles = files.filter((f) => f.path.startsWith('apps/fastapi-app/'));
      expect(fastapiFiles.length).toBeGreaterThan(0);
    });

    it('generated files include requirements.txt', async () => {
      const state = createFastapiState();
      const files = await generateBoilerplate(state, tempDir);

      const requirementsTxt = findFile(files, 'apps/fastapi-app/requirements.txt');
      expect(requirementsTxt).toBeDefined();
      expect(requirementsTxt!.content).toContain('fastapi');
    });

    it('generated files include main.py', async () => {
      const state = createFastapiState();
      const files = await generateBoilerplate(state, tempDir);

      const mainPy = findFile(files, 'apps/fastapi-app/main.py');
      expect(mainPy).toBeDefined();
      expect(mainPy!.content).toBeTruthy();
    });

    it('generated files include Dockerfile', async () => {
      const state = createFastapiState();
      const files = await generateBoilerplate(state, tempDir);

      const dockerfile = findFile(files, 'apps/fastapi-app/Dockerfile');
      expect(dockerfile).toBeDefined();
      expect(dockerfile!.content).toBeTruthy();
    });

    it('Python Dockerfile uses python base image', async () => {
      const state = createFastapiState();
      const files = await generateBoilerplate(state, tempDir);

      const dockerfile = findFile(files, 'apps/fastapi-app/Dockerfile');
      expect(dockerfile).toBeDefined();
      expect(dockerfile!.content).toMatch(/FROM\s+python:/i);
    });
  });

  // =========================================================================
  // getScaffoldTemplate
  // =========================================================================

  describe('getScaffoldTemplate', () => {
    it('returns correct template for nodejs/nextjs', () => {
      const template = getScaffoldTemplate('nodejs' as Language, 'nextjs');

      expect(template).toBeDefined();
      expect(template.appDir).toBe('nextjs-app');
      expect(template.files.length).toBeGreaterThan(0);

      // Should include essential files
      const filePaths = template.files.map((f) => f.path);
      expect(filePaths).toContain('package.json');
      expect(filePaths).toContain('Dockerfile');
    });

    it('returns correct template for nodejs/express', () => {
      const template = getScaffoldTemplate('nodejs' as Language, 'express');

      expect(template).toBeDefined();
      expect(template.appDir).toBe('express-app');
      expect(template.files.length).toBeGreaterThan(0);

      const filePaths = template.files.map((f) => f.path);
      expect(filePaths).toContain('package.json');
      expect(filePaths).toContain('Dockerfile');
    });

    it('returns correct template for python/fastapi', () => {
      const template = getScaffoldTemplate('python' as Language, 'fastapi');

      expect(template).toBeDefined();
      expect(template.appDir).toBe('fastapi-app');
      expect(template.files.length).toBeGreaterThan(0);

      const filePaths = template.files.map((f) => f.path);
      expect(filePaths).toContain('requirements.txt');
      expect(filePaths).toContain('main.py');
      expect(filePaths).toContain('Dockerfile');
    });

    it('template files contain template strings for variable substitution', () => {
      const template = getScaffoldTemplate('nodejs' as Language, 'nextjs');

      // At least one file should contain template variables before substitution
      const hasTemplateVars = template.files.some(
        (f) =>
          f.template.includes('${PROJECT_NAME}') ||
          f.template.includes('${DOMAIN}') ||
          f.template.includes('${ADMIN_USER}'),
      );

      expect(hasTemplateVars).toBe(true);
    });
  });

  // =========================================================================
  // File writing to disk
  // =========================================================================

  describe('File writing to output directory', () => {
    it('generateBoilerplate writes files to the specified output directory', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      // Verify files are actually written to disk
      for (const file of files) {
        const absolutePath = join(tempDir, file.path);
        expect(existsSync(absolutePath)).toBe(true);
      }
    });

    it('written file contents match returned file contents', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      for (const file of files) {
        const absolutePath = join(tempDir, file.path);
        const diskContent = readFileSync(absolutePath, 'utf-8');
        expect(diskContent).toBe(file.content);
      }
    });

    it('creates necessary subdirectories automatically', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      // The apps/nextjs-app/src/app/ directory should be created
      const deepFile = files.find((f) => f.path.includes('src/app/'));
      if (deepFile) {
        const absolutePath = join(tempDir, deepFile.path);
        expect(existsSync(absolutePath)).toBe(true);
      }
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('handles language with no framework gracefully', async () => {
      const state = createDefaultWizardState();
      state.boilerplate.generate = true;
      state.devStack = {
        languages: ['go'] as Language[],
        frameworks: {},  // no framework selected for go
        frontend: [],
      };

      // Should not throw, may return empty or a default Go scaffold
      await expect(generateBoilerplate(state, tempDir)).resolves.toBeDefined();
    });

    it('generated files have non-empty content', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      for (const file of files) {
        // Skip .gitkeep or similar marker files
        if (file.path.endsWith('.gitkeep')) continue;
        expect(file.content.length).toBeGreaterThan(0);
      }
    });

    it('generated file paths use forward slashes (posix style)', async () => {
      const state = createNextjsState();
      const files = await generateBoilerplate(state, tempDir);

      for (const file of files) {
        expect(file.path).not.toContain('\\');
      }
    });

    it('no duplicate file paths in generated output', async () => {
      const state = createMultiFrameworkState();
      const files = await generateBoilerplate(state, tempDir);

      const paths = files.map((f) => f.path);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(paths.length);
    });
  });
});
