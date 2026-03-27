/**
 * T050 — Step 2: Server Component Toggle Rules (Pure Logic)
 *
 * Pure functions that enforce business rules for server component selection.
 * These functions take a WizardState and return an updated WizardState,
 * with no side effects. Used by the Step 2 wizard UI and by tests.
 *
 * Rules:
 *   - Web Server is always enabled (required)
 *   - Git Server is always enabled (required)
 *   - File Server or Media Server enabled → SFTP auto-suggested
 *   - DB Server enabled + empty dbPassword → auto-generate password
 *   - SSH Server default → passwordAuth = false (key-only)
 *   - Language/frontend selected → App Server auto-enabled
 *   - App Server auto-enabled → FileBrowser auto-enabled
 *
 * @module wizard/steps/server-components
 */

import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type {
  WizardState,
  WebServerService,
  DbPrimary,
} from '@brewnet/shared';
import { DB_VERSIONS } from '@brewnet/shared';
import { estimateResources } from '../../utils/resources.js';

// ---------------------------------------------------------------------------
// Pure Rule Functions
// ---------------------------------------------------------------------------

/**
 * Apply all component toggle rules to the given wizard state.
 * Ensures invariants (required components, auto-suggestions, auto-generation).
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with rules applied
 */
export function applyComponentRules(state: WizardState): WizardState {
  const next = structuredClone(state);

  // Required components — always enabled
  next.servers.webServer.enabled = true;
  next.servers.gitServer.enabled = true;

  // SSH Server defaults to key-only auth
  if (next.servers.sshServer.enabled && next.servers.sshServer.passwordAuth === undefined) {
    next.servers.sshServer.passwordAuth = false;
  }

  // SFTP auto-suggestion when File Server or Media is enabled
  if (shouldAutoSuggestSftp(next)) {
    next.servers.sshServer.sftp = true;
  }

  // DB password — use admin password for consistency across all services
  if (next.servers.dbServer.enabled && !next.servers.dbServer.dbPassword) {
    next.servers.dbServer.dbPassword = next.admin.password;
  }

  return next;
}

/**
 * Check whether SFTP should be auto-suggested (checked by default).
 * SFTP is auto-suggested when File Server or Media Server is enabled.
 *
 * @param state - Current wizard state
 * @returns true if SFTP should be auto-suggested
 */
export function shouldAutoSuggestSftp(state: WizardState): boolean {
  return state.servers.fileServer.enabled || state.servers.media.enabled;
}

/**
 * Apply devStack-based auto-enables.
 * When languages or frontend technologies are selected, App Server
 * and FileBrowser are automatically enabled.
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with auto-enables applied
 */
export function applyDevStackAutoEnables(state: WizardState): WizardState {
  const next = structuredClone(state);

  const hasLanguages = next.devStack.languages.length > 0;
  const hasFrontend = next.devStack.frontend !== null;
  const hasDevStack = hasLanguages || hasFrontend;

  next.servers.appServer.enabled = hasDevStack;

  // FileBrowser auto-enabled alongside App Server
  if (hasDevStack) {
    next.servers.fileBrowser.enabled = true;
  } else {
    // When no devStack, FileBrowser reverts to its previous state
    // (only auto-disable if it was auto-enabled by devStack)
    next.servers.fileBrowser.enabled = false;
  }

  return next;
}


// ---------------------------------------------------------------------------
// Interactive Step Function (T052-T058)
// ---------------------------------------------------------------------------

/**
 * Run Step 3: Server Components.
 *
 * Displays admin account summary (set in Pre-Step) and collects
 * server component selections.
 * Applies component rules at the end to enforce invariants.
 *
 * Flow:
 *   1. Display header "Step 3/8 — Server Components"
 *   2. Admin Account summary (read-only, set in Pre-Step)
 *   3. Web Server (always ON, select service)
 *   4. File Server (toggle, select service)
 *   5. Git Server (always ON, show info)
 *   6. DB Server (toggle, primary, version, password)
 *   7. Media (toggle jellyfin)
 *   8. SSH Server (toggle, port, passwordAuth, SFTP auto-suggest)
 *   9. Apply component rules
 *  10. Show resource estimation
 *  11. Return updated state
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with server component selections
 */
export async function runServerComponentsStep(
  state: WizardState,
): Promise<WizardState> {
  const next = structuredClone(state);

  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 3/8') + chalk.bold(' — Server Components'),
  );
  console.log(
    chalk.dim(
      '  Select server components to install',
    ),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Admin Account summary (read-only — configured in Pre-Step)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Admin Account') + chalk.dim(' (configured in Pre-Step)'));
  console.log(chalk.dim(`    Username: ${next.admin.username || 'admin'}`));
  console.log(chalk.dim(`    Password: ${'*'.repeat(Math.min(next.admin.password?.length ?? 0, 12))} (set)`));
  console.log();

  // -------------------------------------------------------------------------
  // 3. Web Server (always ON — select service)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Web Server') + chalk.green(' (required)'));
  console.log(chalk.dim('  Reverse proxy handling HTTPS and domain routing for all services'));
  console.log();

  const webService = await select<WebServerService>({
    message: 'Reverse proxy',
    choices: [
      { name: 'Traefik (recommended)', value: 'traefik', description: 'Auto SSL renewal + Docker label-based routing. No config needed when adding services' },
      { name: 'Nginx', value: 'nginx', description: 'Industry-standard web server and proxy. Stable with versatile configuration' },
      { name: 'Caddy', value: 'caddy', description: 'Simple config file with built-in Let\'s Encrypt automation' },
    ],
    default: next.servers.webServer.service || 'traefik',
  });
  next.servers.webServer.service = webService;
  console.log();

  // -------------------------------------------------------------------------
  // 4. Nextcloud (File Server)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Nextcloud'));
  console.log(chalk.dim('  Self-hosted file sync + all-in-one collaboration suite with calendar, contacts, and photos'));
  console.log(chalk.dim('  Replaces Dropbox / Google Drive. Supports web, desktop, and mobile apps'));
  console.log();

  const nextcloudEnabled = await confirm({
    message: 'Install Nextcloud?',
    default: next.servers.fileServer.enabled,
  });
  next.servers.fileServer.enabled = nextcloudEnabled;
  next.servers.fileServer.service = nextcloudEnabled ? 'nextcloud' : '';
  console.log();

  // -------------------------------------------------------------------------
  // 5. Git Server (always ON — info display)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Git Server') + chalk.green(' (required)'));
  console.log(
    chalk.dim(`  Gitea — Web UI port ${next.servers.gitServer.port}, SSH port ${next.servers.gitServer.sshPort}`),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 6. DB Server (toggle + primary + version + password)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Database Server'));
  console.log(chalk.dim('  Relational database for persistent app data storage. Required by most services'));
  console.log();

  const dbEnabled = await confirm({
    message: 'Enable Database Server?',
    default: next.servers.dbServer.enabled,
  });
  next.servers.dbServer.enabled = dbEnabled;

  if (dbEnabled) {
    // Primary database
    const dbPrimary = await select<DbPrimary>({
      message: 'Primary database',
      choices: [
        { name: 'PostgreSQL (recommended)', value: 'postgresql', description: 'Feature-rich open-source RDBMS. Supports JSON and full-text search, ideal for large-scale services' },
        { name: 'MySQL', value: 'mysql', description: 'Most widely used database. Highly compatible with PHP ecosystems like WordPress and Drupal' },
        { name: 'SQLite (embedded)', value: 'sqlite', description: 'Lightweight file-based database. No external server needed, suitable for small or single-service setups' },
      ],
      default: next.servers.dbServer.primary || 'postgresql',
    });
    next.servers.dbServer.primary = dbPrimary;

    // Auto-assign latest version
    const versions = DB_VERSIONS[dbPrimary] ?? [];
    next.servers.dbServer.primaryVersion = versions[0] ?? '';

    if (dbPrimary !== 'sqlite') {
      // Admin UI (pgAdmin / phpMyAdmin)
      const adminUILabel = dbPrimary === 'postgresql' ? 'pgAdmin' : 'phpMyAdmin';
      const adminUI = await confirm({
        message: `Enable ${adminUILabel} (database admin UI)?`,
        default: next.servers.dbServer.adminUI,
      });
      next.servers.dbServer.adminUI = adminUI;

      if (adminUI && dbPrimary === 'postgresql') {
        console.log(chalk.dim('  ℹ  pgAdmin password = brewnet admin password (set in Pre-Step)'));
        const pgadminEmail = await input({
          message: 'pgAdmin login email',
          default: next.servers.dbServer.pgadminEmail || '',
          validate: (v) => v.includes('@') || 'Please enter a valid email address',
        });
        next.servers.dbServer.pgadminEmail = pgadminEmail;
      }
    } else {
      next.servers.dbServer.primaryVersion = '3';
      next.servers.dbServer.adminUI = false;
    }

    // DB name and user
    const dbName = await input({
      message: 'Database name',
      default: next.servers.dbServer.dbName || 'brewnet_db',
    });
    next.servers.dbServer.dbName = dbName;

    const dbUser = await input({
      message: 'Database user',
      default: next.servers.dbServer.dbUser || 'brewnet',
    });
    next.servers.dbServer.dbUser = dbUser;

    // DB password — use admin password for consistency
    if (!next.servers.dbServer.dbPassword) {
      next.servers.dbServer.dbPassword = next.admin.password;
    }

    // Cache layer — removed (no longer offered)
  } else {
    // Reset DB fields when disabled
    next.servers.dbServer.primary = '';
    next.servers.dbServer.primaryVersion = '';
    next.servers.dbServer.dbName = '';
    next.servers.dbServer.dbUser = '';
    next.servers.dbServer.dbPassword = '';
    next.servers.dbServer.adminUI = false;
    next.servers.dbServer.cache = '';
  }
  console.log();

  // -------------------------------------------------------------------------
  // 7. Media (toggle jellyfin)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Media Server'));
  console.log(chalk.dim('  Self-hosted Netflix for streaming movies, shows, music, and photos. Supports browser, mobile, and TV apps'));
  console.log();

  const mediaEnabled = await confirm({
    message: 'Enable Media Server (Jellyfin)?',
    default: next.servers.media.enabled,
  });
  next.servers.media.enabled = mediaEnabled;
  next.servers.media.services = mediaEnabled ? ['jellyfin'] : [];
  console.log();

  // SSH Server — skipped (not yet implemented, planned for future release)
  next.servers.sshServer.enabled = false;
  console.log();

  // -------------------------------------------------------------------------
  // 9. Apply component rules
  // -------------------------------------------------------------------------
  const finalState = applyComponentRules(next);

  // -------------------------------------------------------------------------
  // 10. Resource estimation summary
  // -------------------------------------------------------------------------
  const resources = estimateResources(finalState);

  console.log(chalk.bold('  Resource Estimation'));
  console.log(chalk.dim(`    Containers: ${resources.containers}`));
  console.log(chalk.dim(`    RAM:        ~${resources.ramGB}`));
  console.log(chalk.dim(`    Disk:       ~${resources.diskGB} GB`));
  console.log();

  // -------------------------------------------------------------------------
  // 11. Summary
  // -------------------------------------------------------------------------
  console.log(chalk.green('  Server components configured.'));
  console.log();

  return finalState;
}
