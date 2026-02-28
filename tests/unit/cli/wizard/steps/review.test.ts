/**
 * Unit tests for wizard/steps/review module
 *
 * Covers pure functions: generateReviewSections, exportConfig, importConfig.
 * Tests review section structure, credential masking, domain section variants,
 * dev stack section, and config export/import round-trip.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const {
  generateReviewSections,
  exportConfig,
  importConfig,
} = await import(
  '../../../../../packages/cli/src/wizard/steps/review.js'
);

const { createDefaultWizardState, applyFullInstallDefaults } = await import(
  '../../../../../packages/cli/src/config/defaults.js'
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
    projectPath: '/home/user/test-project',
    admin: { ...base.admin, username: 'admin', password: 'secret123' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateReviewSections
// ---------------------------------------------------------------------------

describe('generateReviewSections', () => {
  it('returns at least 4 sections', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });

  it('includes a project section', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    const project = sections.find((s) => s.id === 'project');
    expect(project).toBeDefined();
  });

  it('project section contains project name', () => {
    const state = makeState({ projectName: 'my-home-server' });
    const sections = generateReviewSections(state);
    const project = sections.find((s) => s.id === 'project')!;
    const nameItem = project.items.find((i) => i.label === 'Project Name');
    expect(nameItem?.value).toBe('my-home-server');
  });

  it('project section shows Full Install for full setup type', () => {
    const state = makeState({ setupType: 'full' });
    const sections = generateReviewSections(state);
    const project = sections.find((s) => s.id === 'project')!;
    const typeItem = project.items.find((i) => i.label === 'Setup Type');
    expect(typeItem?.value).toBe('Full Install');
  });

  it('project section shows Partial Install for partial setup type', () => {
    const state = makeState({ setupType: 'partial' });
    const sections = generateReviewSections(state);
    const project = sections.find((s) => s.id === 'project')!;
    const typeItem = project.items.find((i) => i.label === 'Setup Type');
    expect(typeItem?.value).toBe('Partial Install');
  });

  it('includes admin section', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    const admin = sections.find((s) => s.id === 'admin');
    expect(admin).toBeDefined();
  });

  it('admin section shows admin username', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    const admin = sections.find((s) => s.id === 'admin')!;
    const userItem = admin.items.find((i) => i.label === 'Admin Username');
    expect(userItem?.value).toBe('admin');
  });

  it('admin section masks password', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    const admin = sections.find((s) => s.id === 'admin')!;
    const pwItem = admin.items.find((i) => i.label === 'Admin Password');
    expect(pwItem?.value).not.toBe('secret123');
    expect(pwItem?.value).toMatch(/•+/);
  });

  it('includes servers section', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers');
    expect(servers).toBeDefined();
  });

  it('servers section always includes web server entry', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers')!;
    const webItem = servers.items.find((i) => i.label === 'Web Server');
    expect(webItem).toBeDefined();
  });

  it('servers section includes file server when enabled', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        fileServer: { enabled: true, service: 'nextcloud' },
      },
    });
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers')!;
    const fileItem = servers.items.find((i) => i.label === 'File Server');
    expect(fileItem?.value).toBe('nextcloud');
  });

  it('servers section does NOT include file server when disabled', () => {
    const state = makeState({
      servers: {
        ...makeState().servers,
        fileServer: { enabled: false, service: null },
      },
    });
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers')!;
    const fileItem = servers.items.find((i) => i.label === 'File Server');
    expect(fileItem).toBeUndefined();
  });

  it('includes domain section', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    const domain = sections.find((s) => s.id === 'domain');
    expect(domain).toBeDefined();
  });

  it('domain section shows LAN only for local provider', () => {
    const state = makeState({
      domain: {
        provider: 'local',
        name: 'brewnet.local',
        ssl: 'self-signed',
        cloudflare: { enabled: false, tunnelToken: '', tunnelName: '', accountId: '', apiToken: '', tunnelId: '', zoneId: '', zoneName: '' },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
      },
    });
    const sections = generateReviewSections(state);
    const domain = sections.find((s) => s.id === 'domain')!;
    const accessItem = domain.items.find((i) => i.label === 'Access');
    expect(accessItem?.value).toMatch(/LAN only/i);
  });

  it('domain section shows Cloudflare Tunnel for tunnel provider', () => {
    const state = makeState({
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: { enabled: true, tunnelToken: '', tunnelName: 'my-tunnel', accountId: '', apiToken: '', tunnelId: 'tid-123', zoneId: '', zoneName: 'example.com' },
        mailServer: { enabled: false, service: 'docker-mailserver', port25Blocked: false, relayProvider: '', relayHost: '', relayPort: 587, relayUser: '', relayPassword: '' },
      },
    });
    const sections = generateReviewSections(state);
    const domain = sections.find((s) => s.id === 'domain')!;
    const accessItem = domain.items.find((i) => i.label === 'Access');
    expect(accessItem?.value).toMatch(/Cloudflare Tunnel/i);
  });

  it('dev stack section shows "Skipped" when no languages selected', () => {
    const state = makeState({
      devStack: { languages: [], frameworks: {}, frontend: null },
    });
    const sections = generateReviewSections(state);
    const devStack = sections.find((s) => s.id === 'devStack')!;
    const skippedItem = devStack.items.find((i) => i.value === 'Skipped');
    expect(skippedItem).toBeDefined();
  });

  it('dev stack section lists selected languages', () => {
    const state = makeState({
      devStack: { languages: ['nodejs', 'python'], frameworks: { nodejs: 'express', python: 'fastapi' }, frontend: null },
    });
    const sections = generateReviewSections(state);
    const devStack = sections.find((s) => s.id === 'devStack')!;
    const langItem = devStack.items.find((i) => i.label === 'Languages');
    expect(langItem?.value).toContain('nodejs');
    expect(langItem?.value).toContain('python');
  });

  it('each section has id, title, step, and items properties', () => {
    const state = makeState();
    const sections = generateReviewSections(state);
    for (const section of sections) {
      expect(section).toHaveProperty('id');
      expect(section).toHaveProperty('title');
      expect(section).toHaveProperty('step');
      expect(section).toHaveProperty('items');
      expect(Array.isArray(section.items)).toBe(true);
    }
  });

  it('resource section includes container count, RAM and disk estimates', () => {
    const state = applyFullInstallDefaults(makeState());
    const sections = generateReviewSections(state);
    const resources = sections.find((s) => s.id === 'resources');
    expect(resources).toBeDefined();
    const containers = resources!.items.find((i) => i.label === 'Containers');
    const ram = resources!.items.find((i) => i.label === 'Estimated RAM');
    const disk = resources!.items.find((i) => i.label === 'Estimated Disk');
    expect(containers).toBeDefined();
    expect(ram).toBeDefined();
    expect(disk).toBeDefined();
  });

  it('servers section includes media when enabled with services', () => {
    const base = makeState();
    const state = makeState({
      servers: {
        ...base.servers,
        media: { enabled: true, services: ['jellyfin'] },
      },
    });
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers')!;
    const mediaItem = servers.items.find((i) => i.label === 'Media');
    expect(mediaItem).toBeDefined();
    expect(mediaItem?.value).toContain('jellyfin');
  });

  it('servers section includes SSH Server when enabled', () => {
    const base = makeState();
    const state = makeState({
      servers: {
        ...base.servers,
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      },
    });
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers')!;
    const sshItem = servers.items.find((i) => i.label === 'SSH Server');
    expect(sshItem).toBeDefined();
    expect(sshItem?.value).toContain('2222');
    expect(sshItem?.value).toContain('SFTP');
  });

  it('servers section includes Mail Server when enabled', () => {
    const base = makeState();
    const state = makeState({
      servers: {
        ...base.servers,
        mailServer: {
          enabled: true,
          service: 'docker-mailserver',
          port25Blocked: false,
          relayProvider: '',
          relayHost: '',
          relayPort: 587,
          relayUser: '',
          relayPassword: '',
        },
      },
    });
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers')!;
    const mailItem = servers.items.find((i) => i.label === 'Mail Server');
    expect(mailItem).toBeDefined();
    expect(mailItem?.value).toBe('docker-mailserver');
  });

  it('servers section includes File Browser when enabled with mode', () => {
    const base = makeState();
    const state = makeState({
      servers: {
        ...base.servers,
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });
    const sections = generateReviewSections(state);
    const servers = sections.find((s) => s.id === 'servers')!;
    const fbItem = servers.items.find((i) => i.label === 'File Browser');
    expect(fbItem).toBeDefined();
    expect(fbItem?.value).toBe('standalone');
  });

  it('dev stack section lists selected frontend technologies', () => {
    const state = makeState({
      devStack: { languages: [], frameworks: {}, frontend: 'react' },
    });
    const sections = generateReviewSections(state);
    const devStack = sections.find((s) => s.id === 'devStack')!;
    const frontendItem = devStack.items.find((i) => i.label === 'Frontend');
    expect(frontendItem).toBeDefined();
    expect(frontendItem?.value).toBe('react');
  });

  it('domain section includes Mail Server with relay info when tunnel + mailServer enabled', () => {
    const base = makeState();
    const state = makeState({
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          enabled: true,
          tunnelToken: '',
          tunnelName: 'my-tunnel',
          accountId: '',
          apiToken: '',
          tunnelId: '',
          zoneId: '',
          zoneName: 'example.com',
        },
      },
      servers: {
        ...base.servers,
        mailServer: {
          enabled: true,
          service: 'docker-mailserver',
          port25Blocked: true,
          relayProvider: 'sendgrid',
          relayHost: 'smtp.sendgrid.net',
          relayPort: 587,
          relayUser: 'apikey',
          relayPassword: 'secret',
        },
      },
    });
    const sections = generateReviewSections(state);
    const domain = sections.find((s) => s.id === 'domain')!;
    const mailItem = domain.items.find((i) => i.label === 'Mail Server');
    expect(mailItem).toBeDefined();
    expect(mailItem?.value).toContain('sendgrid');
  });

  it('domain section includes Mail Server without relay when tunnel + mailServer enabled (no relay)', () => {
    const base = makeState();
    const state = makeState({
      domain: {
        provider: 'tunnel',
        name: 'myserver.example.com',
        ssl: 'cloudflare',
        cloudflare: {
          enabled: true,
          tunnelToken: '',
          tunnelName: 'my-tunnel',
          accountId: '',
          apiToken: '',
          tunnelId: '',
          zoneId: '',
          zoneName: 'example.com',
        },
      },
      servers: {
        ...base.servers,
        mailServer: {
          enabled: true,
          service: 'docker-mailserver',
          port25Blocked: false,
          relayProvider: '',
          relayHost: '',
          relayPort: 587,
          relayUser: '',
          relayPassword: '',
        },
      },
    });
    const sections = generateReviewSections(state);
    const domain = sections.find((s) => s.id === 'domain')!;
    const mailItem = domain.items.find((i) => i.label === 'Mail Server');
    expect(mailItem).toBeDefined();
    expect(mailItem?.value).toBe('docker-mailserver');
  });
});

// ---------------------------------------------------------------------------
// exportConfig / importConfig round-trip
// ---------------------------------------------------------------------------

describe('exportConfig / importConfig round-trip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `brewnet-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('exportConfig writes a JSON file in the project directory', () => {
    const state = makeState();
    // exportConfig takes a directory path and creates <dir>/brewnet.config.json
    const filePath = exportConfig(state, tmpDir);
    expect(existsSync(filePath)).toBe(true);
  });

  it('exportConfig returns the full path to the written file', () => {
    const state = makeState();
    const filePath = exportConfig(state, tmpDir);
    expect(filePath).toMatch(/brewnet\.config\.json$/);
  });

  it('importConfig reads back the exported config', () => {
    const state = makeState({
      projectName: 'round-trip-project',
      projectPath: '/tmp/round-trip',
    });
    const filePath = exportConfig(state, tmpDir);
    const imported = importConfig(filePath);
    expect(imported).toBeDefined();
    expect(imported?.projectName).toBe('round-trip-project');
  });

  it('importConfig throws for non-existent file', () => {
    expect(() => importConfig(join(tmpDir, 'nonexistent.json'))).toThrow();
  });

  it('importConfig throws for invalid JSON', () => {
    const badPath = join(tmpDir, 'bad.json');
    writeFileSync(badPath, 'not valid json');
    expect(() => importConfig(badPath)).toThrow();
  });

  it('exported config does not contain admin password (security)', () => {
    const state = makeState();
    const filePath = exportConfig(state, tmpDir);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('secret123');
  });
});
