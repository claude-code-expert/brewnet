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
 *   - Domain = 'local' → Mail Server hidden / not available
 *   - DB Server enabled → cache selection available
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
  FileServerService,
  DbPrimary,
  CacheService,
} from '@brewnet/shared';
import { DB_VERSIONS } from '@brewnet/shared';
import { generatePassword } from '../../utils/password.js';
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

  // Mail Server hidden when domain is local
  if (!isMailServerAvailable(next)) {
    next.servers.mailServer.enabled = false;
  }

  // DB password auto-generation
  if (next.servers.dbServer.enabled && !next.servers.dbServer.dbPassword) {
    next.servers.dbServer.dbPassword = generatePassword(16);
  }

  return next;
}

/**
 * Check whether the mail server option should be visible / available.
 * Mail requires a real domain (not 'local').
 *
 * @param state - Current wizard state
 * @returns true if mail server can be enabled
 */
export function isMailServerAvailable(state: WizardState): boolean {
  return state.domain.provider !== 'local';
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
  const hasFrontend = next.devStack.frontend.length > 0;
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

/**
 * Check if cache layer selection is available.
 * Cache is only configurable when DB Server is enabled.
 *
 * @param state - Current wizard state
 * @returns true if cache selection should be shown
 */
export function isCacheSelectionAvailable(state: WizardState): boolean {
  return state.servers.dbServer.enabled;
}

// ---------------------------------------------------------------------------
// Interactive Step Function (T052-T058)
// ---------------------------------------------------------------------------

/**
 * Run Step 2: Server Components.
 *
 * Interactively collects admin credentials and server component selections.
 * Applies component rules at the end to enforce invariants.
 *
 * Flow:
 *   1. Display header "Step 2/7 — Server Components"
 *   2. Admin Account (username, password)
 *   3. Web Server (always ON, select service)
 *   4. File Server (toggle, select service)
 *   5. Git Server (always ON, show info)
 *   6. DB Server (toggle, primary, version, cache, password)
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
    chalk.bold.cyan('  Step 2/7') + chalk.bold(' — Server Components'),
  );
  console.log(
    chalk.dim(
      '  Configure admin credentials and select server components',
    ),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Admin Account
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Admin Account'));
  console.log(chalk.dim('  Credentials are propagated to all enabled services'));
  console.log();

  // Username
  const adminUsername = await input({
    message: 'Admin username',
    default: next.admin.username || 'admin',
  });
  next.admin.username = adminUsername;

  // Password — auto-generate, then offer accept/custom
  const generatedPassword = generatePassword(20);
  console.log();
  console.log(
    chalk.dim('  Generated password: ') + chalk.yellow(generatedPassword),
  );

  const acceptPassword = await confirm({
    message: 'Accept generated password?',
    default: true,
  });

  if (acceptPassword) {
    next.admin.password = generatedPassword;
  } else {
    const customPassword = await input({
      message: 'Enter custom password (min 8 characters)',
      validate: (value: string) => {
        if (value.length < 8) return 'Password must be at least 8 characters';
        return true;
      },
    });
    next.admin.password = customPassword;
  }
  next.admin.storage = 'local';

  console.log();

  // -------------------------------------------------------------------------
  // 3. Web Server (always ON — select service)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Web Server') + chalk.green(' (required)'));

  const webService = await select<WebServerService>({
    message: 'Reverse proxy',
    choices: [
      { name: 'Traefik (recommended)', value: 'traefik' },
      { name: 'Nginx', value: 'nginx' },
      { name: 'Caddy', value: 'caddy' },
    ],
    default: next.servers.webServer.service || 'traefik',
  });
  next.servers.webServer.service = webService;
  console.log();

  // -------------------------------------------------------------------------
  // 4. File Server (toggle + select service)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  File Server'));

  const fileServerEnabled = await confirm({
    message: 'Enable File Server?',
    default: next.servers.fileServer.enabled,
  });
  next.servers.fileServer.enabled = fileServerEnabled;

  if (fileServerEnabled) {
    const fileService = await select<FileServerService>({
      message: 'File server service',
      choices: [
        { name: 'Nextcloud', value: 'nextcloud', description: 'Full collaboration suite with file sync' },
        { name: 'MinIO (S3-compatible)', value: 'minio', description: 'Object storage with S3 API' },
      ],
      default: next.servers.fileServer.service || 'nextcloud',
    });
    next.servers.fileServer.service = fileService;
  } else {
    next.servers.fileServer.service = '';
  }
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
  // 6. DB Server (toggle + primary + version + cache + password)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Database Server'));

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
        { name: 'PostgreSQL (recommended)', value: 'postgresql' },
        { name: 'MySQL', value: 'mysql' },
        { name: 'SQLite (embedded)', value: 'sqlite' },
      ],
      default: next.servers.dbServer.primary || 'postgresql',
    });
    next.servers.dbServer.primary = dbPrimary;

    // Version selection (skip for SQLite — it only has version "3")
    if (dbPrimary !== 'sqlite') {
      const versions = DB_VERSIONS[dbPrimary] ?? [];
      if (versions.length > 0) {
        const dbVersion = await select<string>({
          message: `${dbPrimary === 'postgresql' ? 'PostgreSQL' : 'MySQL'} version`,
          choices: versions.map((v) => ({ name: v, value: v })),
          default: next.servers.dbServer.primaryVersion || versions[0],
        });
        next.servers.dbServer.primaryVersion = dbVersion;
      }

      // Admin UI (pgAdmin / phpMyAdmin)
      const adminUILabel = dbPrimary === 'postgresql' ? 'pgAdmin' : 'phpMyAdmin';
      const adminUI = await confirm({
        message: `Enable ${adminUILabel} (database admin UI)?`,
        default: next.servers.dbServer.adminUI,
      });
      next.servers.dbServer.adminUI = adminUI;
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

    // DB password — auto-generate if empty
    if (!next.servers.dbServer.dbPassword) {
      next.servers.dbServer.dbPassword = generatePassword(16);
      console.log(
        chalk.dim('  Database password auto-generated.'),
      );
    }

    // Cache layer
    const cacheChoice = await select<CacheService>({
      message: 'Cache layer',
      choices: [
        { name: 'Redis (recommended)', value: 'redis' },
        { name: 'Valkey', value: 'valkey' },
        { name: 'KeyDB', value: 'keydb' },
        { name: 'None', value: '' },
      ],
      default: next.servers.dbServer.cache || 'redis',
    });
    next.servers.dbServer.cache = cacheChoice;
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

  const mediaEnabled = await confirm({
    message: 'Enable Media Server (Jellyfin)?',
    default: next.servers.media.enabled,
  });
  next.servers.media.enabled = mediaEnabled;
  next.servers.media.services = mediaEnabled ? ['jellyfin'] : [];
  console.log();

  // -------------------------------------------------------------------------
  // 8. SSH Server (toggle + passwordAuth + SFTP auto-suggest)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  SSH Server'));

  const sshEnabled = await confirm({
    message: 'Enable SSH Server?',
    default: next.servers.sshServer.enabled,
  });
  next.servers.sshServer.enabled = sshEnabled;

  if (sshEnabled) {
    next.servers.sshServer.port = 2222;
    console.log(chalk.dim('  SSH port: 2222'));

    const passwordAuth = await confirm({
      message: 'Allow password authentication? (key-only auth recommended)',
      default: next.servers.sshServer.passwordAuth ?? false,
    });
    next.servers.sshServer.passwordAuth = passwordAuth;

    // SFTP auto-suggestion
    if (shouldAutoSuggestSftp(next)) {
      console.log(
        chalk.dim('  SFTP auto-enabled (File Server or Media Server is active)'),
      );
      next.servers.sshServer.sftp = true;
    } else {
      const sftpEnabled = await confirm({
        message: 'Enable SFTP subsystem?',
        default: next.servers.sshServer.sftp,
      });
      next.servers.sshServer.sftp = sftpEnabled;
    }
  }
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
