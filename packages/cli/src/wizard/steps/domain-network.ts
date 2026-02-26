/**
 * T085-T089 — Step 4: Network Access
 *
 * Simplified to: Local (LAN only) vs Cloudflare Tunnel (external access).
 * Cloudflare Tunnel can be configured via API (full automation) or manually
 * by pasting the connector token from the Cloudflare dashboard.
 *
 * API mode flow (10 steps):
 *   1. Show pre-filled token creation URL + attempt browser open
 *   2. Prompt for API token
 *   3. Verify token (spinner) → account email
 *   4. Auto-detect / select account
 *   5. Auto-detect / select zone (domain)
 *   6. Tunnel name input (default: projectName)
 *   7. Create tunnel (spinner)
 *   8. Configure ingress rules (spinner)
 *   9. Create DNS CNAME records (spinner, one per service)
 *  10. Clear API token from state + show summary
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
} from '../../services/cloudflare-client.js';
import { checkPort25Blocked } from '../../utils/network.js';

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
/**
 * Return true if the Mail Server option should be shown.
 * Mail Server requires a tunnel (non-local) domain.
 */
export function isMailServerAllowed(state: WizardState): boolean {
  return state.domain.provider !== 'local';
}

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
    case 'tunnel': {
      next.domain.ssl = 'cloudflare';
      next.domain.cloudflare.enabled = true;
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
    result.cloudflare.tunnelToken = '';
    result.cloudflare.tunnelName = '';
    result.cloudflare.tunnelId = '';
    result.cloudflare.accountId = '';
    result.cloudflare.apiToken = '';
    result.cloudflare.zoneId = '';
    result.cloudflare.zoneName = '';
  } else {
    result.cloudflare.enabled = true;
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

  // -------------------------------------------------------------------------
  // 1. Header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 4/7') + chalk.bold(' — Network Access'),
  );
  console.log(
    chalk.dim('  Configure how your server is accessed.'),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Local vs Cloudflare Tunnel
  // -------------------------------------------------------------------------
  const provider = await select<DomainProvider>({
    message: 'Network access',
    choices: [
      {
        name: 'Local — LAN only (no internet access needed)',
        value: 'local',
      },
      {
        name: 'Cloudflare Tunnel — secure external access, no port forwarding',
        value: 'tunnel',
      },
    ],
    default: next.domain.provider === 'tunnel' ? 'tunnel' : 'local',
  });

  console.log();

  if (provider === 'local') {
    // -----------------------------------------------------------------------
    // Local: nothing to configure
    // -----------------------------------------------------------------------
    next.domain.provider = 'local';
    next.domain.name = `${next.projectName}.local`;
    next.domain.ssl = 'self-signed';
    next.domain.cloudflare.enabled = false;
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

  } else {
    // -----------------------------------------------------------------------
    // Cloudflare Tunnel
    // -----------------------------------------------------------------------
    next.domain.provider = 'tunnel';
    next.domain.ssl = 'cloudflare';
    next.domain.cloudflare.enabled = true;

    // -----------------------------------------------------------------------
    // 3. Setup method: API or Manual
    // -----------------------------------------------------------------------
    const setupMethod = await select<'api' | 'manual'>({
      message: 'Tunnel setup method',
      choices: [
        {
          name: 'API — full automation (token → account → zone → tunnel → DNS)',
          value: 'api',
        },
        {
          name: 'Manual — paste the connector token from the Cloudflare dashboard',
          value: 'manual',
        },
      ],
      default: 'api',
    });

    console.log();

    if (setupMethod === 'api') {
      // =====================================================================
      // API SETUP — 10-step automation
      // =====================================================================

      // Step 1: Show pre-filled token creation URL + attempt browser open
      console.log(chalk.bold('  Cloudflare API Token — Setup Guide'));
      console.log();
      console.log(chalk.bold.white('  [1] Cloudflare 로그인'));
      console.log(chalk.dim('      https://dash.cloudflare.com → 로그인'));
      console.log();
      console.log(chalk.bold.white('  [2] 도메인을 Cloudflare에 추가 (처음 사용 시)'));
      console.log(chalk.dim('      Dashboard → Websites → Add a site → 도메인 입력'));
      console.log(chalk.dim('      → Cloudflare 네임서버로 변경 (도메인 등록업체에서 설정)'));
      console.log();
      console.log(chalk.bold.white('  [3] API Token 생성'));
      console.log(chalk.dim('      우측 상단 프로필 → My Profile → API Tokens → Create Token'));
      console.log(chalk.dim('      → "Edit Cloudflare Tunnel" 템플릿 선택'));
      console.log(chalk.dim('      → Zone Resources: 사용할 도메인 선택'));
      console.log(chalk.dim('      → Continue to summary → Create Token → 토큰 복사'));
      console.log();
      console.log(chalk.dim('  필요 권한: Cloudflare Tunnel:Edit  •  DNS:Edit'));
      console.log();

      const tokenUrl = buildTokenCreationUrl(next.projectName);
      console.log(chalk.dim('  사전 설정된 토큰 생성 URL (브라우저에서 열림):'));
      console.log(`  ${chalk.cyan(tokenUrl)}`);
      console.log();
      await tryOpenUrl(tokenUrl);
      console.log();

      // Step 2: Prompt for API token
      let apiToken = await input({
        message: 'Paste your Cloudflare API Token',
        default: '',
        validate: (v) => v.trim().length > 0 ? true : 'API Token is required',
      });
      apiToken = apiToken.trim();
      console.log();

      // Step 3: Verify token
      const verifySpinner = ora('Verifying API token...').start();
      let verifyResult: { valid: boolean; email?: string };
      try {
        verifyResult = await verifyToken(apiToken);
      } catch {
        verifyResult = { valid: false };
      }

      if (!verifyResult.valid) {
        verifySpinner.fail(chalk.red('Token verification failed'));
        console.log();
        console.log(chalk.yellow('  Falling back to manual token entry.'));
        console.log();

        const fallbackToken = await input({
          message: 'Cloudflare Tunnel token (paste from Cloudflare dashboard)',
          default: '',
          validate: (v) => v.trim().length > 0 ? true : 'Token is required',
        });
        next.domain.cloudflare.tunnelToken = fallbackToken.trim();
        next.domain.cloudflare.tunnelId = '';

        const fallbackName = await input({
          message: 'Tunnel name',
          default: next.domain.cloudflare.tunnelName || next.projectName,
        });
        next.domain.cloudflare.tunnelName = fallbackName.trim();
        console.log();

        // Skip to after tunnel setup
        await runMailServerSection(next);
        const withDefaults = applyDomainDefaults(next, provider);
        withDefaults.domain = buildDomainConfig(withDefaults.domain);
        printNetworkSummary(withDefaults);
        return withDefaults;
      }

      verifySpinner.succeed(
        chalk.green(`Token verified`) +
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
        console.log(chalk.yellow('  No accounts found. Please enter Account ID manually.'));
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
          message: 'Select Cloudflare account',
          choices: accounts.map((a) => ({ name: a.name, value: a.id })),
        });
        selectedAccountName = accounts.find((a) => a.id === selectedAccountId)?.name ?? selectedAccountId;
      }

      next.domain.cloudflare.accountId = selectedAccountId;
      console.log();

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
        console.log(chalk.yellow('  No active zones found in your Cloudflare account.'));
        console.log(chalk.dim('  Add a domain to Cloudflare first: https://dash.cloudflare.com'));
        console.log();
        console.log(chalk.yellow('  Falling back to manual setup.'));
        console.log();

        const fallbackToken = await input({
          message: 'Cloudflare Tunnel token (paste from Cloudflare dashboard)',
          default: '',
          validate: (v) => v.trim().length > 0 ? true : 'Token is required',
        });
        next.domain.cloudflare.tunnelToken = fallbackToken.trim();
        next.domain.cloudflare.tunnelId = '';

        const fallbackName = await input({
          message: 'Tunnel name',
          default: next.domain.cloudflare.tunnelName || next.projectName,
        });
        next.domain.cloudflare.tunnelName = fallbackName.trim();
        console.log();

        await runMailServerSection(next);
        const withDefaults = applyDomainDefaults(next, provider);
        withDefaults.domain = buildDomainConfig(withDefaults.domain);
        printNetworkSummary(withDefaults);
        return withDefaults;
      }

      let selectedZoneId: string;
      let selectedZoneName: string;

      if (activeZones.length === 1) {
        selectedZoneId = activeZones[0].id;
        selectedZoneName = activeZones[0].name;
        console.log(chalk.dim(`  Domain: ${selectedZoneName} (auto-selected)`));
      } else {
        selectedZoneId = await select<string>({
          message: 'Select domain (zone)',
          choices: activeZones.map((z) => ({ name: z.name, value: z.id })),
        });
        selectedZoneName = activeZones.find((z) => z.id === selectedZoneId)?.name ?? selectedZoneId;
      }

      next.domain.cloudflare.zoneId = selectedZoneId;
      next.domain.cloudflare.zoneName = selectedZoneName;
      next.domain.name = selectedZoneName;
      console.log();

      // Step 6: Tunnel name
      const tunnelName = await input({
        message: 'Tunnel name',
        default: next.domain.cloudflare.tunnelName || next.projectName,
      });
      next.domain.cloudflare.tunnelName = tunnelName.trim();
      console.log();

      // Step 7: Create tunnel
      const createSpinner = ora('Creating Cloudflare Tunnel...').start();
      try {
        const tunnelResult = await createTunnel(
          apiToken,
          selectedAccountId,
          next.domain.cloudflare.tunnelName,
        );
        next.domain.cloudflare.tunnelId = tunnelResult.tunnelId;
        next.domain.cloudflare.tunnelToken = tunnelResult.tunnelToken;
        createSpinner.succeed(chalk.green(`Tunnel created: ${next.domain.cloudflare.tunnelName}`));
        console.log(chalk.dim(`    ID: ${tunnelResult.tunnelId}`));
      } catch (err) {
        createSpinner.fail(chalk.red('Failed to create tunnel'));
        console.log(chalk.yellow(`  Error: ${err instanceof Error ? err.message : String(err)}`));
        console.log();
        console.log(chalk.dim('  Falling back to manual token entry.'));
        const fallbackToken = await input({
          message: 'Cloudflare Tunnel token (paste from dashboard)',
          default: '',
          validate: (v) => v.trim().length > 0 ? true : 'Token is required',
        });
        next.domain.cloudflare.tunnelToken = fallbackToken.trim();
        next.domain.cloudflare.tunnelId = '';
        console.log();

        // Clear sensitive token from state
        next.domain.cloudflare.apiToken = '';

        await runMailServerSection(next);
        const withDefaults = applyDomainDefaults(next, provider);
        withDefaults.domain = buildDomainConfig(withDefaults.domain);
        printNetworkSummary(withDefaults);
        return withDefaults;
      }
      console.log();

      // Step 8: Configure ingress rules
      const routes = getActiveServiceRoutes(next);
      if (routes.length > 0 && next.domain.cloudflare.tunnelId) {
        const ingressSpinner = ora('Configuring tunnel ingress rules...').start();
        try {
          await configureTunnelIngress(
            apiToken,
            selectedAccountId,
            next.domain.cloudflare.tunnelId,
            selectedZoneName,
            routes,
          );
          ingressSpinner.succeed(chalk.green(`Ingress configured (${routes.length} service${routes.length !== 1 ? 's' : ''})`));
        } catch (err) {
          ingressSpinner.warn(chalk.yellow(`Ingress config warning: ${err instanceof Error ? err.message : String(err)}`));
          console.log(chalk.dim('  You can configure ingress manually in the Cloudflare dashboard.'));
        }
        console.log();
      }

      // Step 9: Create DNS CNAME records
      if (routes.length > 0 && next.domain.cloudflare.tunnelId) {
        const dnsSpinner = ora('Creating DNS CNAME records...').start();
        const created: string[] = [];
        const failed: string[] = [];

        for (const route of routes) {
          try {
            await createDnsRecord(
              apiToken,
              selectedZoneId,
              next.domain.cloudflare.tunnelId,
              route.subdomain,
              selectedZoneName,
            );
            created.push(`${route.subdomain}.${selectedZoneName}`);
          } catch (err) {
            failed.push(`${route.subdomain} (${err instanceof Error ? err.message : String(err)})`);
          }
        }

        if (failed.length === 0) {
          dnsSpinner.succeed(chalk.green(`DNS records created (${created.length})`));
        } else {
          dnsSpinner.warn(chalk.yellow(`DNS records: ${created.length} created, ${failed.length} failed`));
        }

        for (const record of created) {
          console.log(chalk.dim(`    CNAME: ${record} → ${next.domain.cloudflare.tunnelId}.cfargotunnel.com`));
        }
        for (const record of failed) {
          console.log(chalk.yellow(`    Failed: ${record}`));
        }
        console.log();
      }

      // Step 10: Clear API token from state
      next.domain.cloudflare.apiToken = '';

    } else {
      // =====================================================================
      // MANUAL SETUP
      // =====================================================================
      console.log(chalk.bold('  Manual Tunnel Setup'));
      console.log(chalk.dim('  Create a tunnel in the Cloudflare dashboard and paste the token here.'));
      console.log();
      console.log(chalk.dim('  1. Go to https://one.dash.cloudflare.com'));
      console.log(chalk.dim('     → Networks → Connectors → Cloudflare Tunnels → Create a tunnel'));
      console.log(chalk.dim('     → Choose Cloudflared → name it → Save'));
      console.log(chalk.dim('  2. Copy the token from the install command shown on screen'));
      console.log(chalk.dim('     (the long string after "cloudflared service install ")'));
      console.log();
      console.log(chalk.dim('  After the wizard: add public hostnames in the tunnel dashboard'));
      console.log(chalk.dim('  → Tunnel → Published applications → Add → subdomain + service URL'));
      console.log();

      const tunnelToken = await input({
        message: 'Cloudflare Tunnel token',
        default: next.domain.cloudflare.tunnelToken || '',
        validate: (v) => v.trim().length > 0 ? true : 'Tunnel token is required',
      });
      next.domain.cloudflare.tunnelToken = tunnelToken.trim();
      next.domain.cloudflare.tunnelId = '';

      const tunnelName = await input({
        message: 'Tunnel name',
        default: next.domain.cloudflare.tunnelName || next.projectName,
      });
      next.domain.cloudflare.tunnelName = tunnelName.trim();

      console.log();
    }

    // -----------------------------------------------------------------------
    // Mail Server section (shown for any tunnel setup method)
    // -----------------------------------------------------------------------
    await runMailServerSection(next);
  }

  // -------------------------------------------------------------------------
  // Apply defaults + build config
  // -------------------------------------------------------------------------
  const withDefaults = applyDomainDefaults(next, provider);
  withDefaults.domain = buildDomainConfig(withDefaults.domain);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  printNetworkSummary(withDefaults);

  return withDefaults;
}

// ---------------------------------------------------------------------------
// Mail Server section helper
// ---------------------------------------------------------------------------

async function runMailServerSection(next: WizardState): Promise<void> {
  console.log(chalk.bold('  Mail Server'));

  const mailEnabled = await confirm({
    message: 'Enable Mail Server? (docker-mailserver)',
    default: false,
  });
  next.servers.mailServer.enabled = mailEnabled;

  if (!mailEnabled) {
    console.log();
    return;
  }

  console.log();
  const portSpinner = ora('Checking SMTP port 25...').start();
  let port25Blocked = false;

  try {
    port25Blocked = await checkPort25Blocked();
  } catch {
    port25Blocked = false;
  }

  next.servers.mailServer.port25Blocked = port25Blocked;

  if (port25Blocked) {
    portSpinner.warn('Port 25 blocked — SMTP relay required');
    console.log(chalk.dim('  Most ISPs block port 25 to prevent spam.'));
    console.log();

    const relayChoice = await select<'' | 'gmail' | 'sendgrid' | 'custom'>({
      message: 'SMTP relay provider',
      choices: [
        { name: 'Gmail SMTP (free, 500/day limit)', value: 'gmail' },
        { name: 'SendGrid (free tier, 100/day)', value: 'sendgrid' },
        { name: 'Custom SMTP relay', value: 'custom' },
        { name: 'Skip mail server', value: '' },
      ],
    });

    if (relayChoice === '') {
      next.servers.mailServer.enabled = false;
      console.log();
      return;
    }

    next.servers.mailServer.relayProvider = relayChoice;

    if (relayChoice === 'gmail') {
      next.servers.mailServer.relayHost = 'smtp.gmail.com';
      next.servers.mailServer.relayPort = 587;
      console.log();
      console.log(chalk.dim('  Gmail: use an App Password (not your main password).'));
      console.log(chalk.dim('  → Google Account → Security → 2-Step Verification → App passwords'));
    } else if (relayChoice === 'sendgrid') {
      next.servers.mailServer.relayHost = 'smtp.sendgrid.net';
      next.servers.mailServer.relayPort = 587;
    } else {
      // Custom
      const relayHost = await input({
        message: 'Relay SMTP host',
        default: next.servers.mailServer.relayHost || '',
        validate: (v) => v.trim().length > 0 ? true : 'Relay host is required',
      });
      next.servers.mailServer.relayHost = relayHost.trim();

      const relayPortStr = await input({
        message: 'Relay SMTP port',
        default: String(next.servers.mailServer.relayPort || 587),
        validate: (v) => /^\d+$/.test(v.trim()) ? true : 'Port must be a number',
      });
      next.servers.mailServer.relayPort = parseInt(relayPortStr.trim(), 10);
    }

    console.log();

    const relayUser = await input({
      message: relayChoice === 'gmail' ? 'Gmail address' : 'Relay username',
      default: next.servers.mailServer.relayUser || '',
      validate: (v) => v.trim().length > 0 ? true : 'Username is required',
    });
    next.servers.mailServer.relayUser = relayUser.trim();

    const relayPassword = await input({
      message: relayChoice === 'gmail' ? 'Gmail App Password' : 'Relay password',
      default: '',
      validate: (v) => v.trim().length > 0 ? true : 'Password is required',
    });
    next.servers.mailServer.relayPassword = relayPassword.trim();

  } else {
    portSpinner.succeed('Port 25 open — direct mail delivery available');
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
  } else {
    console.log(chalk.dim('    Access:  Cloudflare Tunnel (external)'));
    console.log(chalk.dim(`    Tunnel:  ${state.domain.cloudflare.tunnelName}`));
    if (state.domain.cloudflare.tunnelId) {
      console.log(chalk.dim(`    ID:      ${state.domain.cloudflare.tunnelId}`));
    }
    if (state.domain.cloudflare.zoneName) {
      console.log(chalk.dim(`    Domain:  ${state.domain.cloudflare.zoneName}`));
    }
    console.log(chalk.dim('    SSL:     managed by Cloudflare'));
    if (state.servers.mailServer.enabled) {
      const relayInfo = state.servers.mailServer.relayProvider
        ? ` (relay: ${state.servers.mailServer.relayProvider})`
        : '';
      console.log(chalk.dim(`    Mail:    docker-mailserver${relayInfo}`));
    }
  }
  console.log();
  console.log(chalk.green('  Network Access configured.'));
  console.log();
}
