/**
 * brewnet shutdown — Stop the admin panel daemon
 *
 * Finds and kills the admin server process running on port 8088 (or --port).
 *
 * @module commands/shutdown
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'node:child_process';

export function registerShutdownCommand(program: Command): void {
  program
    .command('shutdown')
    .description('Stop the admin panel daemon')
    .option('--port <port>', 'Admin panel port (default: 8088)', '8088')
    .action((options: { port: string }) => {
      const port = parseInt(options.port, 10);

      try {
        const pids = execSync(`lsof -ti :${port} 2>/dev/null || true`, { encoding: 'utf-8' })
          .trim()
          .split('\n')
          .filter(Boolean);

        if (pids.length === 0) {
          console.log(chalk.dim(`  No process found on port ${port}.`));
          return;
        }

        for (const pid of pids) {
          try {
            process.kill(parseInt(pid, 10), 'SIGTERM');
          } catch { /* already dead */ }
        }

        console.log(chalk.green(`  Admin panel stopped.`) + chalk.dim(` (PID ${pids.join(', ')}, port ${port})`));
      } catch {
        console.log(chalk.dim(`  No admin panel running on port ${port}.`));
      }
    });
}
