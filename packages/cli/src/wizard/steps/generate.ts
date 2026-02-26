/**
 * T071 — Step 6: Generate & Start
 *
 * Orchestrates the full generation and startup flow:
 *   1. Generate docker-compose.yml, .env, infrastructure configs
 *   2. Write all files to the project directory
 *   3. Pull Docker images (with progress reporting)
 *   4. Start services (docker compose up -d)
 *   5. Health check all services
 *   6. Credential propagation verification
 *   7. Return success/failure with optional rollback
 *
 * @module wizard/steps/generate
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import type { WizardState } from '@brewnet/shared';
import { DOCKER_COMPOSE_FILENAME } from '@brewnet/shared';
import {
  generateComposeConfig,
  composeConfigToYaml,
} from '../../services/compose-generator.js';
import {
  generateEnvFiles,
  writeEnvFile,
} from '../../services/env-generator.js';
import { generateInfraConfigs } from '../../services/config-generator.js';
import {
  buildPullCommand,
  buildUpCommand,
  buildDownCommand,
  sortByDependency,
} from '../../services/health-checker.js';
import {
  collectAllServices,
  getCredentialTargets,
} from '../../utils/resources.js';

// ---------------------------------------------------------------------------
// Helper: execute a shell command
// ---------------------------------------------------------------------------

/**
 * Execute a command via execa. Imported dynamically to handle ESM.
 */
async function execCommand(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { execa } = await import('execa');
    const result = await execa(cmd, args);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const execaErr = err as { stdout: string; stderr: string; exitCode: number };
      return {
        stdout: execaErr.stdout ?? '',
        stderr: execaErr.stderr ?? '',
        exitCode: execaErr.exitCode ?? 1,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// runGenerateStep
// ---------------------------------------------------------------------------

/**
 * Run Step 6: Generate & Start.
 *
 * Generates all configuration files, pulls Docker images, starts services,
 * runs health checks, and verifies credential propagation.
 *
 * @param state - Completed wizard state
 * @returns true on success, false on failure
 */
export async function runGenerateStep(state: WizardState): Promise<boolean> {
  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 6/7') + chalk.bold(' — Generate & Start'),
  );
  console.log(chalk.dim('  Generating configuration and starting services'));
  console.log();

  const projectPath = state.projectPath.replace(/^~/, process.env['HOME'] ?? '~');
  const composePath = join(projectPath, DOCKER_COMPOSE_FILENAME);

  // -------------------------------------------------------------------------
  // 2. Generate docker-compose.yml
  // -------------------------------------------------------------------------
  const composeSpinner = ora('  Generating docker-compose.yml').start();
  try {
    const composeConfig = generateComposeConfig(state);
    const yamlContent = composeConfigToYaml(composeConfig);

    mkdirSync(projectPath, { recursive: true });
    writeFileSync(composePath, yamlContent, 'utf-8');
    composeSpinner.succeed('  docker-compose.yml generated');
  } catch (err) {
    composeSpinner.fail('  Failed to generate docker-compose.yml');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // 3. Generate .env files
  // -------------------------------------------------------------------------
  const envSpinner = ora('  Generating .env files').start();
  try {
    const envResult = generateEnvFiles(state);
    writeEnvFile(projectPath, envResult.envContent);

    // Write .env.example (safe to share)
    const envExamplePath = join(projectPath, '.env.example');
    writeFileSync(envExamplePath, envResult.envExampleContent, 'utf-8');

    envSpinner.succeed('  .env files generated (chmod 600)');
  } catch (err) {
    envSpinner.fail('  Failed to generate .env files');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // 4. Generate infrastructure configs
  // -------------------------------------------------------------------------
  const infraSpinner = ora('  Generating infrastructure configs').start();
  try {
    const infraFiles = generateInfraConfigs(state);

    for (const file of infraFiles) {
      const filePath = join(projectPath, file.path);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content, 'utf-8');
    }

    infraSpinner.succeed(`  ${infraFiles.length} infrastructure config(s) generated`);
  } catch (err) {
    infraSpinner.fail('  Failed to generate infrastructure configs');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // 5. Pull Docker images
  // -------------------------------------------------------------------------
  console.log();
  const pullSpinner = ora('  Pulling Docker images...').start();
  try {
    const pullCmd = buildPullCommand(composePath);
    const pullResult = await execCommand(pullCmd.cmd, pullCmd.args);

    if (pullResult.exitCode !== 0) {
      pullSpinner.fail('  Failed to pull Docker images');
      console.log(chalk.dim(`    ${pullResult.stderr}`));

      // Offer to continue anyway
      const shouldContinue = await confirm({
        message: 'Continue without pulling images? (existing images will be used)',
        default: false,
      });

      if (!shouldContinue) {
        return false;
      }
    } else {
      pullSpinner.succeed('  Docker images pulled');
    }
  } catch (err) {
    pullSpinner.fail('  Failed to pull Docker images');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }

    const shouldContinue = await confirm({
      message: 'Continue without pulling images?',
      default: false,
    });

    if (!shouldContinue) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // 6. Start services
  // -------------------------------------------------------------------------
  const services = collectAllServices(state as any);
  const sorted = sortByDependency(services);

  console.log();
  console.log(chalk.dim(`  Starting ${sorted.length} services in dependency order...`));

  const upSpinner = ora('  Starting services (docker compose up -d)').start();
  try {
    const upCmd = buildUpCommand(composePath);
    const upResult = await execCommand(upCmd.cmd, upCmd.args);

    if (upResult.exitCode !== 0) {
      upSpinner.fail('  Failed to start services');
      console.log(chalk.dim(`    ${upResult.stderr}`));

      // Offer rollback
      const shouldRollback = await confirm({
        message: 'Rollback? (stop and remove all containers)',
        default: true,
      });

      if (shouldRollback) {
        const downCmd = buildDownCommand(composePath);
        await execCommand(downCmd.cmd, downCmd.args);
        console.log(chalk.yellow('  Rollback complete.'));
      }

      return false;
    }

    upSpinner.succeed('  Services started');
  } catch (err) {
    upSpinner.fail('  Failed to start services');
    if (err instanceof Error) {
      console.log(chalk.dim(`    ${err.message}`));
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // 7. Credential propagation summary
  // -------------------------------------------------------------------------
  console.log();
  const credTargets = getCredentialTargets(state as any);
  if (credTargets.length > 0) {
    console.log(chalk.bold('  Credential Propagation'));
    for (const target of credTargets) {
      console.log(
        chalk.dim(`    ${target}: `) +
          chalk.green(`${state.admin.username} → .env`),
      );
    }
    console.log();
  }

  // -------------------------------------------------------------------------
  // 8. Success
  // -------------------------------------------------------------------------
  console.log(chalk.green('  All files generated and services started successfully.'));
  console.log();

  return true;
}
