/**
 * Step 4: Network Access — 3-Scenario Cloudflare Tunnel Setup
 *
 * Scenarios:
 *   1. Quick Tunnel    — no account, instant *.trycloudflare.com URL
 *   2. Named Tunnel    — CF account required; sub-path by domain ownership
 *      2a. Has domain  — full DNS setup (zone selection + ingress + CNAME)
 *      2b. No domain   — purchase guide + optional Quick Tunnel bridge + tunnel-only
 *   3. Local only      — no external access
 *
 * Pure functions:
 *   - applyDomainDefaults  — Apply provider-specific defaults to wizard state
 *   - buildDomainConfig    — Clean / normalize a DomainConfig object
 *
 * Interactive:
 *   - runDomainNetworkStep — Step 4 wizard UI
 *
 * @module wizard/steps/domain-network
 */

import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import type {
  WizardState,
  DomainConfig,
  DomainProvider,
} from '@brewnet/shared';
import {
  verifyToken,
  getAccounts,
  getZones,
  createTunnel,
  configureTunnelIngress,
  createDnsRecord,
  buildTokenCreationUrl,
  getActiveServiceRoutes,
  deleteTunnel,
  getTunnelHealth,
} from '../../services/cloudflare-client.js';
import { TunnelLogger } from '../../utils/tunnel-logger.js';
import { QuickTunnelManager } from '../../services/quick-tunnel.js';
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function tryOpenUrl(url: string): Promise<void> {
  try {
    if (process.platform === 'darwin') {
      await execa('open', [url]);
    } else {
      await execa('xdg-open', [url]);
    }
  } catch {
    // Non-fatal — URL already printed to console
  }
}

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Apply provider-specific defaults to the wizard state's domain configuration.
 */
export function applyDomainDefaults(
  state: WizardState,
  provider: DomainProvider,
): WizardState {
  const next = structuredClone(state);
  next.domain.provider = provider;

  switch (provider) {
    case 'local': {
      next.domain.ssl = 'self-signed';
      next.domain.cloudflare.enabled = false;
      next.domain.cloudflare.tunnelMode = 'none';
      next.domain.cloudflare.quickTunnelUrl = '';
      next.domain.cloudflare.tunnelToken = '';
      next.domain.cloudflare.tunnelName = '';
      next.domain.cloudflare.tunnelId = '';
      next.domain.cloudflare.accountId = '';
      next.domain.cloudflare.apiToken = '';
      next.domain.cloudflare.zoneId = '';
      next.domain.cloudflare.zoneName = '';
      next.domain.name = `${next.projectName}.local`;
      break;
    }
    case 'quick-tunnel': {
      next.domain.ssl = 'cloudflare';
      next.domain.cloudflare.enabled = true;
      next.domain.cloudflare.tunnelMode = 'quick';
      break;
    }
    case 'tunnel': {
      next.domain.ssl = 'cloudflare';
      next.domain.cloudflare.enabled = true;
      next.domain.cloudflare.tunnelMode = 'named';
      break;
    }
  }

  return next;
}

/**
 * Build a clean DomainConfig from raw selections.
 * Enforces provider-specific invariants. Always returns a new object.
 */
export function buildDomainConfig(config: DomainConfig): DomainConfig {
  const result: DomainConfig = {
    ...config,
    cloudflare: { ...config.cloudflare },
  };

  if (result.provider === 'local') {
    result.cloudflare.enabled = false;
    result.cloudflare.tunnelMode = 'none';
    result.cloudflare.quickTunnelUrl = '';
    result.cloudflare.tunnelToken = '';
    result.cloudflare.tunnelName = '';
    result.cloudflare.tunnelId = '';
    result.cloudflare.accountId = '';
    result.cloudflare.apiToken = '';
    result.cloudflare.zoneId = '';
    result.cloudflare.zoneName = '';
  } else {
    result.cloudflare.enabled = true;
    // Ensure apiToken is always cleared before returning
    result.cloudflare.apiToken = '';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Interactive Step Function
// ---------------------------------------------------------------------------

/**
 * Run Step 4: Network Access.
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with network configuration
 */
export async function runDomainNetworkStep(
  state: WizardState,
): Promise<WizardState> {
  const next = structuredClone(state);
  const tunnelLogger = new TunnelLogger();

  // -------------------------------------------------------------------------
  // 1. Header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 5/8') + chalk.bold(' — Network Access'),
  );
  console.log(
    chalk.dim('  Please select your external access method.'),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. 3-option scenario selector
  // -------------------------------------------------------------------------
  type ScenarioChoice = '1-quick' | '2-named' | '3-local';

  const scenario = await select<ScenarioChoice>({
    message: 'Select your external access method',
    choices: [
      {
        name: '1. Quick Tunnel (Instant setup, temporary URL — no domain required)',
        value: '1-quick' as const,
        description: 'Get started immediately without an account. Note: URL changes on server restart.',
      },
      {
        name: '2. Named Tunnel (Requires Cloudflare account, permanent URL)',
        value: '2-named' as const,
        description: 'Requires Cloudflare account + API token. Setup varies based on domain ownership.',
      },
      {
        name: '3. Local only (no external access)',
        value: '3-local' as const,
        description: 'Accessible only within local network. Uses brewnet.local domain.',
      },
    ],
  });

  console.log();

  // -------------------------------------------------------------------------
  // 3. Dispatch by scenario
  // -------------------------------------------------------------------------

  if (scenario === '3-local') {
    return runLocalScenario(next);
  }

  if (scenario === '1-quick') {
    return runQuickTunnelScenario(next, tunnelLogger);
  }

  // scenario === '2-named'
  return runUnifiedNamedTunnelScenario(next, tunnelLogger);
}

// ---------------------------------------------------------------------------
// Scenario 5: Local Only
// ---------------------------------------------------------------------------

function runLocalScenario(next: WizardState): WizardState {
  next.domain.provider = 'local';
  next.domain.name = `${next.projectName}.local`;
  next.domain.ssl = 'self-signed';
  next.domain.cloudflare.enabled = false;
  next.domain.cloudflare.tunnelMode = 'none';
  next.domain.cloudflare.quickTunnelUrl = '';
  next.domain.cloudflare.accountId = '';
  next.domain.cloudflare.apiToken = '';
  next.domain.cloudflare.tunnelId = '';
  next.domain.cloudflare.tunnelToken = '';
  next.domain.cloudflare.tunnelName = '';
  next.domain.cloudflare.zoneId = '';
  next.domain.cloudflare.zoneName = '';

  console.log(chalk.dim(`  Access: ${next.domain.name} (LAN only)`));
  console.log(chalk.dim('  External access: disabled'));
  console.log();
  console.log(chalk.green('  Network Access configured.'));
  console.log();

  return next;
}

// ---------------------------------------------------------------------------
// Scenario 1: Quick Tunnel
// ---------------------------------------------------------------------------

async function runQuickTunnelScenario(
  next: WizardState,
  _tunnelLogger: TunnelLogger,
): Promise<WizardState> {
  console.log(chalk.bold('  Quick Tunnel'));
  console.log(chalk.dim('  Creates a temporary URL instantly — no Cloudflare account needed.'));
  console.log();
  console.log(chalk.yellow('  ⚠️  The URL changes when the server restarts. If you need a permanent URL,'));
  console.log(chalk.yellow('     please run `brewnet domain connect` after installation.'));
  console.log();
  console.log(chalk.dim('  The Quick Tunnel URL will be issued automatically after services start.'));
  console.log();

  // State configuration only — actual container start happens in Step 6 (docker compose up)
  next.domain.provider = 'quick-tunnel';
  next.domain.ssl = 'cloudflare';
  next.domain.cloudflare.enabled = true;
  next.domain.cloudflare.tunnelMode = 'quick';
  next.domain.cloudflare.quickTunnelUrl = '';
  next.domain.cloudflare.accountId = '';
  next.domain.cloudflare.apiToken = '';
  next.domain.cloudflare.tunnelId = '';
  next.domain.cloudflare.tunnelToken = '';
  next.domain.cloudflare.tunnelName = '';
  next.domain.cloudflare.zoneId = '';
  next.domain.cloudflare.zoneName = '';

  printNetworkSummary(next);
  return next;
}

// ---------------------------------------------------------------------------
// Scenario 2: Named Tunnel with Existing Domain (core shared API flow)
// ---------------------------------------------------------------------------

/**
 * Shared Named Tunnel API flow used by Scenarios 2, 3, and 4.
 * Returns the updated state, or throws on unrecoverable error.
 *
 * @param includeDns - If false (Scenario 4), skips ingress config and DNS record creation.
 */
async function runNamedTunnelApiFlow(
  next: WizardState,
  tunnelLogger: TunnelLogger,
  includeDns: boolean,
): Promise<WizardState> {
  // Step 1: Show token creation guide
  console.log(chalk.bold('  Cloudflare API Token — Setup Guide'));
  console.log();
  console.log(chalk.bold.white('  [1] Log in to Cloudflare'));
  console.log(chalk.dim('      https://dash.cloudflare.com → Sign in'));
  console.log();
  if (includeDns) {
    console.log(chalk.bold.white('  [2] Add your domain to Cloudflare (first time only)'));
    console.log(chalk.dim('      Click "Domains" in the left sidebar'));
    console.log(chalk.dim('      → "Add a domain" button → Enter your domain → Continue'));
    console.log(chalk.dim('      → Select Free plan → Continue → Note the 2 nameservers'));
    console.log(chalk.dim('      → Update nameservers at your domain registrar → Save'));
    console.log(chalk.dim('      (Nameserver propagation may take up to 24 hours)'));
    console.log();
  }
  console.log(chalk.bold.white('  [3] Create API Token'));
  console.log(chalk.dim('      Top-right profile → My Profile → API Tokens → Create Token'));
  console.log(chalk.dim('      → "Edit Cloudflare Tunnel" template → Use template'));
  console.log(chalk.dim('      → Zone Resources: Select your domain → Continue → Create Token'));
  console.log();
  console.log(chalk.dim('  Required permissions: Cloudflare Tunnel:Edit  •  DNS:Edit  •  Zone:Read'));
  console.log();

  const tokenUrl = buildTokenCreationUrl(next.projectName);
  console.log(chalk.dim('  Pre-configured token creation URL (opens in browser):'));
  console.log(`  ${chalk.cyan(tokenUrl)}`);
  console.log();
  await tryOpenUrl(tokenUrl);

  // Step 2: Prompt for API token
  let apiToken = await input({
    message: 'Please paste your Cloudflare API Token',
    default: '',
    validate: (v) => v.trim().length > 0 ? true : 'API Token is required',
  });
  apiToken = apiToken.trim();
  console.log();

  // Step 3: Verify token (with retry)
  const verifySpinner = ora('Verifying API token...').start();
  let verifyResult: { valid: boolean; email?: string };
  try {
    verifyResult = await verifyToken(apiToken);
  } catch {
    verifyResult = { valid: false };
  }

  if (!verifyResult.valid) {
    verifySpinner.fail(chalk.red('Invalid API token. [BN004]'));
    console.log(chalk.dim('  Please verify your token in the Cloudflare dashboard.'));
    console.log();
    throw new Error('API token verification failed');
  }

  verifySpinner.succeed(
    chalk.green('Token verified') +
    (verifyResult.email ? chalk.dim(` (account: ${verifyResult.email})`) : ''),
  );
  console.log();

  // Step 4: Account auto-detection / selection
  const accountsSpinner = ora('Fetching Cloudflare accounts...').start();
  let accounts: Array<{ id: string; name: string }> = [];
  try {
    accounts = await getAccounts(apiToken);
  } catch {
    accounts = [];
  }
  accountsSpinner.stop();

  let selectedAccountId: string;
  let selectedAccountName: string;

  if (accounts.length === 0) {
    console.log(chalk.yellow('  No accounts found. Please enter your Account ID manually.'));
    const manualAccountId = await input({
      message: 'Cloudflare Account ID',
      default: next.domain.cloudflare.accountId || '',
      validate: (v) => v.trim().length > 0 ? true : 'Account ID is required',
    });
    selectedAccountId = manualAccountId.trim();
    selectedAccountName = selectedAccountId;
  } else if (accounts.length === 1) {
    selectedAccountId = accounts[0].id;
    selectedAccountName = accounts[0].name;
    console.log(chalk.dim(`  Account: ${selectedAccountName} (auto-selected)`));
  } else {
    selectedAccountId = await select<string>({
      message: 'Please select a Cloudflare account',
      choices: accounts.map((a) => ({ name: a.name, value: a.id })),
    });
    selectedAccountName = accounts.find((a) => a.id === selectedAccountId)?.name ?? selectedAccountId;
  }

  next.domain.cloudflare.accountId = selectedAccountId;
  console.log();

  let selectedZoneId = '';
  let selectedZoneName = '';

  if (includeDns) {
    // Step 5: Zone (domain) selection
    const zonesSpinner = ora('Fetching DNS zones...').start();
    let zones: Array<{ id: string; name: string; status: string }> = [];
    try {
      zones = await getZones(apiToken);
    } catch {
      zones = [];
    }
    zonesSpinner.stop();

    const activeZones = zones.filter((z) => z.status === 'active');

    if (activeZones.length === 0) {
      zonesSpinner.stop();
      console.log(chalk.yellow('  No active domains found. Please register a domain at domains.cloudflare.com.'));
      console.log();
      throw new Error('No active domains found in your Cloudflare account.');
    }

    if (activeZones.length === 1) {
      selectedZoneId = activeZones[0].id;
      selectedZoneName = activeZones[0].name;
      console.log(chalk.dim(`  Domain: ${selectedZoneName} (auto-selected)`));
    } else {
      selectedZoneId = await select<string>({
        message: 'Please select a domain (zone)',
        choices: activeZones.map((z) => ({ name: z.name, value: z.id })),
      });
      selectedZoneName = activeZones.find((z) => z.id === selectedZoneId)?.name ?? selectedZoneId;
    }

    next.domain.cloudflare.zoneId = selectedZoneId;
    next.domain.cloudflare.zoneName = selectedZoneName;
    next.domain.name = selectedZoneName;
    console.log();
  }

  // Step 6: Tunnel name
  const tunnelName = await input({
    message: 'Tunnel name',
    default: next.domain.cloudflare.tunnelName || next.projectName,
  });
  next.domain.cloudflare.tunnelName = tunnelName.trim();
  console.log();

  // Step 7: Create tunnel
  let createdTunnelId = '';
  const createSpinner = ora('Creating Cloudflare tunnel...').start();
  try {
    const tunnelResult = await createTunnel(
      apiToken,
      selectedAccountId,
      next.domain.cloudflare.tunnelName,
    );
    createdTunnelId = tunnelResult.tunnelId;
    next.domain.cloudflare.tunnelId = tunnelResult.tunnelId;
    next.domain.cloudflare.tunnelToken = tunnelResult.tunnelToken;
    createSpinner.succeed(chalk.green(`Tunnel created: ${next.domain.cloudflare.tunnelName}`));
    console.log(chalk.dim(`    ID: ${tunnelResult.tunnelId}`));

    tunnelLogger.log({
      event: 'CREATE',
      tunnelMode: 'named',
      tunnelId: tunnelResult.tunnelId,
      tunnelName: next.domain.cloudflare.tunnelName,
      domain: selectedZoneName || undefined,
      detail: 'Named tunnel created successfully',
    });
  } catch (err) {
    createSpinner.fail(chalk.red('Failed to create tunnel. [BN009]'));
    console.log(chalk.yellow(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    console.log();

    tunnelLogger.log({
      event: 'ROLLBACK',
      tunnelMode: 'named',
      detail: 'Rollback triggered: tunnel creation failed',
      error: err instanceof Error ? err.message : String(err),
    });

    throw new Error('Failed to create tunnel. Please try again later. [BN009]');
  }
  console.log();

  if (includeDns) {
    // Step 8: Configure ingress rules
    const routes = getActiveServiceRoutes(next);
    if (routes.length > 0) {
      const ingressSpinner = ora('Configuring tunnel ingress rules...').start();
      try {
        await configureTunnelIngress(
          apiToken,
          selectedAccountId,
          createdTunnelId,
          selectedZoneName,
          routes,
        );
        ingressSpinner.succeed(chalk.green(`Ingress configured (${routes.length} service(s))`));
      } catch (err) {
        ingressSpinner.fail(chalk.red('Ingress configuration failed'));
        console.log(chalk.yellow(`  Error: ${err instanceof Error ? err.message : String(err)}`));
        console.log();

        // Rollback: delete tunnel
        await rollbackTunnel(apiToken, selectedAccountId, createdTunnelId, tunnelLogger, 'ingress configuration failed');
        throw new Error('Configuration failed — tunnel rolled back. Please try again.');
      }
      console.log();

      // Step 9: Create DNS CNAME records
      const dnsSpinner = ora('Creating DNS CNAME records...').start();
      const created: string[] = [];
      const failed: string[] = [];

      for (const route of routes) {
        try {
          await createDnsRecord(
            apiToken,
            selectedZoneId,
            createdTunnelId,
            route.subdomain,
            selectedZoneName,
          );
          created.push(`${route.subdomain}.${selectedZoneName}`);
        } catch (err) {
          failed.push(`${route.subdomain} (${err instanceof Error ? err.message : String(err)})`);
        }
      }

      // If ALL DNS records failed, rollback
      if (created.length === 0 && failed.length > 0) {
        dnsSpinner.fail(chalk.red('DNS record creation failed'));
        for (const record of failed) {
          console.log(chalk.yellow(`    Failed: ${record}`));
        }
        console.log();

        await rollbackTunnel(apiToken, selectedAccountId, createdTunnelId, tunnelLogger, 'all DNS record creation failed');
        throw new Error('Configuration failed — tunnel rolled back. Please try again.');
      }

      if (failed.length === 0) {
        dnsSpinner.succeed(chalk.green(`DNS records created (${created.length})`));
      } else {
        dnsSpinner.warn(chalk.yellow(`DNS records: ${created.length} created, ${failed.length} failed`));
      }

      for (const record of created) {
        console.log(chalk.dim(`    CNAME: ${record} → ${createdTunnelId}.cfargotunnel.com`));
      }
      for (const record of failed) {
        console.log(chalk.yellow(`    Failed: ${record}`));
      }
      console.log();
    }

    // Step 10: Health verification — poll for 'healthy' status (30s timeout)
    const healthSpinner = ora('Verifying tunnel connection... (up to 30s)').start();
    try {
      await waitForTunnelHealthy(apiToken, selectedAccountId, createdTunnelId, 30_000);
      healthSpinner.succeed(chalk.green('Tunnel is connected (healthy)'));
    } catch {
      healthSpinner.warn(chalk.yellow('Tunnel health check failed (30s timeout)'));
      console.log(chalk.dim('  The tunnel may still be connecting in the background.'));
      console.log(chalk.dim('  Check status with `brewnet domain tunnel status`.'));
    }
    console.log();
  }

  // Step Final: Clear API token from state (security)
  next.domain.cloudflare.apiToken = '';

  return next;
}

// ---------------------------------------------------------------------------
// Scenario 2: Named Tunnel (unified — handles both domain-owned and domain-later paths)
// ---------------------------------------------------------------------------

async function runUnifiedNamedTunnelScenario(
  next: WizardState,
  tunnelLogger: TunnelLogger,
): Promise<WizardState> {
  next.domain.provider = 'tunnel';
  next.domain.ssl = 'cloudflare';
  next.domain.cloudflare.enabled = true;
  next.domain.cloudflare.tunnelMode = 'named';

  let qtManager: QuickTunnelManager | null = null;

  try {
    // Ask whether user already has a Cloudflare domain
    const hasDomain = await confirm({
      message: 'Do you already have a domain registered with Cloudflare?',
      default: true,
    });
    console.log();

    if (!hasDomain) {
      // Domain purchase guide (previously scenario 3)
      console.log(chalk.bold('  Domain Registration Guide'));
      console.log();
      console.log(chalk.bold.white('  How to register a domain with Cloudflare:'));
      console.log();
      console.log(chalk.dim('  1. https://domains.cloudflare.com → Sign in or create an account'));
      console.log(chalk.dim('  2. Search for a domain → Register (~$8-15/year for .com)'));
      console.log(chalk.dim('  3. Domain will be auto-configured with Cloudflare nameservers'));
      console.log(chalk.dim('  4. Registration takes 1-5 minutes'));
      console.log();

      // Offer Quick Tunnel bridge while waiting for domain setup
      const useBridge = await confirm({
        message: 'Start Quick Tunnel for temporary access? (access services while setting up your domain)',
        default: true,
      });
      console.log();

      if (useBridge) {
        const spinner = ora('Starting Quick Tunnel...').start();
        try {
          qtManager = new QuickTunnelManager(tunnelLogger);
          const url = await qtManager.start();
          spinner.succeed(chalk.green(`Temporary URL: ${url}`));
          console.log(chalk.dim('  Press Enter below to switch to Named Tunnel once your domain is ready.'));
          console.log();
        } catch (err) {
          spinner.fail(chalk.yellow(`Quick Tunnel failed: ${err instanceof Error ? err.message : String(err)}`));
          console.log();
          qtManager = null;
        }
      }

      // Block until user signals domain is ready
      await input({
        message: 'Press Enter when domain setup is complete',
        default: '',
      });
      console.log();

      // No domain yet — create tunnel only, skip DNS (previously scenario 4)
      next.domain.cloudflare.zoneId = '';
      next.domain.cloudflare.zoneName = '';
    }

    // includeDns=true when user has a domain (full setup), false otherwise (tunnel-only)
    const updated = await runNamedTunnelApiFlow(next, tunnelLogger, hasDomain);

    // Stop Quick Tunnel bridge if it was running
    if (qtManager) {
      const stopSpinner = ora('Stopping temporary Quick Tunnel...').start();
      try {
        await qtManager.stop();
        stopSpinner.succeed(chalk.green('Quick Tunnel stopped'));
      } catch {
        stopSpinner.warn('Failed to stop Quick Tunnel (please stop it manually)');
      }
      console.log();
    }

    if (!hasDomain) {
      console.log(chalk.dim('  Connect a domain: `brewnet domain connect`'));
      console.log();
    }

    printNetworkSummary(updated);
    return updated;
  } catch (err) {
    if (qtManager) {
      await qtManager.stop().catch((stopErr: unknown) => {
        console.warn('[Named Tunnel] Failed to stop Quick Tunnel:', stopErr instanceof Error ? stopErr.message : String(stopErr));
      });
    }
    console.log(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    console.log();
    console.log(chalk.yellow('  Falling back to Local mode.'));
    return runLocalScenario(next);
  }
}

// ---------------------------------------------------------------------------
// Tunnel health polling helper
// ---------------------------------------------------------------------------

async function waitForTunnelHealthy(
  apiToken: string,
  accountId: string,
  tunnelId: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  const pollIntervalMs = 2_000;

  while (Date.now() - start < timeoutMs) {
    try {
      const health = await getTunnelHealth(apiToken, accountId, tunnelId);
      if (health.status === 'healthy' && health.connectorCount > 0) {
        return;
      }
    } catch {
      // Ignore transient errors during polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Tunnel did not become healthy within ${timeoutMs / 1000}s`);
}

// ---------------------------------------------------------------------------
// Rollback helper
// ---------------------------------------------------------------------------

async function rollbackTunnel(
  apiToken: string,
  accountId: string,
  tunnelId: string,
  tunnelLogger: TunnelLogger,
  reason: string,
): Promise<void> {
  const rollbackSpinner = ora('Rolling back tunnel...').start();
  try {
    await deleteTunnel(apiToken, accountId, tunnelId);
    rollbackSpinner.succeed(chalk.yellow('Tunnel rollback complete'));

    tunnelLogger.log({
      event: 'ROLLBACK',
      tunnelMode: 'named',
      tunnelId,
      detail: `Rollback triggered: ${reason}`,
    });
  } catch (rollbackErr) {
    rollbackSpinner.fail(chalk.red('Rollback failed (manual deletion required in Cloudflare dashboard)'));
    console.log(chalk.yellow(`  Rollback error: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`));

    tunnelLogger.log({
      event: 'ROLLBACK',
      tunnelMode: 'named',
      tunnelId,
      detail: `Rollback failed: ${reason}`,
      error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
    });
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Summary helper
// ---------------------------------------------------------------------------

function printNetworkSummary(state: WizardState): void {
  console.log(chalk.bold('  Network Summary'));
  if (state.domain.provider === 'local') {
    console.log(chalk.dim('    Access:  LAN only'));
    console.log(chalk.dim(`    Host:    ${state.domain.name}`));
  } else if (state.domain.provider === 'quick-tunnel') {
    console.log(chalk.dim('    Access:  Quick Tunnel (temporary URL)'));
    console.log(chalk.dim(`    URL:     ${state.domain.cloudflare.quickTunnelUrl}`));
    console.log(chalk.yellow('    ⚠️  URL changes on server restart'));
    console.log(chalk.dim('    Permanent URL: `brewnet domain connect`'));
  } else {
    console.log(chalk.dim('    Access:  Named Tunnel (external access enabled)'));
    console.log(chalk.dim(`    Tunnel:  ${state.domain.cloudflare.tunnelName}`));
    if (state.domain.cloudflare.tunnelId) {
      console.log(chalk.dim(`    ID:      ${state.domain.cloudflare.tunnelId}`));
    }
    if (state.domain.cloudflare.zoneName) {
      console.log(chalk.dim(`    Domain:  ${state.domain.cloudflare.zoneName}`));
    } else {
      console.log(chalk.dim('    Domain:  Not set (connect with `brewnet domain connect`)'));
    }
    console.log(chalk.dim('    SSL:     Managed by Cloudflare'));
  }
  console.log();
  console.log(chalk.green('  Network Access configured.'));
  console.log();
}
