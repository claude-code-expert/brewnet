/**
 * Minimal Install runner.
 *
 * Fast-path wizard that only prompts for project name, admin username,
 * and admin password, then spins up Traefik + Gitea + Quick Tunnel.
 *
 * All other services (DB, file server, media, SSH, boilerplate) are
 * disabled. The existing Full Install wizard is unchanged.
 *
 * @module wizard/run-minimal-install
 */

import chalk from 'chalk';
import { input, password } from '@inquirer/prompts';
import { runGenerateStep } from './steps/generate.js';
import { runCompleteStep } from './steps/complete.js';
import {
  createState,
  saveState,
} from './state.js';
import { applyMinimalInstallDefaults } from '../config/defaults.js';

export async function runMinimalInstall(options: { noOpen?: boolean } = {}): Promise<void> {
  console.log(chalk.cyan('  ─────────────────────────────────────────────'));
  console.log(chalk.bold('  Minimal Install') + chalk.dim(' — Traefik + Gitea + Quick Tunnel'));
  console.log(chalk.cyan('  ─────────────────────────────────────────────'));
  console.log();

  // 1. Project name
  const projectName = await input({
    message: 'Project name',
    default: 'brewnet-home',
    validate: (v) => v.trim().length > 0 || 'Project name is required',
  });

  // 2. Admin username
  const adminUsername = await input({
    message: 'Admin username',
    default: 'admin',
    validate: (v) => v.trim().length > 0 || 'Username is required',
  });

  // 3. Admin password
  const adminPassword = await password({
    message: 'Admin password',
    mask: '*',
    validate: (v) => v.length >= 8 || 'Password must be at least 8 characters',
  });

  console.log();

  // 4. Build WizardState
  let state = createState();
  state = {
    ...state,
    projectName: projectName.trim(),
    projectPath: `~/brewnet/${projectName.trim()}`,
    admin: {
      ...state.admin,
      username: adminUsername.trim(),
      password: adminPassword,
    },
  };
  state = applyMinimalInstallDefaults(state);

  // 5. Save state so admin-server can load credentials
  saveState(state);

  // 6. Generate → Complete (reuses existing steps)
  const result = await runGenerateStep(state);
  // Persist any runtime values captured during generation (e.g. quickTunnelUrl)
  try { saveState(state); } catch { /* non-critical */ }

  if (result === 'success') {
    await runCompleteStep(state, { noOpen: options.noOpen });
  }
}
