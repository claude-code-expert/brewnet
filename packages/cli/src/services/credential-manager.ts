/**
 * T059 — Credential Manager
 *
 * Determines which services receive the admin credentials during setup,
 * and generates .env entries for credential propagation.
 *
 * Admin credentials (username + password) from Step 2 are propagated
 * to all enabled services that require authentication.
 *
 * @module services/credential-manager
 */

import type { WizardState } from '@brewnet/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CredentialTarget {
  /** Service identifier (e.g. 'gitea', 'postgresql') */
  service: string;
  /** Environment variable name (e.g. 'GITEA_ADMIN_PASSWORD') */
  envVar: string;
  /** Human-readable description (e.g. 'Gitea admin password') */
  description: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all credential propagation targets based on enabled services.
 *
 * Returns a list of services that will receive the admin credentials
 * during setup. Each target includes the service name, the environment
 * variable that will be set, and a human-readable description.
 *
 * @param state - Current wizard state
 * @returns Array of credential targets for enabled services
 */
export function getCredentialPropagationTargets(
  state: WizardState,
): CredentialTarget[] {
  const targets: CredentialTarget[] = [];
  const s = state.servers;

  // Gitea always receives admin credentials (Git Server is required)
  targets.push({
    service: 'gitea',
    envVar: 'GITEA__security__SECRET_KEY',
    description: 'Gitea secret key',
  });
  targets.push({
    service: 'gitea',
    envVar: 'GITEA_ADMIN_PASSWORD',
    description: 'Gitea admin password',
  });

  // PostgreSQL
  if (s.dbServer.enabled && s.dbServer.primary === 'postgresql') {
    targets.push({
      service: 'postgresql',
      envVar: 'POSTGRES_PASSWORD',
      description: 'PostgreSQL root password',
    });
  }

  // MySQL
  if (s.dbServer.enabled && s.dbServer.primary === 'mysql') {
    targets.push({
      service: 'mysql',
      envVar: 'MYSQL_ROOT_PASSWORD',
      description: 'MySQL root password',
    });
  }

  // pgAdmin (DB admin UI for PostgreSQL)
  if (
    s.dbServer.enabled &&
    s.dbServer.adminUI &&
    s.dbServer.primary === 'postgresql'
  ) {
    targets.push({
      service: 'pgadmin',
      envVar: 'PGADMIN_DEFAULT_PASSWORD',
      description: 'pgAdmin default password',
    });
  }

  // Nextcloud
  if (s.fileServer.enabled && s.fileServer.service === 'nextcloud') {
    targets.push({
      service: 'nextcloud',
      envVar: 'NEXTCLOUD_ADMIN_PASSWORD',
      description: 'Nextcloud admin password',
    });
  }

  // MinIO
  if (s.fileServer.enabled && s.fileServer.service === 'minio') {
    targets.push({
      service: 'minio',
      envVar: 'MINIO_ROOT_PASSWORD',
      description: 'MinIO root password',
    });
  }

  return targets;
}

/**
 * Generate .env entries for credential propagation.
 *
 * Returns a key-value map of environment variable names to their
 * values, based on the admin credentials and enabled services.
 * These entries should be written to the project's .env file.
 *
 * @param state - Current wizard state
 * @returns Record of environment variable entries
 */
export function generateCredentialEnvEntries(
  state: WizardState,
): Record<string, string> {
  const entries: Record<string, string> = {};
  const { username, password } = state.admin;

  // Always include admin credentials
  entries['BREWNET_ADMIN_USERNAME'] = username;
  entries['BREWNET_ADMIN_PASSWORD'] = password;

  // Get all targets and set their env vars
  const targets = getCredentialPropagationTargets(state);

  for (const target of targets) {
    // For password env vars, use the admin password
    // For other vars like secret keys, also use the admin password as the base
    entries[target.envVar] = password;
  }

  // Additional service-specific entries that use the admin username

  // Gitea admin username
  entries['GITEA_ADMIN_USER'] = username;

  // pgAdmin uses email format for the default admin
  const s = state.servers;
  if (
    s.dbServer.enabled &&
    s.dbServer.adminUI &&
    s.dbServer.primary === 'postgresql'
  ) {
    entries['PGADMIN_DEFAULT_EMAIL'] = `${username}@brewnet.dev`;
  }

  // Nextcloud admin username
  if (s.fileServer.enabled && s.fileServer.service === 'nextcloud') {
    entries['NEXTCLOUD_ADMIN_USER'] = username;
  }

  // MinIO root user
  if (s.fileServer.enabled && s.fileServer.service === 'minio') {
    entries['MINIO_ROOT_USER'] = username;
  }

  // Database credentials (these use the DB-specific password, not admin password)
  if (s.dbServer.enabled && s.dbServer.primary === 'postgresql') {
    entries['POSTGRES_USER'] = s.dbServer.dbUser;
    entries['POSTGRES_DB'] = s.dbServer.dbName;
    entries['POSTGRES_PASSWORD'] = s.dbServer.dbPassword || password;
  }

  if (s.dbServer.enabled && s.dbServer.primary === 'mysql') {
    entries['MYSQL_DATABASE'] = s.dbServer.dbName;
    entries['MYSQL_USER'] = s.dbServer.dbUser;
    entries['MYSQL_PASSWORD'] = s.dbServer.dbPassword || password;
    entries['MYSQL_ROOT_PASSWORD'] = password;
  }

  return entries;
}
