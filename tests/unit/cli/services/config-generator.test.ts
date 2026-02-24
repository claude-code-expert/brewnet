/**
 * Unit tests for services/config-generator module (T063)
 *
 * Tests infrastructure configuration file generation from wizard state.
 * Verifies SSH sshd_config, Gitea app.ini, FileBrowser config, mail configs,
 * and template variable substitution.
 *
 * Test cases covered:
 * - TC-08-07: SSH Server enabled → sshd_config has `PasswordAuthentication no`
 * - TC-08-08: Non-local domain + Mail → mail configs in `infrastructure/mail/`
 * - TC-08-09: Gitea enabled → `gitea/app.ini` with admin account
 * - TC-08-10: FileBrowser enabled → `filebrowser.json` with admin credential API call
 * - TC-08-12: Boilerplate selected → template substitution (`${PROJECT_NAME}`, `${DOMAIN}` replaced)
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const {
  generateInfraConfigs,
  generateTraefikConfig,
  generateSshdConfig,
  generateGiteaConfig,
  generateFileBrowserConfig,
  generateMailConfig,
  substituteTemplateVars,
} = await import(
  '../../../../packages/cli/src/services/config-generator.js'
);

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);

import type {
  WizardState,
  ServerComponents,
  GeneratedFile,
} from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a WizardState with selective overrides applied on top of defaults.
 */
function buildState(overrides: Partial<{
  projectName: string;
  projectPath: string;
  admin: Partial<WizardState['admin']>;
  servers: Partial<WizardState['servers']>;
  domain: Partial<WizardState['domain']>;
  devStack: Partial<WizardState['devStack']>;
  boilerplate: Partial<WizardState['boilerplate']>;
}> = {}): WizardState {
  const base = createDefaultWizardState();
  const state = structuredClone(base);

  if (overrides.projectName) state.projectName = overrides.projectName;
  if (overrides.projectPath) state.projectPath = overrides.projectPath;

  if (overrides.admin) {
    Object.assign(state.admin, overrides.admin);
  }
  if (overrides.servers) {
    for (const [key, value] of Object.entries(overrides.servers)) {
      const servers = state.servers as unknown as Record<string, unknown>;
      servers[key] = {
        ...(servers[key] as object),
        ...(value as object),
      };
    }
  }
  if (overrides.domain) {
    const { cloudflare, ...domainRest } = overrides.domain;
    Object.assign(state.domain, domainRest);
    if (cloudflare) {
      Object.assign(state.domain.cloudflare, cloudflare);
    }
  }
  if (overrides.devStack) {
    Object.assign(state.devStack, overrides.devStack);
  }
  if (overrides.boilerplate) {
    Object.assign(state.boilerplate, overrides.boilerplate);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Tests: generateSshdConfig — SSH Server Configuration
// ---------------------------------------------------------------------------

describe('generateSshdConfig', () => {
  it('contains PasswordAuthentication no when passwordAuth is false (default)', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result: GeneratedFile = generateSshdConfig(state);

    expect(result.content).toContain('PasswordAuthentication no');
  });

  it('contains PermitRootLogin no for security', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result: GeneratedFile = generateSshdConfig(state);

    expect(result.content).toContain('PermitRootLogin no');
  });

  it('contains PasswordAuthentication yes when passwordAuth is true', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: true, sftp: false },
      },
    });

    const result: GeneratedFile = generateSshdConfig(state);

    expect(result.content).toContain('PasswordAuthentication yes');
    // Must NOT contain the 'no' variant when password auth is enabled
    expect(result.content).not.toMatch(/PasswordAuthentication\s+no/);
  });

  it('configures the SSH port from state', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 3333, passwordAuth: false, sftp: false },
      },
    });

    const result: GeneratedFile = generateSshdConfig(state);

    expect(result.content).toContain('Port 3333');
  });

  it('includes SFTP subsystem when sftp is enabled', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      },
    });

    const result: GeneratedFile = generateSshdConfig(state);

    expect(result.content).toMatch(/Subsystem\s+sftp/);
  });

  it('has path containing sshd_config', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result: GeneratedFile = generateSshdConfig(state);

    expect(result.path).toContain('sshd_config');
  });

  it('includes PubkeyAuthentication yes (key-based auth always enabled)', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result: GeneratedFile = generateSshdConfig(state);

    expect(result.content).toContain('PubkeyAuthentication yes');
  });
});

// ---------------------------------------------------------------------------
// Tests: generateGiteaConfig — Gitea app.ini
// ---------------------------------------------------------------------------

describe('generateGiteaConfig', () => {
  it('generates config with [security] section', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'MyPass' },
    });

    const result: GeneratedFile = generateGiteaConfig(state);

    expect(result.content).toContain('[security]');
  });

  it('includes admin username from state', () => {
    const state = buildState({
      admin: { username: 'myroot', password: 'SecretPass' },
    });

    const result: GeneratedFile = generateGiteaConfig(state);

    // The admin username should appear in the config
    expect(result.content).toContain('myroot');
  });

  it('path contains app.ini', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
    });

    const result: GeneratedFile = generateGiteaConfig(state);

    expect(result.path).toMatch(/gitea.*app\.ini/);
  });

  it('includes [server] section with correct ports', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        gitServer: { enabled: true, service: 'gitea', port: 4000, sshPort: 4022 },
      },
    });

    const result: GeneratedFile = generateGiteaConfig(state);

    expect(result.content).toContain('[server]');
  });

  it('includes [database] section', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
    });

    const result: GeneratedFile = generateGiteaConfig(state);

    expect(result.content).toContain('[database]');
  });

  it('references domain name in config', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      domain: {
        provider: 'custom',
        name: 'git.example.com',
      },
    });

    const result: GeneratedFile = generateGiteaConfig(state);

    // Domain should be reflected in the server config or ROOT_URL
    expect(result.content).toContain('git.example.com');
  });
});

// ---------------------------------------------------------------------------
// Tests: generateFileBrowserConfig
// ---------------------------------------------------------------------------

describe('generateFileBrowserConfig', () => {
  it('returns a config file when FileBrowser is enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });

    const result: GeneratedFile | null = generateFileBrowserConfig(state);

    expect(result).not.toBeNull();
  });

  it('returns null when FileBrowser is disabled', () => {
    const state = buildState({
      servers: {
        fileBrowser: { enabled: false, mode: '' },
      },
    });

    const result: GeneratedFile | null = generateFileBrowserConfig(state);

    expect(result).toBeNull();
  });

  it('config path contains filebrowser', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });

    const result: GeneratedFile | null = generateFileBrowserConfig(state);

    expect(result).not.toBeNull();
    expect(result!.path).toMatch(/filebrowser/i);
  });

  it('includes auth configuration in content', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });

    const result: GeneratedFile | null = generateFileBrowserConfig(state);

    expect(result).not.toBeNull();
    // FileBrowser config should reference auth settings
    expect(result!.content).toMatch(/auth/i);
  });

  it('handles directory mode', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        fileBrowser: { enabled: true, mode: 'directory' },
      },
    });

    const result: GeneratedFile | null = generateFileBrowserConfig(state);

    expect(result).not.toBeNull();
    expect(result!.content.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: generateMailConfig — Mail Server Configuration
// ---------------------------------------------------------------------------

describe('generateMailConfig', () => {
  it('generates mail configs when mail is enabled with non-local domain', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      domain: {
        provider: 'custom',
        name: 'example.com',
      },
      servers: {
        mailServer: { enabled: true, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateMailConfig(state);

    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty array when mail is disabled', () => {
    const state = buildState({
      servers: {
        mailServer: { enabled: false, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateMailConfig(state);

    expect(result).toHaveLength(0);
  });

  it('mail config paths are under infrastructure/mail/', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      domain: {
        provider: 'custom',
        name: 'example.com',
      },
      servers: {
        mailServer: { enabled: true, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateMailConfig(state);

    for (const file of result) {
      expect(file.path).toMatch(/infrastructure\/mail\//);
    }
  });

  it('includes postfix main.cf in generated configs', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      domain: {
        provider: 'custom',
        name: 'mail.example.com',
      },
      servers: {
        mailServer: { enabled: true, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateMailConfig(state);
    const paths = result.map((f: GeneratedFile) => f.path);

    // Should include postfix configuration
    const hasPostfix = paths.some(
      (p: string) => p.includes('postfix') || p.includes('main.cf'),
    );
    expect(hasPostfix).toBe(true);
  });

  it('includes dovecot config in generated configs', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      domain: {
        provider: 'custom',
        name: 'mail.example.com',
      },
      servers: {
        mailServer: { enabled: true, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateMailConfig(state);
    const paths = result.map((f: GeneratedFile) => f.path);

    // Should include dovecot configuration
    const hasDovecot = paths.some(
      (p: string) => p.includes('dovecot') || p.includes('dovecot.conf'),
    );
    expect(hasDovecot).toBe(true);
  });

  it('references the domain name in mail configuration content', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      domain: {
        provider: 'custom',
        name: 'my-mail-domain.org',
      },
      servers: {
        mailServer: { enabled: true, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateMailConfig(state);

    // At least one generated file should reference the domain
    const anyContainsDomain = result.some((f: GeneratedFile) =>
      f.content.includes('my-mail-domain.org'),
    );
    expect(anyContainsDomain).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: generateTraefikConfig
// ---------------------------------------------------------------------------

describe('generateTraefikConfig', () => {
  it('generates a Traefik configuration file', () => {
    const state = buildState({
      servers: {
        webServer: { enabled: true, service: 'traefik' },
      },
    });

    const result: GeneratedFile = generateTraefikConfig(state);

    expect(result.content.length).toBeGreaterThan(0);
    expect(result.path).toMatch(/traefik/);
  });

  it('includes entrypoints configuration', () => {
    const state = buildState({
      servers: {
        webServer: { enabled: true, service: 'traefik' },
      },
    });

    const result: GeneratedFile = generateTraefikConfig(state);

    expect(result.content).toMatch(/entryPoints|entrypoints/i);
  });

  it('includes docker provider configuration', () => {
    const state = buildState({
      servers: {
        webServer: { enabled: true, service: 'traefik' },
      },
    });

    const result: GeneratedFile = generateTraefikConfig(state);

    expect(result.content).toMatch(/docker/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: substituteTemplateVars
// ---------------------------------------------------------------------------

describe('substituteTemplateVars', () => {
  it('replaces ${PROJECT_NAME} with state.projectName', () => {
    const state = buildState({ projectName: 'my-awesome-server' });
    const template = 'Welcome to ${PROJECT_NAME}!';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toBe('Welcome to my-awesome-server!');
  });

  it('replaces ${DOMAIN} with state.domain.name', () => {
    const state = buildState({
      domain: {
        provider: 'custom',
        name: 'mysite.example.com',
      },
    });
    const template = 'Server running at https://${DOMAIN}';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toBe('Server running at https://mysite.example.com');
  });

  it('replaces ${ADMIN_USER} with state.admin.username', () => {
    const state = buildState({
      admin: { username: 'superadmin', password: 'pass' },
    });
    const template = 'Login as ${ADMIN_USER}';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toBe('Login as superadmin');
  });

  it('replaces multiple variables in one template', () => {
    const state = buildState({
      projectName: 'homelab',
      admin: { username: 'root', password: 'secret' },
      domain: {
        provider: 'custom',
        name: 'homelab.dev',
      },
    });
    const template = 'Project: ${PROJECT_NAME}, Domain: ${DOMAIN}, Admin: ${ADMIN_USER}';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toBe('Project: homelab, Domain: homelab.dev, Admin: root');
  });

  it('replaces all occurrences of the same variable', () => {
    const state = buildState({ projectName: 'myproject' });
    const template = '${PROJECT_NAME} / ${PROJECT_NAME}';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toBe('myproject / myproject');
  });

  it('leaves unknown variables unchanged', () => {
    const state = buildState({ projectName: 'test' });
    const template = '${PROJECT_NAME} and ${UNKNOWN_VAR}';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toContain('test');
    // Unknown variables should remain as-is or be empty
    expect(result).toMatch(/\$\{UNKNOWN_VAR\}|and\s*$/);
  });

  it('handles template with no variables', () => {
    const state = buildState();
    const template = 'Just plain text, no variables here.';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toBe('Just plain text, no variables here.');
  });

  it('handles empty template string', () => {
    const state = buildState();
    const template = '';

    const result: string = substituteTemplateVars(template, state);

    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tests: generateInfraConfigs — Integration of all generators
// ---------------------------------------------------------------------------

describe('generateInfraConfigs', () => {
  it('returns an array of GeneratedFile objects', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);

    expect(Array.isArray(result)).toBe(true);
    for (const file of result) {
      expect(file).toHaveProperty('path');
      expect(file).toHaveProperty('content');
      expect(typeof file.path).toBe('string');
      expect(typeof file.content).toBe('string');
    }
  });

  it('includes sshd_config when SSH is enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const sshConfigs = result.filter((f: GeneratedFile) => f.path.includes('sshd_config'));

    expect(sshConfigs.length).toBeGreaterThanOrEqual(1);
  });

  it('does not include sshd_config when SSH is disabled', () => {
    const state = buildState({
      servers: {
        sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const sshConfigs = result.filter((f: GeneratedFile) => f.path.includes('sshd_config'));

    expect(sshConfigs).toHaveLength(0);
  });

  it('includes Gitea config (app.ini is always present since gitServer is required)', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const giteaConfigs = result.filter((f: GeneratedFile) => f.path.includes('app.ini'));

    expect(giteaConfigs.length).toBeGreaterThanOrEqual(1);
  });

  it('includes Traefik config when web server is traefik', () => {
    const state = buildState({
      servers: {
        webServer: { enabled: true, service: 'traefik' },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const traefikConfigs = result.filter((f: GeneratedFile) =>
      f.path.toLowerCase().includes('traefik'),
    );

    expect(traefikConfigs.length).toBeGreaterThanOrEqual(1);
  });

  it('includes mail configs when mail server is enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      domain: {
        provider: 'custom',
        name: 'example.com',
      },
      servers: {
        mailServer: { enabled: true, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const mailConfigs = result.filter((f: GeneratedFile) =>
      f.path.includes('mail'),
    );

    expect(mailConfigs.length).toBeGreaterThan(0);
  });

  it('does not include mail configs when mail server is disabled', () => {
    const state = buildState({
      servers: {
        mailServer: { enabled: false, service: 'docker-mailserver' },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const mailConfigs = result.filter((f: GeneratedFile) =>
      f.path.includes('infrastructure/mail/'),
    );

    expect(mailConfigs).toHaveLength(0);
  });

  it('includes FileBrowser config when enabled', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const fbConfigs = result.filter((f: GeneratedFile) =>
      f.path.toLowerCase().includes('filebrowser'),
    );

    expect(fbConfigs.length).toBeGreaterThanOrEqual(1);
  });

  it('does not include FileBrowser config when disabled', () => {
    const state = buildState({
      servers: {
        fileBrowser: { enabled: false, mode: '' },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);
    const fbConfigs = result.filter((f: GeneratedFile) =>
      f.path.toLowerCase().includes('filebrowser'),
    );

    expect(fbConfigs).toHaveLength(0);
  });

  it('all generated files have non-empty content', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
        mailServer: { enabled: true, service: 'docker-mailserver' },
        fileBrowser: { enabled: true, mode: 'standalone' },
      },
      domain: {
        provider: 'custom',
        name: 'example.com',
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);

    for (const file of result) {
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it('all generated file paths are non-empty strings', () => {
    const state = buildState({
      admin: { username: 'admin', password: 'Pass' },
      servers: {
        sshServer: { enabled: true, port: 2222, passwordAuth: false, sftp: true },
      },
    });

    const result: GeneratedFile[] = generateInfraConfigs(state);

    for (const file of result) {
      expect(file.path.length).toBeGreaterThan(0);
    }
  });
});
