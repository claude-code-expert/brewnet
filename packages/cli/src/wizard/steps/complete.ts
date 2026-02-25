/**
 * T072 — Step 7: Complete
 *
 * Displays the final summary after successful setup:
 *   1. Endpoint URLs table
 *   2. Credentials summary
 *   3. External access verification commands (for non-local domains)
 *   4. Next steps / troubleshooting tips
 *
 * @module wizard/steps/complete
 */

import chalk from 'chalk';
import type { WizardState } from '@brewnet/shared';
import {
  collectAllServices,
  getCredentialTargets,
} from '../../utils/resources.js';
import {
  generateEndpoints,
  sortByDependency,
} from '../../services/health-checker.js';
import { generateAndOpenStatusPage } from '../../services/status-page.js';

// ---------------------------------------------------------------------------
// runCompleteStep
// ---------------------------------------------------------------------------

/**
 * Run Step 7: Complete.
 *
 * Displays the final setup summary including endpoint URLs, credentials,
 * and next steps. This step has no interactive prompts — it is purely
 * informational.
 *
 * @param state - Completed wizard state
 */
export async function runCompleteStep(
  state: WizardState,
  options?: { noOpen?: boolean },
): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.green('  Step 7/7') + chalk.bold(' — Complete!'),
  );
  console.log(
    chalk.dim('  Your home server has been brewed fresh.'),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Endpoint URLs
  // -------------------------------------------------------------------------
  const services = collectAllServices(state as any);
  const sorted = sortByDependency(services);
  const endpoints = generateEndpoints(state, sorted);

  if (endpoints.length > 0) {
    console.log(chalk.bold('  Endpoints'));
    console.log();

    const maxNameLen = Math.max(...endpoints.map((ep) => ep.service.length));

    for (const ep of endpoints) {
      const servicePadded = ep.service.padEnd(maxNameLen);
      console.log(
        `    ${chalk.cyan(servicePadded)}  ${ep.url}`,
      );
    }
    console.log();
  }

  // -------------------------------------------------------------------------
  // 3. Credentials summary
  // -------------------------------------------------------------------------
  const credTargets = getCredentialTargets(state as any);
  if (credTargets.length > 0) {
    console.log(chalk.bold('  Credentials'));
    console.log(
      chalk.dim(`    Admin username: `) + chalk.yellow(state.admin.username),
    );
    console.log(
      chalk.dim(`    Admin password: `) + chalk.yellow('(see .env file)'),
    );
    console.log(
      chalk.dim(`    Propagated to:  `) + credTargets.join(', '),
    );
    console.log();
  }

  // -------------------------------------------------------------------------
  // 4. External access verification (non-local domains)
  // -------------------------------------------------------------------------
  if (state.domain.provider === 'tunnel') {
    console.log(chalk.bold('  Cloudflare Tunnel'));
    console.log(chalk.dim(`    Tunnel:  ${state.domain.cloudflare.tunnelName}`));
    if (state.domain.cloudflare.tunnelId) {
      console.log(chalk.dim(`    ID:      ${state.domain.cloudflare.tunnelId}`));
    }
    if (state.domain.cloudflare.zoneName) {
      console.log(chalk.dim(`    Domain:  ${state.domain.cloudflare.zoneName}`));
    }
    console.log();
    if (!state.domain.cloudflare.tunnelId) {
      // Manual setup — hostnames not yet configured
      console.log(chalk.dim('  Add public hostnames to expose services externally:'));
      console.log(chalk.dim('    → one.dash.cloudflare.com → Networks → Connectors → Cloudflare Tunnels'));
      console.log(chalk.dim('    → Select your tunnel → Published applications → Add'));
      console.log();
      console.log(chalk.dim('  Or use Brewnet commands:'));
      console.log(`    ${chalk.cyan('brewnet domain tunnel status')}`);
      console.log(`    ${chalk.cyan('brewnet domain tunnel expose')}`);
      console.log();
    }
  }

  // -------------------------------------------------------------------------
  // 5. Next steps
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Next Steps'));
  console.log();
  console.log(`    ${chalk.dim('•')} View service status:  ${chalk.cyan('brewnet status')}`);
  console.log(`    ${chalk.dim('•')} View logs:            ${chalk.cyan('brewnet logs [service]')}`);
  console.log(`    ${chalk.dim('•')} Stop services:        ${chalk.cyan('brewnet down')}`);
  console.log(`    ${chalk.dim('•')} Restart services:     ${chalk.cyan('brewnet up')}`);
  console.log(`    ${chalk.dim('•')} Create backup:        ${chalk.cyan('brewnet backup')}`);
  console.log();

  // -------------------------------------------------------------------------
  // 6. Troubleshooting
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Troubleshooting'));
  console.log();
  console.log(`    ${chalk.dim('•')} Check Docker status:  ${chalk.cyan('docker ps')}`);
  console.log(`    ${chalk.dim('•')} View compose logs:    ${chalk.cyan('docker compose logs -f')}`);
  console.log(`    ${chalk.dim('•')} Project directory:    ${chalk.dim(state.projectPath)}`);
  console.log(`    ${chalk.dim('•')} Configuration:        ${chalk.dim(state.projectPath + '/.env')}`);
  console.log();

  console.log(chalk.green.bold('  Happy brewing! 🍺'));
  console.log();

  // -------------------------------------------------------------------------
  // 7. Generate and open status page
  // -------------------------------------------------------------------------
  try {
    const statusPath = await generateAndOpenStatusPage(state, { noOpen: options?.noOpen });
    console.log(chalk.dim(`  Status page: file://${statusPath}`));
    if (!options?.noOpen) {
      console.log(chalk.dim('  Opening status page in browser...'));
    }
    console.log();
  } catch {
    // Non-fatal — status page is optional
  }
}
