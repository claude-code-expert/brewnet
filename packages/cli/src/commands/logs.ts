/**
 * brewnet logs [service] — View service logs
 *
 * Displays logs for all services or a specific one via docker compose logs.
 * Use -f/--follow to stream logs in real time.
 * Use -n/--tail to limit the number of lines shown.
 *
 * New aggregator flags (--all, --source, --level, --since, --json) read
 * from CLI JSONL, Tunnel NDJSON, Traefik access log, and Docker container logs
 * and display a unified view.
 *
 * @module commands/logs
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import type { LogSource, UnifiedLogLevel, UnifiedLogEntry } from '@brewnet/shared';
import { parseDuration, queryLogs } from '../utils/log-aggregator.js';

const VALID_SOURCES: LogSource[] = ['cli', 'tunnel', 'access', 'service'];
const VALID_LEVELS: UnifiedLogLevel[] = ['info', 'warn', 'error', 'debug'];

const SOURCE_COLORS: Record<LogSource, (s: string) => string> = {
  cli: chalk.cyan,
  tunnel: chalk.magenta,
  access: chalk.blue,
  service: chalk.white,
};

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  info: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  debug: chalk.gray,
};

function formatEntry(entry: UnifiedLogEntry): string {
  const ts = entry.timestamp.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
  const sourceColor = SOURCE_COLORS[entry.source] ?? chalk.white;
  const levelColor = LEVEL_COLORS[entry.level] ?? chalk.white;
  const source = sourceColor(entry.source.toUpperCase().padEnd(7));
  const service = (entry.service ?? '').padEnd(12);
  const message = levelColor(entry.message);
  return `${ts}  ${source}  ${service}  ${message}`;
}

interface LogsOptions {
  follow?: boolean;
  tail?: string;
  path: string;
  all?: boolean;
  source?: string;
  level?: string;
  since?: string;
  json?: boolean;
}

export function registerLogsCommand(program: Command): void {
  program
    .command('logs')
    .description('View service logs')
    .argument('[service]', 'Name of a specific service (shows all if omitted)')
    .option('-f, --follow', 'Follow log output in real time')
    .option('-n, --tail <lines>', 'Number of lines to show from the end of the logs')
    .option('-p, --path <path>', 'Project path (defaults to current directory)', process.cwd())
    .option('--all', 'Show unified logs from all sources')
    .option('--source <type>', 'Filter by source (cli|tunnel|access|service)')
    .option('--level <level>', 'Filter by severity (info|warn|error|debug)')
    .option('--since <duration>', 'Time range start (1h, 30m, 1d, or ISO date)')
    .option('--json', 'Output as JSON lines')
    .action(async (service: string | undefined, options: LogsOptions) => {
      const useAggregator = options.all || options.source || options.level || options.since;

      // Validate flag conflicts
      if (options.json && !useAggregator) {
        console.error(chalk.red('--json requires --all or --source'));
        process.exitCode = 1;
        return;
      }
      if (options.follow && useAggregator) {
        console.error(
          chalk.red(
            '--follow is not supported with --all/--source (use without these flags for real-time streaming)',
          ),
        );
        process.exitCode = 1;
        return;
      }

      if (useAggregator) {
        await handleAggregatorLogs(service, options);
      } else {
        await handleDockerLogs(service, options);
      }
    });
}

async function handleAggregatorLogs(
  service: string | undefined,
  options: LogsOptions,
): Promise<void> {
  // Validate --source
  if (options.source && !VALID_SOURCES.includes(options.source as LogSource)) {
    console.error(
      chalk.red(
        `Invalid source: '${options.source}'. Valid: ${VALID_SOURCES.join(', ')}`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  // Validate --level
  if (options.level && !VALID_LEVELS.includes(options.level as UnifiedLogLevel)) {
    console.error(
      chalk.red(
        `Invalid level: '${options.level}'. Valid: ${VALID_LEVELS.join(', ')}`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  // Parse --since
  let since: string | undefined;
  if (options.since) {
    try {
      since = parseDuration(options.since);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid time format';
      console.error(chalk.red(message));
      process.exitCode = 1;
      return;
    }
  }

  try {
    const result = await queryLogs(
      {
        sources: options.source ? [options.source as LogSource] : undefined,
        levels: options.level ? [options.level as UnifiedLogLevel] : undefined,
        services: service ? [service] : undefined,
        since,
      },
      options.path,
    );

    if (result.entries.length === 0) {
      console.log(chalk.gray('No log entries found.'));
      return;
    }

    if (options.json) {
      for (const entry of result.entries) {
        console.log(JSON.stringify(entry));
      }
    } else {
      for (const entry of result.entries) {
        console.log(formatEntry(entry));
      }
      if (result.hasMore) {
        console.log(chalk.gray(`\n… ${result.total - result.entries.length} more entries`));
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(`Failed to query logs: ${message}`));
    process.exitCode = 1;
  }
}

async function handleDockerLogs(
  service: string | undefined,
  options: LogsOptions,
): Promise<void> {
  try {
    const args = ['compose', '-f', DOCKER_COMPOSE_FILENAME, 'logs'];

    if (options.follow) {
      args.push('--follow');
    }
    if (options.tail) {
      args.push('--tail', options.tail);
    }
    if (service) {
      args.push(service);
    }

    // Stream logs directly to stdout/stderr using inherit
    await execa('docker', args, {
      cwd: options.path,
      stdio: 'inherit',
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error fetching logs';
    console.error(chalk.red(`Failed to fetch logs: ${message}`));
    process.exitCode = 1;
  }
}
