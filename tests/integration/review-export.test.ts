/**
 * T064 — Review & Export Integration Tests
 *
 * Tests the pure data functions used by the Review step (Step 5):
 *   - generateReviewSections(): renders all wizard selections into organized sections
 *   - exportConfig(): writes a sanitized brewnet.config.json (no secrets)
 *   - importConfig(): reads config JSON and restores WizardState
 *
 * Test cases (from TEST_CASES.md):
 *   TC-07-01: All steps completed → Step 5 renders all selections in organized sections
 *   TC-07-02: 5 services selected → resource estimate shown (RAM/disk totals match)
 *   TC-07-03: Review screen → "Export configuration" → brewnet.config.json written
 *   TC-07-04: Exported config exists → `brewnet init --config` → all fields pre-populated
 *   TC-07-05: Admin credentials set → credential propagation section lists all services
 *   TC-07-06: Review screen → "Modify" → returns to step where user last made a change
 *   TC-07-07: Review screen → Ctrl+C → state saved, user can resume
 *
 * Approach: Test the pure data functions (generateReviewSections, exportConfig,
 * importConfig) without interactive prompts. Validate with Zod schemas.
 *
 * @module tests/integration/review-export
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createDefaultWizardState,
  applyFullInstallDefaults,
} from '../../packages/cli/src/config/defaults.js';

import {
  estimateResources,
  getCredentialTargets,
  collectAllServices,
} from '../../packages/cli/src/utils/resources.js';

import {
  brewnetConfigSchema,
  validateBrewnetConfig,
  safeValidateBrewnetConfig,
} from '../../packages/shared/src/schemas/config.schema.js';

import {
  wizardStateSchema,
  safeValidateWizardState,
} from '../../packages/shared/src/schemas/wizard-state.schema.js';

import type { WizardState } from '../../packages/shared/src/types/wizard-state.js';
import type { BrewnetConfig } from '../../packages/shared/src/schemas/config.schema.js';

import { WizardStep, STEP_NAMES } from '../../packages/cli/src/wizard/navigation.js';

// ---------------------------------------------------------------------------
// Types for the review module (mirrors the planned implementation)
// ---------------------------------------------------------------------------

/**
 * A single section in the review screen, containing a title and items.
 */
interface ReviewSection {
  id: string;
  title: string;
  step: WizardStep;
  items: ReviewItem[];
}

interface ReviewItem {
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Pure functions under test — these will live in wizard/steps/review.ts
// For now they are defined inline so the tests can run TDD-style.
// The implementation should be moved to the module and imported.
// ---------------------------------------------------------------------------

/**
 * Generate organized review sections from the wizard state.
 * Each section corresponds to a wizard step and lists the relevant selections.
 */
function generateReviewSections(state: WizardState): ReviewSection[] {
  const sections: ReviewSection[] = [];

  // --- Project section (Step 1) ---
  const projectItems: ReviewItem[] = [
    { label: 'Project Name', value: state.projectName },
    { label: 'Project Path', value: state.projectPath },
    { label: 'Setup Type', value: state.setupType === 'full' ? 'Full Install' : 'Partial Install' },
  ];
  sections.push({
    id: 'project',
    title: 'Project Setup',
    step: WizardStep.ProjectSetup,
    items: projectItems,
  });

  // --- Admin section (Step 2 — top half) ---
  const adminItems: ReviewItem[] = [
    { label: 'Admin Username', value: state.admin.username },
    { label: 'Admin Password', value: '••••••••' }, // masked for security
    { label: 'Credential Storage', value: state.admin.storage },
  ];
  sections.push({
    id: 'admin',
    title: 'Admin Account',
    step: WizardStep.ServerComponents,
    items: adminItems,
  });

  // --- Server Components section (Step 2 — bottom half) ---
  const serverItems: ReviewItem[] = [];

  // Web Server (always enabled)
  serverItems.push({ label: 'Web Server', value: state.servers.webServer.service });

  // Git Server (always enabled)
  serverItems.push({
    label: 'Git Server',
    value: `${state.servers.gitServer.service} (port ${state.servers.gitServer.port}, SSH ${state.servers.gitServer.sshPort})`,
  });

  // File Server
  if (state.servers.fileServer.enabled && state.servers.fileServer.service) {
    serverItems.push({ label: 'File Server', value: state.servers.fileServer.service });
  }

  // Database
  if (state.servers.dbServer.enabled && state.servers.dbServer.primary) {
    const dbLabel = `${state.servers.dbServer.primary} ${state.servers.dbServer.primaryVersion}`.trim();
    serverItems.push({ label: 'Database', value: dbLabel });
    if (state.servers.dbServer.cache) {
      serverItems.push({ label: 'Cache', value: state.servers.dbServer.cache });
    }
    if (state.servers.dbServer.adminUI) {
      serverItems.push({ label: 'DB Admin UI', value: 'Enabled' });
    }
  }

  // Media
  if (state.servers.media.enabled && state.servers.media.services.length > 0) {
    serverItems.push({ label: 'Media', value: state.servers.media.services.join(', ') });
  }

  // SSH
  if (state.servers.sshServer.enabled) {
    const sshDesc = `Port ${state.servers.sshServer.port}${state.servers.sshServer.sftp ? ' + SFTP' : ''}`;
    serverItems.push({ label: 'SSH Server', value: sshDesc });
  }

  // Mail
  if (state.servers.mailServer.enabled) {
    serverItems.push({ label: 'Mail Server', value: state.servers.mailServer.service });
  }

  // FileBrowser
  if (state.servers.fileBrowser.enabled && state.servers.fileBrowser.mode) {
    serverItems.push({ label: 'File Browser', value: state.servers.fileBrowser.mode });
  }

  sections.push({
    id: 'servers',
    title: 'Server Components',
    step: WizardStep.ServerComponents,
    items: serverItems,
  });

  // --- Dev Stack section (Step 3) ---
  const devItems: ReviewItem[] = [];
  if (state.devStack.languages.length > 0) {
    devItems.push({ label: 'Languages', value: state.devStack.languages.join(', ') });
    for (const [lang, fw] of Object.entries(state.devStack.frameworks)) {
      if (fw) {
        devItems.push({ label: `${lang} Framework`, value: fw });
      }
    }
  }
  if (state.devStack.frontend !== null) {
    devItems.push({ label: 'Frontend', value: state.devStack.frontend });
  }
  if (devItems.length === 0) {
    devItems.push({ label: 'Dev Stack', value: 'Skipped' });
  }
  sections.push({
    id: 'devStack',
    title: 'Dev Stack & Runtime',
    step: WizardStep.DevStack,
    items: devItems,
  });

  // --- Domain & Network section (Step 4) ---
  const domainItems: ReviewItem[] = [
    { label: 'Domain Provider', value: state.domain.provider },
    { label: 'Domain Name', value: state.domain.name },
    { label: 'SSL', value: state.domain.ssl },
  ];
  if (state.domain.cloudflare.enabled) {
    domainItems.push({ label: 'Cloudflare Tunnel', value: state.domain.cloudflare.tunnelName || 'Enabled' });
  }
  sections.push({
    id: 'domain',
    title: 'Domain & Network',
    step: WizardStep.DomainNetwork,
    items: domainItems,
  });

  // --- Resource Estimate section ---
  const resources = estimateResources(state as any);
  const resourceItems: ReviewItem[] = [
    { label: 'Containers', value: String(resources.containers) },
    { label: 'Estimated RAM', value: resources.ramGB },
    { label: 'Estimated Disk', value: `${resources.diskGB} GB` },
  ];
  sections.push({
    id: 'resources',
    title: 'Resource Estimate',
    step: WizardStep.Review,
    items: resourceItems,
  });

  // --- Credential Propagation section ---
  const targets = getCredentialTargets(state as any);
  if (targets.length > 0) {
    sections.push({
      id: 'credentials',
      title: 'Credential Propagation',
      step: WizardStep.ServerComponents,
      items: targets.map((t) => ({ label: t, value: `← ${state.admin.username}` })),
    });
  }

  return sections;
}

/**
 * Export wizard state to a sanitized config file (no secrets).
 * Writes the file to `<projectPath>/brewnet.config.json`.
 * Returns the absolute path of the written file.
 */
function exportConfig(state: WizardState, projectPath: string): string {
  // Strip sensitive fields
  const config: BrewnetConfig = {
    schemaVersion: state.schemaVersion,
    projectName: state.projectName,
    projectPath: state.projectPath,
    setupType: state.setupType,
    admin: {
      username: state.admin.username,
      storage: state.admin.storage,
    },
    servers: {
      webServer: { ...state.servers.webServer },
      fileServer: { ...state.servers.fileServer },
      gitServer: { ...state.servers.gitServer },
      dbServer: {
        enabled: state.servers.dbServer.enabled,
        primary: state.servers.dbServer.primary,
        primaryVersion: state.servers.dbServer.primaryVersion,
        dbName: state.servers.dbServer.dbName,
        dbUser: state.servers.dbServer.dbUser,
        adminUI: state.servers.dbServer.adminUI,
        pgadminEmail: state.servers.dbServer.pgadminEmail,
        cache: state.servers.dbServer.cache,
        // dbPassword excluded
      },
      media: { ...state.servers.media },
      sshServer: { ...state.servers.sshServer },
      mailServer: { ...state.servers.mailServer },
      appServer: { ...state.servers.appServer },
      fileBrowser: { ...state.servers.fileBrowser },
    },
    devStack: { ...state.devStack },
    boilerplate: { ...state.boilerplate },
    domain: {
      provider: state.domain.provider,
      name: state.domain.name,
      ssl: state.domain.ssl,
      cloudflare: {
        enabled: state.domain.cloudflare.enabled,
        tunnelName: state.domain.cloudflare.tunnelName,
        // tunnelToken excluded
      },
    },
  };

  mkdirSync(projectPath, { recursive: true });
  const filePath = join(projectPath, 'brewnet.config.json');
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  return filePath;
}

/**
 * Import a config file and restore it to a WizardState.
 * Sensitive fields are populated with empty defaults (to be re-generated).
 */
function importConfig(configPath: string): WizardState {
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);

  // Validate against the config schema first
  const config = validateBrewnetConfig(parsed);

  // Reconstruct full WizardState by adding back secret fields with defaults
  const state: WizardState = {
    schemaVersion: config.schemaVersion,
    projectName: config.projectName,
    projectPath: config.projectPath,
    setupType: config.setupType,
    admin: {
      username: config.admin.username,
      password: '', // must be re-generated
      storage: config.admin.storage,
    },
    servers: {
      webServer: config.servers.webServer,
      fileServer: config.servers.fileServer,
      gitServer: config.servers.gitServer,
      dbServer: {
        ...config.servers.dbServer,
        dbPassword: '', // must be re-generated
      },
      media: config.servers.media,
      sshServer: config.servers.sshServer,
      mailServer: {
        ...config.servers.mailServer,
        port25Blocked: false,
        relayProvider: '' as const,
        relayHost: '',
        relayPort: 587,
        relayUser: '',
        relayPassword: '',
      },
      appServer: config.servers.appServer,
      fileBrowser: config.servers.fileBrowser,
    },
    devStack: config.devStack,
    boilerplate: config.boilerplate,
    domain: {
      ...config.domain,
      cloudflare: {
        enabled: config.domain.cloudflare.enabled,
        tunnelName: config.domain.cloudflare.tunnelName,
        tunnelMode: 'none' as const,
        quickTunnelUrl: '',
        accountId: '',
        apiToken: '',
        tunnelId: '',
        tunnelToken: '', // must be re-supplied
        zoneId: '',
        zoneName: '',
      },
    },
    portRemapping: {},
  };

  return state;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function cloneState(state: WizardState): WizardState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Create a fully-populated WizardState suitable for review.
 * Fills in admin password and other required fields so it passes Zod validation.
 */
function createCompletedState(): WizardState {
  const state = applyFullInstallDefaults(createDefaultWizardState());
  return {
    ...state,
    projectName: 'test-project',
    projectPath: '~/brewnet/test-project',
    admin: {
      ...state.admin,
      password: 'SuperSecurePassword123!',
    },
    servers: {
      ...state.servers,
      dbServer: {
        ...state.servers.dbServer,
        dbPassword: 'DbSecretPass456!',
      },
      fileServer: { enabled: true, service: 'nextcloud' },
      media: { enabled: true, services: ['jellyfin'] },
      sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      mailServer: {
        ...state.servers.mailServer,
        enabled: false,
      },
      appServer: { enabled: true },
      fileBrowser: { enabled: true, mode: 'standalone' },
    },
    devStack: {
      languages: ['nodejs', 'python'],
      frameworks: { nodejs: 'nextjs', python: 'fastapi' },
      frontend: 'react',
    },
    domain: {
      provider: 'tunnel',
      name: 'myserver.example.com',
      ssl: 'cloudflare',
      cloudflare: {
        ...state.domain.cloudflare,
        enabled: true,
        tunnelToken: 'secret-tunnel-token-xyz',
        tunnelName: 'my-tunnel',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('T064 — Review & Export', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `brewnet-test-review-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // TC-07-01: generateReviewSections — all selections in organized sections
  // =========================================================================

  describe('TC-07-01: generateReviewSections', () => {
    it('returns sections for: Project, Admin, Servers, Dev Stack, Domain, Resources, Credentials', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const sectionIds = sections.map((s) => s.id);

      expect(sectionIds).toContain('project');
      expect(sectionIds).toContain('admin');
      expect(sectionIds).toContain('servers');
      expect(sectionIds).toContain('devStack');
      expect(sectionIds).toContain('domain');
      expect(sectionIds).toContain('resources');
      expect(sectionIds).toContain('credentials');
    });

    it('Project section lists project name, path, and setup type', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const projectSection = sections.find((s) => s.id === 'project')!;

      expect(projectSection.title).toBe('Project Setup');
      expect(projectSection.step).toBe(WizardStep.ProjectSetup);

      const labels = projectSection.items.map((i) => i.label);
      expect(labels).toContain('Project Name');
      expect(labels).toContain('Project Path');
      expect(labels).toContain('Setup Type');

      const nameItem = projectSection.items.find((i) => i.label === 'Project Name')!;
      expect(nameItem.value).toBe('test-project');
    });

    it('Admin section masks the password', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const adminSection = sections.find((s) => s.id === 'admin')!;

      const passwordItem = adminSection.items.find((i) => i.label === 'Admin Password')!;
      expect(passwordItem.value).not.toContain('SuperSecure');
      expect(passwordItem.value).toBe('••••••••');
    });

    it('Server Components section lists all enabled services', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const serversSection = sections.find((s) => s.id === 'servers')!;

      const labels = serversSection.items.map((i) => i.label);
      expect(labels).toContain('Web Server');
      expect(labels).toContain('Git Server');
      expect(labels).toContain('File Server');
      expect(labels).toContain('Database');
      expect(labels).toContain('Cache');
      expect(labels).toContain('DB Admin UI');
      expect(labels).toContain('Media');
      expect(labels).toContain('SSH Server');
      expect(labels).toContain('File Browser');
    });

    it('Server Components section omits disabled services', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';
      const sections = generateReviewSections(state);
      const serversSection = sections.find((s) => s.id === 'servers')!;

      const labels = serversSection.items.map((i) => i.label);
      // Web Server and Git Server are always present (required)
      expect(labels).toContain('Web Server');
      expect(labels).toContain('Git Server');
      // These are disabled in default state
      expect(labels).not.toContain('File Server');
      expect(labels).not.toContain('Media');
      expect(labels).not.toContain('SSH Server');
      expect(labels).not.toContain('Mail Server');
      expect(labels).not.toContain('File Browser');
    });

    it('Dev Stack section shows languages and frameworks when selected', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const devSection = sections.find((s) => s.id === 'devStack')!;

      expect(devSection.title).toBe('Dev Stack & Runtime');
      expect(devSection.step).toBe(WizardStep.DevStack);

      const langItem = devSection.items.find((i) => i.label === 'Languages')!;
      expect(langItem.value).toContain('nodejs');
      expect(langItem.value).toContain('python');

      const frontendItem = devSection.items.find((i) => i.label === 'Frontend')!;
      expect(frontendItem.value).toBe('react');

      // Framework entries
      const frameworkLabels = devSection.items
        .filter((i) => i.label.includes('Framework'))
        .map((i) => i.value);
      expect(frameworkLabels).toContain('nextjs');
      expect(frameworkLabels).toContain('fastapi');
    });

    it('Dev Stack section shows "Skipped" when no languages or frontend selected', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';
      const sections = generateReviewSections(state);
      const devSection = sections.find((s) => s.id === 'devStack')!;

      expect(devSection.items).toHaveLength(1);
      expect(devSection.items[0].label).toBe('Dev Stack');
      expect(devSection.items[0].value).toBe('Skipped');
    });

    it('Domain section shows domain provider, name, SSL, and Cloudflare tunnel', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const domainSection = sections.find((s) => s.id === 'domain')!;

      expect(domainSection.title).toBe('Domain & Network');
      expect(domainSection.step).toBe(WizardStep.DomainNetwork);

      const labels = domainSection.items.map((i) => i.label);
      expect(labels).toContain('Domain Provider');
      expect(labels).toContain('Domain Name');
      expect(labels).toContain('SSL');
      expect(labels).toContain('Cloudflare Tunnel');

      const domainNameItem = domainSection.items.find((i) => i.label === 'Domain Name')!;
      expect(domainNameItem.value).toBe('myserver.example.com');
    });

    it('Domain section omits Cloudflare Tunnel when disabled', () => {
      const state = createCompletedState();
      state.domain.cloudflare.enabled = false;
      const sections = generateReviewSections(state);
      const domainSection = sections.find((s) => s.id === 'domain')!;

      const labels = domainSection.items.map((i) => i.label);
      expect(labels).not.toContain('Cloudflare Tunnel');
    });

    it('each section has a step reference for "Modify" navigation', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);

      for (const section of sections) {
        expect(typeof section.step).toBe('number');
        expect(section.step).toBeGreaterThanOrEqual(WizardStep.SystemCheck);
        expect(section.step).toBeLessThanOrEqual(WizardStep.Complete);
      }

      // Verify specific section-step mappings
      expect(sections.find((s) => s.id === 'project')!.step).toBe(WizardStep.ProjectSetup);
      expect(sections.find((s) => s.id === 'servers')!.step).toBe(WizardStep.ServerComponents);
      expect(sections.find((s) => s.id === 'devStack')!.step).toBe(WizardStep.DevStack);
      expect(sections.find((s) => s.id === 'domain')!.step).toBe(WizardStep.DomainNetwork);
    });
  });

  // =========================================================================
  // TC-07-02: Resource estimate matches estimateResources()
  // =========================================================================

  describe('TC-07-02: Resource estimate in review matches estimateResources()', () => {
    it('resource section RAM/disk totals match estimateResources() output', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const resourceSection = sections.find((s) => s.id === 'resources')!;

      const expected = estimateResources(state as any);

      const ramItem = resourceSection.items.find((i) => i.label === 'Estimated RAM')!;
      const diskItem = resourceSection.items.find((i) => i.label === 'Estimated Disk')!;
      const containersItem = resourceSection.items.find((i) => i.label === 'Containers')!;

      expect(ramItem.value).toBe(expected.ramGB);
      expect(diskItem.value).toBe(`${expected.diskGB} GB`);
      expect(containersItem.value).toBe(String(expected.containers));
    });

    it('resource estimate increases when more services are enabled', () => {
      const minimal = createDefaultWizardState();
      minimal.admin.password = 'testPassword123!';
      const full = createCompletedState();

      const minResources = estimateResources(minimal as any);
      const fullResources = estimateResources(full as any);

      expect(fullResources.ramMB).toBeGreaterThan(minResources.ramMB);
      expect(fullResources.diskGB).toBeGreaterThan(minResources.diskGB);
      expect(fullResources.containers).toBeGreaterThan(minResources.containers);
    });

    it('5+ services selected shows correct container count', () => {
      const state = createCompletedState();
      const resources = estimateResources(state as any);
      const services = collectAllServices(state as any);

      // The completed state has: traefik, gitea, nextcloud, jellyfin,
      // postgresql, pgadmin, redis, openssh-server, filebrowser, cloudflared
      // Plus app server (if languages selected)
      expect(resources.containers).toBeGreaterThanOrEqual(5);
      expect(services.length).toBeGreaterThanOrEqual(5);
    });
  });

  // =========================================================================
  // TC-07-03: exportConfig writes valid brewnet.config.json
  // =========================================================================

  describe('TC-07-03: exportConfig writes valid JSON', () => {
    it('writes a file at <projectPath>/brewnet.config.json', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);

      expect(filePath).toBe(join(tmpDir, 'brewnet.config.json'));
      expect(existsSync(filePath)).toBe(true);
    });

    it('written JSON is valid and parseable', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);
      const raw = readFileSync(filePath, 'utf-8');

      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('written JSON passes BrewnetConfig Zod schema validation', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      const result = safeValidateBrewnetConfig(parsed);
      expect(result.success).toBe(true);
    });

    it('exported config does NOT contain admin password', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);
      const raw = readFileSync(filePath, 'utf-8');

      expect(raw).not.toContain('SuperSecurePassword123!');
      expect(raw).not.toContain(state.admin.password);

      const parsed = JSON.parse(raw);
      expect(parsed.admin.password).toBeUndefined();
    });

    it('exported config does NOT contain dbPassword', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);
      const raw = readFileSync(filePath, 'utf-8');

      expect(raw).not.toContain('DbSecretPass456!');

      const parsed = JSON.parse(raw);
      expect(parsed.servers.dbServer.dbPassword).toBeUndefined();
    });

    it('exported config does NOT contain Cloudflare tunnelToken', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);
      const raw = readFileSync(filePath, 'utf-8');

      expect(raw).not.toContain('secret-tunnel-token-xyz');

      const parsed = JSON.parse(raw);
      expect(parsed.domain.cloudflare.tunnelToken).toBeUndefined();
    });

    it('exported config preserves all non-secret fields', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));

      expect(parsed.projectName).toBe('test-project');
      expect(parsed.projectPath).toBe('~/brewnet/test-project');
      expect(parsed.setupType).toBe('full');
      expect(parsed.admin.username).toBe('admin');
      expect(parsed.servers.webServer.service).toBe('traefik');
      expect(parsed.servers.gitServer.service).toBe('gitea');
      expect(parsed.servers.fileServer.service).toBe('nextcloud');
      expect(parsed.servers.dbServer.primary).toBe('postgresql');
      expect(parsed.servers.dbServer.cache).toBe('redis');
      expect(parsed.devStack.languages).toEqual(['nodejs', 'python']);
      expect(parsed.devStack.frameworks).toEqual({ nodejs: 'nextjs', python: 'fastapi' });
      expect(parsed.devStack.frontend).toBe('react');
      expect(parsed.domain.provider).toBe('tunnel');
      expect(parsed.domain.name).toBe('myserver.example.com');
      expect(parsed.domain.ssl).toBe('cloudflare');
      expect(parsed.domain.cloudflare.enabled).toBe(true);
      expect(parsed.domain.cloudflare.tunnelName).toBe('my-tunnel');
    });

    it('creates project directory if it does not exist', () => {
      const state = createCompletedState();
      const nestedDir = join(tmpDir, 'nested', 'deep', 'project');

      expect(existsSync(nestedDir)).toBe(false);
      const filePath = exportConfig(state, nestedDir);
      expect(existsSync(filePath)).toBe(true);
    });
  });

  // =========================================================================
  // TC-07-04: importConfig reads JSON and restores WizardState
  // =========================================================================

  describe('TC-07-04: importConfig reads config and pre-populates state', () => {
    it('reads a valid config file and returns a WizardState', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);

      const imported = importConfig(filePath);

      expect(imported).toBeDefined();
      expect(imported.schemaVersion).toBe(7);
      expect(imported.projectName).toBe('test-project');
    });

    it('imported state has empty password fields (must be re-generated)', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);

      const imported = importConfig(filePath);

      expect(imported.admin.password).toBe('');
      expect(imported.servers.dbServer.dbPassword).toBe('');
      expect(imported.domain.cloudflare.tunnelToken).toBe('');
    });

    it('imported state preserves all non-secret selections', () => {
      const state = createCompletedState();
      const filePath = exportConfig(state, tmpDir);
      const imported = importConfig(filePath);

      expect(imported.projectName).toBe(state.projectName);
      expect(imported.projectPath).toBe(state.projectPath);
      expect(imported.setupType).toBe(state.setupType);
      expect(imported.admin.username).toBe(state.admin.username);
      expect(imported.admin.storage).toBe(state.admin.storage);
      expect(imported.servers.webServer.service).toBe(state.servers.webServer.service);
      expect(imported.servers.gitServer.service).toBe(state.servers.gitServer.service);
      expect(imported.servers.gitServer.port).toBe(state.servers.gitServer.port);
      expect(imported.servers.gitServer.sshPort).toBe(state.servers.gitServer.sshPort);
      expect(imported.servers.fileServer.enabled).toBe(state.servers.fileServer.enabled);
      expect(imported.servers.fileServer.service).toBe(state.servers.fileServer.service);
      expect(imported.servers.dbServer.primary).toBe(state.servers.dbServer.primary);
      expect(imported.servers.dbServer.primaryVersion).toBe(state.servers.dbServer.primaryVersion);
      expect(imported.servers.dbServer.dbName).toBe(state.servers.dbServer.dbName);
      expect(imported.servers.dbServer.dbUser).toBe(state.servers.dbServer.dbUser);
      expect(imported.servers.dbServer.adminUI).toBe(state.servers.dbServer.adminUI);
      expect(imported.servers.dbServer.cache).toBe(state.servers.dbServer.cache);
      expect(imported.servers.media.enabled).toBe(state.servers.media.enabled);
      expect(imported.servers.media.services).toEqual(state.servers.media.services);
      expect(imported.servers.sshServer).toEqual(state.servers.sshServer);
      expect(imported.servers.mailServer).toEqual(state.servers.mailServer);
      expect(imported.servers.appServer).toEqual(state.servers.appServer);
      expect(imported.servers.fileBrowser).toEqual(state.servers.fileBrowser);
      expect(imported.devStack).toEqual(state.devStack);
      expect(imported.boilerplate).toEqual(state.boilerplate);
      expect(imported.domain.provider).toBe(state.domain.provider);
      expect(imported.domain.name).toBe(state.domain.name);
      expect(imported.domain.ssl).toBe(state.domain.ssl);
      expect(imported.domain.cloudflare.enabled).toBe(state.domain.cloudflare.enabled);
      expect(imported.domain.cloudflare.tunnelName).toBe(state.domain.cloudflare.tunnelName);
    });

    it('throws on invalid JSON', () => {
      const badPath = join(tmpDir, 'bad.json');
      writeFileSync(badPath, '{ invalid json }', 'utf-8');

      expect(() => importConfig(badPath)).toThrow();
    });

    it('throws on valid JSON that does not match config schema', () => {
      const badPath = join(tmpDir, 'wrong-schema.json');
      writeFileSync(badPath, JSON.stringify({ foo: 'bar' }), 'utf-8');

      expect(() => importConfig(badPath)).toThrow();
    });

    it('throws when file does not exist', () => {
      expect(() => importConfig(join(tmpDir, 'nonexistent.json'))).toThrow();
    });
  });

  // =========================================================================
  // Round-trip: export → import → state matches
  // =========================================================================

  describe('Round-trip: export → import → compare', () => {
    it('non-secret fields survive a round-trip export/import', () => {
      const original = createCompletedState();
      const filePath = exportConfig(original, tmpDir);
      const restored = importConfig(filePath);

      // Secret fields are empty after import (expected)
      expect(restored.admin.password).toBe('');
      expect(restored.servers.dbServer.dbPassword).toBe('');
      expect(restored.domain.cloudflare.tunnelToken).toBe('');

      // Fill in the secrets again for comparison
      restored.admin.password = original.admin.password;
      restored.servers.dbServer.dbPassword = original.servers.dbServer.dbPassword;
      restored.domain.cloudflare.tunnelToken = original.domain.cloudflare.tunnelToken;

      // Now the full state should match
      expect(restored).toEqual(original);
    });

    it('round-trip preserves complex devStack with multiple languages', () => {
      const original = createCompletedState();
      original.devStack = {
        languages: ['nodejs', 'python', 'go'],
        frameworks: { nodejs: 'nestjs', python: 'django' },
        frontend: 'vue',
      };

      const filePath = exportConfig(original, tmpDir);
      const restored = importConfig(filePath);

      expect(restored.devStack.languages).toEqual(['nodejs', 'python', 'go']);
      expect(restored.devStack.frameworks).toEqual({ nodejs: 'nestjs', python: 'django' });
      expect(restored.devStack.frontend).toBe('vue');
    });

    it('round-trip with partial install preserves disabled servers', () => {
      const original = createDefaultWizardState();
      original.admin.password = 'testPassword123!';
      original.setupType = 'partial';
      original.servers.dbServer.enabled = false;
      original.servers.dbServer.primary = '';
      original.servers.dbServer.cache = '';

      const filePath = exportConfig(original, tmpDir);
      const restored = importConfig(filePath);

      expect(restored.setupType).toBe('partial');
      expect(restored.servers.dbServer.enabled).toBe(false);
      expect(restored.servers.dbServer.primary).toBe('');
      expect(restored.servers.dbServer.cache).toBe('');
    });
  });

  // =========================================================================
  // TC-07-05: Credential propagation section lists all services
  // =========================================================================

  describe('TC-07-05: Credential propagation in review', () => {
    it('credential section lists all services that receive admin credentials', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const credSection = sections.find((s) => s.id === 'credentials')!;

      expect(credSection).toBeDefined();
      expect(credSection.title).toBe('Credential Propagation');

      const serviceNames = credSection.items.map((i) => i.label);
      // With the completed state, these services receive admin credentials:
      expect(serviceNames).toContain('Gitea');       // always
      expect(serviceNames).toContain('Nextcloud');    // fileServer = nextcloud
      expect(serviceNames).toContain('pgAdmin');      // dbServer.adminUI = true
      expect(serviceNames).toContain('Jellyfin');     // media includes jellyfin
      expect(serviceNames).toContain('SSH Server');   // sshServer enabled
      expect(serviceNames).toContain('FileBrowser');  // fileBrowser enabled
    });

    it('credential targets show admin username in value', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const credSection = sections.find((s) => s.id === 'credentials')!;

      for (const item of credSection.items) {
        expect(item.value).toContain(state.admin.username);
      }
    });

    it('minimal state only lists Gitea in credential targets', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';
      // Default state: only gitea and dbServer (pgAdmin if adminUI)
      // Disable dbServer adminUI for this test
      state.servers.dbServer.adminUI = false;

      const sections = generateReviewSections(state);
      const credSection = sections.find((s) => s.id === 'credentials')!;

      const serviceNames = credSection.items.map((i) => i.label);
      expect(serviceNames).toEqual(['Gitea']);
    });

    it('credential targets match getCredentialTargets() output', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const credSection = sections.find((s) => s.id === 'credentials')!;

      const expectedTargets = getCredentialTargets(state as any);
      const actualNames = credSection.items.map((i) => i.label);

      expect(actualNames).toEqual(expectedTargets);
    });
  });

  // =========================================================================
  // TC-07-06: "Modify" action returns correct step reference
  // =========================================================================

  describe('TC-07-06: Modify navigation — sections reference correct steps', () => {
    it('project section references Step 1 (ProjectSetup)', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const section = sections.find((s) => s.id === 'project')!;
      expect(section.step).toBe(WizardStep.ProjectSetup);
    });

    it('servers section references Step 2 (ServerComponents)', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const section = sections.find((s) => s.id === 'servers')!;
      expect(section.step).toBe(WizardStep.ServerComponents);
    });

    it('devStack section references Step 3 (DevStack)', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const section = sections.find((s) => s.id === 'devStack')!;
      expect(section.step).toBe(WizardStep.DevStack);
    });

    it('domain section references Step 4 (DomainNetwork)', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const section = sections.find((s) => s.id === 'domain')!;
      expect(section.step).toBe(WizardStep.DomainNetwork);
    });

    it('all step references are valid WizardStep enum values', () => {
      const state = createCompletedState();
      const sections = generateReviewSections(state);
      const validSteps = Object.values(WizardStep).filter((v) => typeof v === 'number');

      for (const section of sections) {
        expect(validSteps).toContain(section.step);
      }
    });
  });

  // =========================================================================
  // TC-07-07: State persistence (Ctrl+C / resume)
  // =========================================================================

  describe('TC-07-07: State persistence for resume after Ctrl+C', () => {
    it('state can be serialized to JSON and deserialized back', () => {
      const state = createCompletedState();
      const serialized = JSON.stringify(state);
      const deserialized: WizardState = JSON.parse(serialized);

      expect(deserialized).toEqual(state);
    });

    it('serialized state can be written and read from disk', () => {
      const state = createCompletedState();
      const filePath = join(tmpDir, 'selections.json');
      writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');

      const raw = readFileSync(filePath, 'utf-8');
      const loaded: WizardState = JSON.parse(raw);

      expect(loaded.schemaVersion).toBe(7);
      expect(loaded.projectName).toBe('test-project');
      expect(loaded.admin.password).toBe('SuperSecurePassword123!');
      expect(loaded.servers.webServer.service).toBe('traefik');
      expect(loaded.devStack.languages).toEqual(['nodejs', 'python']);
    });

    it('saved state includes all fields needed to resume the wizard', () => {
      const state = createCompletedState();
      const serialized = JSON.stringify(state);
      const loaded: WizardState = JSON.parse(serialized);

      // Verify all top-level keys are present
      expect(loaded).toHaveProperty('schemaVersion');
      expect(loaded).toHaveProperty('projectName');
      expect(loaded).toHaveProperty('projectPath');
      expect(loaded).toHaveProperty('setupType');
      expect(loaded).toHaveProperty('admin');
      expect(loaded).toHaveProperty('servers');
      expect(loaded).toHaveProperty('devStack');
      expect(loaded).toHaveProperty('boilerplate');
      expect(loaded).toHaveProperty('domain');

      // Verify nested server components are all present
      expect(loaded.servers).toHaveProperty('webServer');
      expect(loaded.servers).toHaveProperty('fileServer');
      expect(loaded.servers).toHaveProperty('gitServer');
      expect(loaded.servers).toHaveProperty('dbServer');
      expect(loaded.servers).toHaveProperty('media');
      expect(loaded.servers).toHaveProperty('sshServer');
      expect(loaded.servers).toHaveProperty('mailServer');
      expect(loaded.servers).toHaveProperty('appServer');
      expect(loaded.servers).toHaveProperty('fileBrowser');
    });

    it('full state (with passwords) passes WizardState Zod validation', () => {
      const state = createCompletedState();
      const result = safeValidateWizardState(state);
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('handles state with empty devStack gracefully', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';
      state.devStack = { languages: [], frameworks: {}, frontend: null };

      const sections = generateReviewSections(state);
      const devSection = sections.find((s) => s.id === 'devStack')!;

      expect(devSection.items).toHaveLength(1);
      expect(devSection.items[0].value).toBe('Skipped');
    });

    it('handles state with empty media services array', () => {
      const state = createCompletedState();
      state.servers.media = { enabled: true, services: [] };

      const sections = generateReviewSections(state);
      const serversSection = sections.find((s) => s.id === 'servers')!;
      const labels = serversSection.items.map((i) => i.label);

      // No "Media" item since services array is empty
      expect(labels).not.toContain('Media');
    });

    it('export/import works for minimal default state', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';

      const filePath = exportConfig(state, tmpDir);
      const imported = importConfig(filePath);

      expect(imported.projectName).toBe(state.projectName);
      expect(imported.servers.webServer.service).toBe('traefik');
      expect(imported.servers.gitServer.service).toBe('gitea');
    });

    it('handles MinIO file server in credential propagation', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';
      state.servers.fileServer = { enabled: true, service: 'minio' };
      state.servers.dbServer.adminUI = false;

      const sections = generateReviewSections(state);
      const credSection = sections.find((s) => s.id === 'credentials')!;
      const serviceNames = credSection.items.map((i) => i.label);

      expect(serviceNames).toContain('MinIO');
      expect(serviceNames).toContain('Gitea');
    });

    it('SSH Server with SFTP shows in review correctly', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';
      state.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: true };

      const sections = generateReviewSections(state);
      const serversSection = sections.find((s) => s.id === 'servers')!;
      const sshItem = serversSection.items.find((i) => i.label === 'SSH Server')!;

      expect(sshItem.value).toContain('Port 2222');
      expect(sshItem.value).toContain('SFTP');
    });

    it('SSH Server without SFTP does not mention SFTP', () => {
      const state = createDefaultWizardState();
      state.admin.password = 'testPassword123!';
      state.servers.sshServer = { enabled: true, port: 2222, passwordAuth: false, sftp: false };

      const sections = generateReviewSections(state);
      const serversSection = sections.find((s) => s.id === 'servers')!;
      const sshItem = serversSection.items.find((i) => i.label === 'SSH Server')!;

      expect(sshItem.value).toContain('Port 2222');
      expect(sshItem.value).not.toContain('SFTP');
    });
  });
});
