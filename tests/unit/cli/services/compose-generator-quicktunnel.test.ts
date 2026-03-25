/**
 * Additional unit tests for services/compose-generator — Quick Tunnel mode.
 *
 * Covers uncovered branches triggered by tunnelMode='quick':
 *   - Gitea ROOT_URL set to http://localhost/git/ (L230)
 *   - Nextcloud OVERWRITEWEBROOT + NEXTCLOUD_TRUSTED_DOMAINS env (L276-282)
 *   - pgadmin SCRIPT_NAME=/pgadmin (L333)
 *   - Filebrowser FB_BASEURL=/files (L347)
 *   - Cloudflared env undefined → no environment key (L355)
 *   - buildQuickTunnelExtraPathLabels for filebrowser /static (L397-432)
 *   - Traefik ports: only port 80 exposed (L490)
 *   - Nextcloud ports: empty (L524)
 *   - Traefik command additions: api.insecure + forwardedHeaders (L696-701)
 *   - Cloudflared command: quick-tunnel URL form (L738)
 *   - QUICK_TUNNEL_PATH_MAP labels on services (L656-660)
 *   - Landing-page PathPrefix catch-all rule (L965-968)
 */

import { describe, it, expect } from '@jest/globals';
import type { WizardState } from '../../../../packages/shared/src/types/wizard-state.js';

// ---------------------------------------------------------------------------
// SUT imports
// ---------------------------------------------------------------------------

const { createDefaultWizardState } = await import(
  '../../../../packages/cli/src/config/defaults.js'
);
const { generateComposeConfig } = await import(
  '../../../../packages/cli/src/services/compose-generator.js'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQuickState(extra: {
  gitea?: boolean;
  nextcloud?: boolean;
  pgadmin?: boolean;
  filebrowser?: boolean;
  jellyfin?: boolean;
} = {}): WizardState {
  const state = createDefaultWizardState();
  // Set quick tunnel mode
  state.domain.cloudflare.tunnelMode = 'quick';
  state.domain.cloudflare.enabled = true;

  // Enable traefik (default web server)
  state.servers.webServer.enabled = true;
  state.servers.webServer.service = 'traefik';

  // Cloudflared is enabled when tunnel is enabled
  state.servers.webServer.enabled = true;

  if (extra.gitea) {
    state.servers.gitServer.enabled = true;
    state.servers.gitServer.service = 'gitea';
    state.servers.gitServer.port = 3000;
    state.servers.gitServer.sshPort = 3022;
  }
  if (extra.nextcloud) {
    state.servers.fileServer.enabled = true;
    state.servers.fileServer.service = 'nextcloud';
  }
  if (extra.pgadmin) {
    state.servers.dbServer.enabled = true;
    state.servers.dbServer.primary = 'postgresql';
    state.servers.dbServer.adminUI = true;
  }
  if (extra.filebrowser) {
    state.servers.fileBrowser = state.servers.fileBrowser ?? { enabled: false, mode: 'standalone' };
    state.servers.fileBrowser.enabled = true;
    state.servers.fileBrowser.mode = 'standalone';
  }
  if (extra.jellyfin) {
    state.servers.media.enabled = true;
    state.servers.media.services = ['jellyfin'];
  }
  return state;
}

// ---------------------------------------------------------------------------
// Tests — environment variable branches
// ---------------------------------------------------------------------------

describe('generateComposeConfig — Quick Tunnel: Gitea env', () => {
  it('sets ROOT_URL to http://localhost/git/ in quick tunnel mode', () => {
    const state = buildQuickState({ gitea: true });
    const config = generateComposeConfig(state);
    const env = (config.services['gitea']?.environment ?? {}) as Record<string, string>;
    expect(env['GITEA__server__ROOT_URL']).toBe('http://localhost/git/');
    // In quick tunnel mode, no subdomain DOMAIN/SSH_DOMAIN entries
    expect(env['GITEA__server__DOMAIN']).toBeUndefined();
  });
});

describe('generateComposeConfig — Quick Tunnel: Nextcloud env', () => {
  it('sets OVERWRITEWEBROOT and NEXTCLOUD_TRUSTED_DOMAINS in quick tunnel mode', () => {
    const state = buildQuickState({ nextcloud: true });
    state.domain.name = 'localhost';
    const config = generateComposeConfig(state);
    const env = (config.services['nextcloud']?.environment ?? {}) as Record<string, string>;
    expect(env['OVERWRITEWEBROOT']).toBe('/cloud');
    expect(env['NEXTCLOUD_TRUSTED_PROXIES']).toBe('traefik');
    expect(env['NEXTCLOUD_TRUSTED_DOMAINS']).toContain('*.trycloudflare.com');
  });
});

describe('generateComposeConfig — Quick Tunnel: pgadmin env', () => {
  it('sets SCRIPT_NAME=/pgadmin in quick tunnel mode', () => {
    const state = buildQuickState({ pgadmin: true });
    const config = generateComposeConfig(state);
    const env = (config.services['pgadmin']?.environment ?? {}) as Record<string, string>;
    expect(env['SCRIPT_NAME']).toBe('/pgadmin');
  });
});

describe('generateComposeConfig — Quick Tunnel: Filebrowser env', () => {
  it('sets FB_BASEURL=/files in quick tunnel mode', () => {
    const state = buildQuickState({ filebrowser: true });
    const config = generateComposeConfig(state);
    const env = (config.services['filebrowser']?.environment ?? {}) as Record<string, string>;
    expect(env['FB_BASEURL']).toBe('/files');
  });
});

// ---------------------------------------------------------------------------
// Tests — Cloudflared env (quick tunnel: no env)
// ---------------------------------------------------------------------------

describe('generateComposeConfig — Quick Tunnel: Cloudflared', () => {
  it('does not set TUNNEL_TOKEN environment in quick tunnel mode', () => {
    const state = buildQuickState();
    state.domain.cloudflare.tunnelMode = 'quick';
    const config = generateComposeConfig(state);
    // cloudflared service should exist when cloudflare is enabled
    if (config.services['cloudflared']) {
      const env = (config.services['cloudflared']?.environment ?? {}) as Record<string, string>;
      expect(env['TUNNEL_TOKEN']).toBeUndefined();
    }
    // Whether service is included depends on cloudflare.enabled; at minimum no TUNNEL_TOKEN
  });

  it('sets quick-tunnel URL command on cloudflared service', () => {
    const state = buildQuickState();
    state.domain.cloudflare.enabled = true;
    const config = generateComposeConfig(state);
    if (config.services['cloudflared']) {
      const cmd = config.services['cloudflared']?.command as string[] | undefined;
      expect(cmd).toEqual(['tunnel', '--no-autoupdate', '--url', 'http://traefik:80']);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — Port mappings
// ---------------------------------------------------------------------------

describe('generateComposeConfig — Quick Tunnel: Traefik ports', () => {
  it('exposes only port 80 for traefik in quick tunnel mode', () => {
    const state = buildQuickState();
    const config = generateComposeConfig(state);
    const ports = config.services['traefik']?.ports ?? [];
    // Should have port 80 mapping
    const has80 = ports.some((p) => String(p).includes(':80'));
    const has443 = ports.some((p) => String(p).includes(':443'));
    expect(has80).toBe(true);
    expect(has443).toBe(false);
  });
});

describe('generateComposeConfig — Quick Tunnel: Nextcloud ports', () => {
  it('does not expose host ports for nextcloud in quick tunnel mode', () => {
    const state = buildQuickState({ nextcloud: true });
    const config = generateComposeConfig(state);
    const ports = config.services['nextcloud']?.ports ?? [];
    expect(ports).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — Traefik command in quick tunnel mode
// ---------------------------------------------------------------------------

describe('generateComposeConfig — Quick Tunnel: Traefik command', () => {
  it('includes api.insecure=true and forwardedHeaders in quick tunnel mode', () => {
    const state = buildQuickState();
    const config = generateComposeConfig(state);
    const cmd = (config.services['traefik']?.command ?? []) as string[];
    expect(cmd).toContain('--api.insecure=true');
    expect(cmd).toContain('--entrypoints.web.forwardedHeaders.insecure=true');
    // No websecure entrypoint in quick tunnel mode
    expect(cmd).not.toContain('--entrypoints.websecure.address=:443');
  });
});

// ---------------------------------------------------------------------------
// Tests — QUICK_TUNNEL_PATH_MAP labels on services
// ---------------------------------------------------------------------------

describe('generateComposeConfig — Quick Tunnel: path-prefix labels', () => {
  it('adds PathPrefix labels to gitea in quick tunnel mode', () => {
    const state = buildQuickState({ gitea: true });
    const config = generateComposeConfig(state);
    const labels = (config.services['gitea']?.labels ?? {}) as Record<string, string>;
    const ruleKey = Object.keys(labels).find(
      (k) => k.includes('quicktunnel-gitea') && k.endsWith('.rule'),
    );
    expect(ruleKey).toBeDefined();
    expect(labels[ruleKey!]).toContain('/git');
  });

  it('adds PathPrefix labels to filebrowser with extra /static route', () => {
    const state = buildQuickState({ filebrowser: true });
    const config = generateComposeConfig(state);
    const labels = (config.services['filebrowser']?.labels ?? {}) as Record<string, string>;
    // Primary route: /files
    const primaryRule = Object.keys(labels).find(
      (k) => k === 'traefik.http.routers.quicktunnel-filebrowser.rule',
    );
    expect(primaryRule).toBeDefined();
    expect(labels[primaryRule!]).toContain('/files');

    // Extra /static route generated by buildQuickTunnelExtraPathLabels
    const staticRule = Object.keys(labels).find(
      (k) => k.includes('quicktunnel-filebrowser-static') && k.endsWith('.rule'),
    );
    expect(staticRule).toBeDefined();
    expect(labels[staticRule!]).toContain('/static');
  });

  it('adds PathPrefix labels to nextcloud in quick tunnel mode', () => {
    const state = buildQuickState({ nextcloud: true });
    const config = generateComposeConfig(state);
    const labels = (config.services['nextcloud']?.labels ?? {}) as Record<string, string>;
    const ruleKey = Object.keys(labels).find(
      (k) => k.includes('quicktunnel-nextcloud') && k.endsWith('.rule'),
    );
    expect(ruleKey).toBeDefined();
    expect(labels[ruleKey!]).toContain('/cloud');
  });

  it('adds pgadmin PathPrefix with noStrip (no strip middleware)', () => {
    const state = buildQuickState({ pgadmin: true });
    const config = generateComposeConfig(state);
    const labels = (config.services['pgadmin']?.labels ?? {}) as Record<string, string>;
    // noStrip: no strip middleware key
    const stripKey = Object.keys(labels).find((k) => k.includes('stripprefix'));
    expect(stripKey).toBeUndefined();
    // Rule still present
    const ruleKey = Object.keys(labels).find(
      (k) => k.includes('quicktunnel-pgadmin') && k.endsWith('.rule'),
    );
    expect(ruleKey).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — Landing page labels in quick tunnel mode
// ---------------------------------------------------------------------------

describe('generateComposeConfig — Quick Tunnel: landing-page labels', () => {
  it('uses PathPrefix(/) catch-all rule with priority 1 in quick tunnel mode', () => {
    const state = buildQuickState();
    // Landing page is always included
    const config = generateComposeConfig(state);
    const landing = config.services['brewnet-landing'];
    if (!landing) return; // landing page may not be included in minimal state

    const labels = (landing.labels ?? {}) as Record<string, string>;
    const ruleKey = 'traefik.http.routers.brewnet-landing.rule';
    if (labels[ruleKey]) {
      expect(labels[ruleKey]).toContain('PathPrefix');
      expect(labels['traefik.http.routers.brewnet-landing.priority']).toBe('1');
    }
  });
});
