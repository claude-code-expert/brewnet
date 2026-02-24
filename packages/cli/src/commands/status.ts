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
// Command registration
// ---------------------------------------------------------------------------

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show service status')
    .option('--json', 'Output status as JSON for scripting')
    .action(async (options) => {
      // TODO: Implement status display
      console.log('brewnet status: not yet implemented', options);
    });
}
