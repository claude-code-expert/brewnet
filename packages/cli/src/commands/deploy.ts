// packages/cli/src/commands/deploy.ts — Deploy a local project path
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { deployLocalApp, getJobStatus } from '../services/app-manager.js';

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy <path>')
    .description('Deploy a local project (auto-detects language, generates Docker config if needed)')
    .option('-n, --name <name>', 'App name (defaults to directory name)')
    .option('-p, --port <port>', 'Container port', '3000')
    .action(async (pathArg: string, opts: { name?: string; port: string }) => {
      const localPath = resolve(pathArg);
      if (!existsSync(localPath)) {
        console.error(chalk.red(`✗ Path does not exist: ${localPath}`));
        process.exit(1);
      }

      const dirName = localPath.split('/').pop() ?? 'my-app';
      const appName = opts.name ?? dirName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const port = parseInt(opts.port, 10);

      const spinner = ora(`Deploying ${chalk.cyan(appName)} from ${chalk.dim(localPath)}…`).start();
      try {
        const jobId = await deployLocalApp({ appName, localPath, port });

        // Poll until done (max 3 min)
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          await new Promise<void>((r) => setTimeout(r, 2000));
          const job = getJobStatus(jobId);
          if (!job) break;
          const current = job.steps.find((s) => s.status === 'running');
          if (current) spinner.text = `${chalk.cyan(appName)} — ${current.label}…`;
          if (job.status === 'done') {
            spinner.succeed(chalk.green(`${appName} deployed successfully`));
            console.log(`  App URL : ${chalk.cyan(`http://localhost/apps/${appName}/`)}`);
            console.log(`  Admin   : ${chalk.dim('http://localhost:8088/apps/' + appName)}`);
            process.exit(0);
          }
          if (job.status === 'failed') {
            spinner.fail(chalk.red(`Deploy failed: ${job.error ?? 'unknown error'}`));
            process.exit(1);
          }
        }
        spinner.warn('Deploy timed out — check admin panel for status');
      } catch (e) {
        spinner.fail(chalk.red(`Error: ${e instanceof Error ? e.message : String(e)}`));
        process.exit(1);
      }
    });
}
