/**
 * @module defaults
 * @description Default values for the Brewnet installation wizard state.
 * Provides factory functions for creating a fresh WizardState and for
 * applying Full Install / Partial Install presets.
 *
 * Task: T021 — Phase 2 Config Registries
 */

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Factory — creates a blank default WizardState (schema v5)
// ---------------------------------------------------------------------------

/**
 * Create a fresh WizardState populated with sensible defaults.
 *
 * - `admin.password` and `dbServer.dbPassword` are left as empty strings;
 *   they should be auto-generated at wizard runtime.
 */
export function createDefaultWizardState(): WizardState {
  return {
    schemaVersion: 5,
    projectName: 'my-homeserver',
    projectPath: '~/brewnet/my-homeserver',
    setupType: 'full',

    admin: {
      username: 'admin',
      password: '',
      storage: 'local',
    },

    servers: {
      webServer: { enabled: true, service: 'traefik' },
      fileServer: { enabled: false, service: '' },
      gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
      dbServer: {
        enabled: true,
        primary: 'postgresql',
        primaryVersion: '17',
        dbName: 'brewnet_db',
        dbUser: 'brewnet',
        dbPassword: '',
        adminUI: true,
        cache: 'redis',
      },
      media: { enabled: false, services: [] },
      sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      mailServer: {
        enabled: false,
        service: 'docker-mailserver',
        port25Blocked: false,
        relayProvider: '',
        relayHost: '',
        relayPort: 587,
        relayUser: '',
        relayPassword: '',
      },
      appServer: { enabled: false },
      fileBrowser: { enabled: false, mode: '' },
    },

    devStack: {
      languages: [],
      frameworks: {},
      frontend: [],
    },

    boilerplate: {
      generate: true,
      sampleData: true,
      devMode: 'hot-reload',
    },

    domain: {
      provider: 'local',
      name: 'brewnet.local',
      ssl: 'self-signed',
      freeDomainTld: '.dpdns.org',
      cloudflare: {
        enabled: false,
        accountId: '',
        apiToken: '',
        tunnelId: '',
        tunnelToken: '',
        tunnelName: '',
        zoneId: '',
        zoneName: '',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Full Install defaults.
 *
 * Enables: Web Server (Traefik) + Git Server (Gitea) + DB (PostgreSQL + Redis).
 * Everything else remains at the base default (disabled).
 */
export function applyFullInstallDefaults(state: WizardState): WizardState {
  return {
    ...state,
    setupType: 'full',
    servers: {
      ...state.servers,
      webServer: { enabled: true, service: 'traefik' },
      gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
      dbServer: {
        ...state.servers.dbServer,
        enabled: true,
        primary: 'postgresql',
        primaryVersion: '17',
        dbName: 'brewnet_db',
        dbUser: 'brewnet',
        adminUI: true,
        cache: 'redis',
      },
    },
  };
}

/**
 * Partial Install defaults.
 *
 * Enables only: Web Server (Traefik) + Git Server (Gitea).
 * Database and all other optional components are disabled.
 */
export function applyPartialInstallDefaults(state: WizardState): WizardState {
  return {
    ...state,
    setupType: 'partial',
    servers: {
      ...state.servers,
      webServer: { enabled: true, service: 'traefik' },
      fileServer: { enabled: false, service: '' },
      gitServer: { enabled: true, service: 'gitea', port: 3000, sshPort: 3022 },
      dbServer: {
        enabled: false,
        primary: '',
        primaryVersion: '',
        dbName: '',
        dbUser: '',
        dbPassword: '',
        adminUI: false,
        cache: '',
      },
      media: { enabled: false, services: [] },
      sshServer: { enabled: false, port: 2222, passwordAuth: false, sftp: false },
      mailServer: {
        enabled: false,
        service: 'docker-mailserver',
        port25Blocked: false,
        relayProvider: '',
        relayHost: '',
        relayPort: 587,
        relayUser: '',
        relayPassword: '',
      },
      appServer: { enabled: false },
      fileBrowser: { enabled: false, mode: '' },
    },
  };
}
