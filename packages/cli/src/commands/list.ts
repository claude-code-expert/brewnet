/**
 * brewnet list — List available services and app stacks
 *
 * Shows all services from SERVICE_REGISTRY grouped by category with
 * installation status, or app stacks from STACK_CATALOG.
 *
 * @module commands/list
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { SERVICE_REGISTRY } from '../config/services.js';
import { STACK_CATALOG } from '../config/stacks.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceCategory {
  label: string;
  ids: string[];
}

// ---------------------------------------------------------------------------
// Service categories
// ---------------------------------------------------------------------------

const SERVICE_CATEGORIES: ServiceCategory[] = [
  { label: 'Web Server', ids: ['traefik', 'nginx', 'caddy'] },
  { label: 'Git Server', ids: ['gitea'] },
  { label: 'File Server', ids: ['nextcloud', 'minio', 'filebrowser'] },
  { label: 'Database', ids: ['postgresql', 'mysql'] },
  { label: 'Media', ids: ['jellyfin'] },
  { label: 'Admin UI', ids: ['pgadmin'] },
  { label: 'Tunnel', ids: ['cloudflared'] },
];

// ---------------------------------------------------------------------------
// Docker compose running services detection
// ---------------------------------------------------------------------------

interface DockerComposePsEntry {
  Service?: string;
  State?: string;
}

/**
 * Parse docker compose ps JSON output (handles both JSON array and NDJSON).
 * Returns a Set of running service names.
 */
function parseRunningServices(stdout: string): Set<string> {
  const trimmed = stdout.trim();
  if (!trimmed) return new Set();

  const entries: DockerComposePsEntry[] = [];

  // Try JSON array first (docker compose v2.20+)
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      entries.push(...(parsed as DockerComposePsEntry[]));
    }
  } catch {
    // Fall through to NDJSON
    for (const line of trimmed.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as DockerComposePsEntry);
      } catch {
        // skip malformed lines
      }
    }
  }

  const services = new Set<string>();
  for (const entry of entries) {
    if (entry.Service) {
      services.add(entry.Service);
    }
  }
  return services;
}

/**
 * Detect installed (running or stopped) services via docker compose ps.
 */
async function getInstalledServices(projectPath: string): Promise<Set<string>> {
  try {
    const { stdout } = await execa(
      'docker',
      ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'ps', '--all', '--format', 'json'],
      { cwd: projectPath },
    );
    return parseRunningServices(stdout);
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Display: Services
// ---------------------------------------------------------------------------

function displayServices(
  installedServices: Set<string>,
  installedOnly: boolean,
): void {
  const bullet = '\u25CF'; // filled circle

  console.log(chalk.bold('\nBrewnet Services\n'));

  for (const category of SERVICE_CATEGORIES) {
    const rows: string[] = [];

    for (const id of category.ids) {
      const def = SERVICE_REGISTRY.get(id);
      if (!def) continue;

      const isInstalled = installedServices.has(id);
      if (installedOnly && !isInstalled) continue;

      const statusIcon = isInstalled
        ? chalk.green(`${bullet} Installed`)
        : chalk.dim(`${bullet} Available`);

      rows.push(`  ${chalk.cyan(def.id.padEnd(18))} ${def.name.padEnd(22)} ${statusIcon}`);
    }

    if (rows.length === 0) continue;

    console.log(chalk.bold.underline(category.label));
    for (const row of rows) {
      console.log(row);
    }
    console.log();
  }

  const totalInstalled = installedServices.size;
  const totalServices = [...SERVICE_REGISTRY.keys()].length;
  console.log(
    chalk.dim(`  ${totalInstalled}/${totalServices} services installed`),
  );
}

// ---------------------------------------------------------------------------
// Display: Stacks
// ---------------------------------------------------------------------------

function displayStacks(): void {
  console.log(chalk.bold('\nBrewnet App Stacks\n'));

  // Group by language
  const byLanguage: Record<string, typeof STACK_CATALOG> = {};
  for (const stack of STACK_CATALOG) {
    if (!byLanguage[stack.language]) {
      byLanguage[stack.language] = [];
    }
    byLanguage[stack.language]!.push(stack);
  }

  for (const [language, stacks] of Object.entries(byLanguage)) {
    console.log(chalk.bold.underline(language));
    for (const stack of stacks) {
      const flags: string[] = [];
      if (stack.isUnified) flags.push(chalk.blue('unified'));
      if (stack.buildSlow) flags.push(chalk.yellow('slow build'));
      const flagStr = flags.length > 0 ? ` ${chalk.dim('(')}${flags.join(chalk.dim(', '))}${chalk.dim(')')}` : '';

      console.log(
        `  ${chalk.cyan(stack.id.padEnd(22))} ${stack.framework.padEnd(26)} v${stack.version.padEnd(6)} ${chalk.dim(stack.orm)}${flagStr}`,
      );
    }
    console.log();
  }

  console.log(
    chalk.dim(`  ${STACK_CATALOG.length} stacks available`),
  );
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

function buildServicesJson(installedServices: Set<string>) {
  return SERVICE_CATEGORIES.flatMap((category) =>
    category.ids
      .map((id) => {
        const def = SERVICE_REGISTRY.get(id);
        if (!def) return null;
        return {
          id: def.id,
          name: def.name,
          category: category.label,
          image: def.image,
          installed: installedServices.has(id),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  );
}

function buildStacksJson(): object[] {
  return STACK_CATALOG.map((stack) => ({
    id: stack.id,
    language: stack.language,
    framework: stack.framework,
    version: stack.version,
    orm: stack.orm,
    isUnified: stack.isUnified,
    buildSlow: stack.buildSlow,
  }));
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List available services and app stacks')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .option('--stacks', 'Show app stacks instead of services')
    .option('--installed', 'Show only installed services')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        path: string;
        stacks: boolean;
        installed: boolean;
        json: boolean;
      }) => {
        if (options.stacks) {
          // Show stacks
          if (options.json) {
            console.log(JSON.stringify(buildStacksJson(), null, 2));
          } else {
            displayStacks();
          }
          return;
        }

        // Show services
        const installedServices = await getInstalledServices(options.path);

        if (options.json) {
          const data = buildServicesJson(installedServices);
          const filtered = options.installed
            ? data.filter((s) => (s as { installed: boolean }).installed)
            : data;
          console.log(JSON.stringify(filtered, null, 2));
          return;
        }

        displayServices(installedServices, options.installed);
      },
    );
}
