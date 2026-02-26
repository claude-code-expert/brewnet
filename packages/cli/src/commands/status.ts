/**
 * brewnet status — Show service status
 *
 * Lists all managed services and their current state (running, stopped, etc.).
 * Supports --json for machine-readable output.
 *
 * @module commands/status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import { checkDockerAvailability } from '../services/docker-manager.js';
import { BrewnetError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContainerInfo {
  name: string;
  state: 'running' | 'exited' | 'created' | 'restarting' | 'removing' | 'paused' | 'dead';
  status: string;
  ports: string[];
  image: string;
  created: number;
}

export interface StatusRow {
  name: string;
  status: string;
  image: string;
  ports: string;
  uptime: string;
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

/**
 * Returns a colored status indicator string for a given Docker container state.
 *
 * - 'running' -> green bullet + "Running"
 * - 'exited' or 'dead' -> red bullet + "Stopped"
 * - 'restarting', 'paused', 'created', 'removing' -> yellow bullet + state label
 * - unknown -> dim bullet + capitalized state
 */
export function getStatusIndicator(state: string): string {
  const bullet = '\u25CF'; // ●

  switch (state) {
    case 'running':
      return chalk.green(`${bullet} Running`);
    case 'exited':
      return chalk.red(`${bullet} Stopped`);
    case 'dead':
      return chalk.red(`${bullet} Stopped`);
    case 'restarting':
      return chalk.yellow(`${bullet} Restarting`);
    case 'paused':
      return chalk.yellow(`${bullet} Paused`);
    case 'created':
      return chalk.yellow(`${bullet} Created`);
    case 'removing':
      return chalk.yellow(`${bullet} Removing`);
    default:
      return chalk.dim(`${bullet} ${state.charAt(0).toUpperCase()}${state.slice(1)}`);
  }
}

// ---------------------------------------------------------------------------
// Uptime parsing
// ---------------------------------------------------------------------------

/**
 * Parses a Docker status string and extracts a human-friendly uptime value.
 *
 * Examples:
 *   "Up 2 hours"           -> "2h"
 *   "Up 30 minutes"        -> "30m"
 *   "Up 3 days"            -> "3d"
 *   "Up About an hour"     -> "1h"
 *   "Up Less than a second" -> "<1s"
 *   "Exited (0) 5 minutes ago" -> "-"
 */
function parseUptime(status: string): string {
  if (!status.startsWith('Up')) {
    return '-';
  }

  const text = status.slice(3); // Remove "Up " prefix

  // "Less than a second"
  if (/less than a second/i.test(text)) {
    return '<1s';
  }

  // "About an hour" / "About a minute"
  if (/about an? hour/i.test(text)) {
    return '1h';
  }
  if (/about an? minute/i.test(text)) {
    return '1m';
  }

  // Numeric patterns: "2 hours", "30 minutes", "3 days", "5 seconds"
  const match = text.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?/i);
  if (match) {
    const value = match[1];
    const unit = match[2].toLowerCase();
    const unitMap: Record<string, string> = {
      second: 's',
      minute: 'm',
      hour: 'h',
      day: 'd',
      week: 'w',
      month: 'mo',
      year: 'y',
    };
    return `${value}${unitMap[unit] ?? unit.charAt(0)}`;
  }

  // Fallback for unrecognized "Up ..." strings
  return '-';
}

// ---------------------------------------------------------------------------
// Format functions
// ---------------------------------------------------------------------------

/**
 * Transforms an array of Docker container info objects into formatted status rows.
 */
export function formatServiceStatus(containers: ContainerInfo[]): StatusRow[] {
  return containers.map((c) => ({
    name: c.name,
    status: getStatusIndicator(c.state),
    image: c.image,
    ports: c.ports.join(', '),
    uptime: parseUptime(c.status),
  }));
}

/**
 * Renders an array of status rows into a formatted CLI table string.
 * Returns a "No services running" message if the array is empty.
 */
export function formatStatusTable(rows: StatusRow[]): string {
  if (rows.length === 0) {
    return chalk.yellow('No services running');
  }

  // Compute column widths (minimum widths based on headers)
  const headers = ['Name', 'Status', 'Image', 'Ports', 'Uptime'];
  const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '');

  const colWidths = headers.map((h) => h.length);

  for (const row of rows) {
    const values = [row.name, stripAnsi(row.status), row.image, row.ports, row.uptime];
    for (let i = 0; i < values.length; i++) {
      colWidths[i] = Math.max(colWidths[i], values[i].length);
    }
  }

  const pad = (str: string, width: number, rawLength?: number) => {
    const len = rawLength ?? str.length;
    return str + ' '.repeat(Math.max(0, width - len));
  };

  const separator = colWidths.map((w) => '-'.repeat(w)).join('  ');

  // Header line
  const headerLine = headers.map((h, i) => pad(chalk.bold(h), colWidths[i], h.length)).join('  ');

  // Data lines
  const dataLines = rows.map((row) => {
    const values = [row.name, row.status, row.image, row.ports, row.uptime];
    const rawValues = [row.name, stripAnsi(row.status), row.image, row.ports, row.uptime];
    return values.map((v, i) => pad(v, colWidths[i], rawValues[i].length)).join('  ');
  });

  return [headerLine, separator, ...dataLines].join('\n');
}

// ---------------------------------------------------------------------------
// Docker compose ps output parsing
// ---------------------------------------------------------------------------

interface DockerComposePsEntry {
  Name?: string;
  Service?: string;
  State?: string;
  Status?: string;
  ExitCode?: number;
  Image?: string;
  Publishers?: { PublishedPort: number; TargetPort: number; Protocol: string }[];
  Created?: number;
}

function parseDockerComposePsEntry(entry: DockerComposePsEntry): ContainerInfo {
  const rawState = (entry.State ?? 'unknown').toLowerCase();
  const validStates = ['running', 'exited', 'created', 'restarting', 'removing', 'paused', 'dead'];
  const state = validStates.includes(rawState)
    ? (rawState as ContainerInfo['state'])
    : 'dead';

  const ports = (entry.Publishers ?? [])
    .filter((p) => p.PublishedPort > 0)
    .map((p) => `${p.PublishedPort}→${p.TargetPort}/${p.Protocol}`);

  // Derive a friendly service name: prefer Service field, strip project prefix from Name
  const stripped = (entry.Name ?? '').replace(/^[^-]+-/, '').replace(/-\d+$/, '');
  const name = entry.Service ?? (stripped || entry.Name) ?? 'unknown';

  return {
    name,
    state,
    status: entry.Status ?? state,
    ports,
    image: entry.Image ?? '',
    created: entry.Created ?? 0,
  };
}

function parseDockerComposePsOutput(stdout: string): ContainerInfo[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  // Try JSON array first (docker compose v2.20+)
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((e) => parseDockerComposePsEntry(e as DockerComposePsEntry));
    }
  } catch {
    // fall through to NDJSON
  }

  // NDJSON — one JSON object per line
  return trimmed
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [parseDockerComposePsEntry(JSON.parse(line) as DockerComposePsEntry)];
      } catch {
        return [];
      }
    });
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show service status')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .option('--json', 'Output status as JSON for scripting')
    .action(async (options: { path: string; json: boolean }) => {
      // Guard: Docker must be running
      try {
        await checkDockerAvailability();
      } catch (err) {
        const msg = err instanceof BrewnetError ? err.message : String(err);
        console.error(chalk.red(`Error [BN001]: ${msg}`));
        process.exitCode = 1;
        return;
      }

      try {
        const { stdout } = await execa(
          'docker',
          ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'ps', '--all', '--format', 'json'],
          { cwd: options.path },
        );

        const containers = parseDockerComposePsOutput(stdout);

        if (options.json) {
          console.log(JSON.stringify(containers, null, 2));
          return;
        }

        const rows = formatServiceStatus(containers);
        console.log(formatStatusTable(rows));

        if (containers.length > 0) {
          const running = containers.filter((c) => c.state === 'running').length;
          console.log(
            chalk.dim(`\n  ${running}/${containers.length} service${containers.length !== 1 ? 's' : ''} running`),
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('no configuration file provided') ||
          msg.includes('not found') ||
          msg.includes('No such file')
        ) {
          console.log(chalk.yellow('No brewnet project found in the current directory.'));
          console.log(
            chalk.dim(`  Run ${chalk.bold('brewnet init')} to set up a project, or use `) +
              chalk.bold('-p <path>') +
              chalk.dim(' to specify a project path.'),
          );
        } else {
          console.error(chalk.red(`Error: ${msg}`));
          process.exitCode = 1;
        }
      }
    });
}
