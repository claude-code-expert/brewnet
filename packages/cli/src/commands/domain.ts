/**
 * brewnet domain — Cloudflare Tunnel management commands.
 *
 * Subcommands:
 *   brewnet domain connect         — Attach a domain to an existing tunnel (or migrate Quick→Named)
 *   brewnet domain tunnel status   — Query tunnel health and service accessibility
 *   brewnet domain tunnel restart  — Restart the cloudflared container
 *
 * @module commands/domain
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { input, select } from '@inquirer/prompts';
import Dockerode from 'dockerode';
import type { WizardState } from '@brewnet/shared';
import {
  verifyToken,
  getAccounts,
  getZones,
  createTunnel,
  configureTunnelIngress,
  createDnsRecord,
  getTunnelHealth,
  deleteTunnel,
  getActiveServiceRoutes,
} from '../services/cloudflare-client.js';
import { TunnelLogger } from '../utils/tunnel-logger.js';
import { QuickTunnelManager } from '../services/quick-tunnel.js';
import { loadState, saveState, getLastProject } from '../wizard/state.js';
import { DomainManager } from '../services/domain-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loads the wizard state for the most recently initialized brewnet project. */
function loadCurrentState(): WizardState | null {
  const lastProject = getLastProject();
  if (!lastProject) return null;
  return loadState(lastProject);
}

// ---------------------------------------------------------------------------
// Register command
// ---------------------------------------------------------------------------

/**
 * Registers all `brewnet domain` subcommands on the given Commander program.
 *
 * Subcommands added:
 *   - `domain connect`        — Attach a domain / migrate Quick→Named Tunnel
 *   - `domain tunnel status`  — Query tunnel health and service reachability
 *   - `domain tunnel restart` — Restart the cloudflared container
 */
export function registerDomainCommand(program: Command): void {
  const domain = program
    .command('domain')
    .description('Cloudflare Tunnel domain management');

  // ── domain connect ──────────────────────────────────────────────────────

  domain
    .command('connect')
    .argument('[app]', 'Name of the local app/service to connect (required when using --domain)')
    .option('--domain <hostname>', 'Target external hostname (e.g., my-api.yourdomain.com)')
    .option('--force', 'Overwrite existing CNAME record if conflict detected')
    .description('도메인을 기존 터널에 연결합니다 (Quick Tunnel → Named Tunnel 마이그레이션 또는 개별 앱 외부 도메인 연결)')
    .helpOption('-h, --help', 'Show help information')
    .addHelpText('after', `
Examples:
  $ brewnet domain connect                                    Migrate Quick Tunnel → Named Tunnel
  $ brewnet domain connect my-api --domain my-api.example.com Connect a specific app to an external domain
  $ brewnet domain connect my-api --domain my-api.example.com --force  Overwrite existing CNAME

Prerequisites:
  - A Cloudflare API Token with Zone:Read, DNS:Edit, Tunnel:Edit permissions
  - An existing brewnet installation (run \`brewnet init\` first)

What this command does:
  With --domain (NEW):
    Connects a specific local app to an external domain via Cloudflare Tunnel.
    Creates DNS CNAME, configures ingress, and adds Traefik routing labels.

  Without --domain (legacy):
    Path A (Quick Tunnel → Named Tunnel):
      Creates a new Named Tunnel, configures ingress rules, creates DNS CNAME records,
      stops the old Quick Tunnel container, and updates the project state.

    Path B (Named Tunnel, no DNS yet):
      Reuses the existing tunnel, selects a Cloudflare zone, configures ingress,
      and creates DNS CNAME records for all active services.
`)
    .action(async (app: string | undefined, opts: { domain?: string; force?: boolean }) => {
      // NEW: If --domain is provided, use DomainManager for external domain connection
      if (opts.domain) {
        if (!app) {
          console.error(chalk.red('  앱 이름이 필요합니다. 예: brewnet domain connect my-api --domain my-api.example.com'));
          process.exit(1);
        }
        await handleDomainConnect(app, opts.domain, opts.force ?? false);
        return;
      }

      // LEGACY: Original Quick→Named migration flow (no --domain option)
      const tunnelLogger = new TunnelLogger();

      const state = loadCurrentState();
      if (!state) {
        console.error(chalk.red('  설치된 brewnet 프로젝트를 찾을 수 없습니다.'));
        console.error(chalk.dim('  먼저 `brewnet init`을 실행하세요.'));
        process.exit(1);
      }

      const { tunnelMode } = state.domain.cloudflare;

      if (tunnelMode === 'none') {
        console.error(chalk.red('  이 프로젝트는 터널 없이 시작되었습니다.'));
        console.error(chalk.dim('  `brewnet init`을 다시 실행하세요.'));
        process.exit(1);
      }

      console.log();
      console.log(chalk.bold.cyan('  brewnet domain connect'));
      console.log(chalk.dim(`  현재 모드: ${tunnelMode}`));
      console.log();

      // Prompt for CF API token
      let apiToken = await input({
        message: 'Cloudflare API Token을 입력하세요',
        default: '',
        validate: (v) => v.trim().length > 0 ? true : 'API Token이 필요합니다',
      });
      apiToken = apiToken.trim();

      // Verify token
      const verifySpinner = ora('API 토큰 검증 중...').start();
      try {
        const result = await verifyToken(apiToken);
        if (!result.valid) {
          verifySpinner.fail(chalk.red('유효하지 않은 API 토큰입니다. [BN004]'));
          process.exit(2);
        }
        verifySpinner.succeed(
          chalk.green('토큰 검증 완료') +
          (result.email ? chalk.dim(` (${result.email})`) : ''),
        );
      } catch {
        verifySpinner.fail(chalk.red('토큰 검증 실패'));
        process.exit(2);
      }
      console.log();

      // Auto-detect account
      const accountsSpinner = ora('Cloudflare 계정 조회 중...').start();
      const accounts = await getAccounts(apiToken).catch(() => []);
      accountsSpinner.stop();

      let selectedAccountId: string;
      if (accounts.length === 0) {
        const manual = await input({
          message: 'Cloudflare Account ID를 입력하세요',
          validate: (v) => v.trim().length > 0 ? true : 'Account ID가 필요합니다',
        });
        selectedAccountId = manual.trim();
      } else if (accounts.length === 1) {
        selectedAccountId = accounts[0].id;
        console.log(chalk.dim(`  계정: ${accounts[0].name} (자동 선택)`));
      } else {
        selectedAccountId = await select<string>({
          message: '계정을 선택하세요',
          choices: accounts.map((a) => ({ name: a.name, value: a.id })),
        });
      }
      console.log();

      // Prompt for zone (domain)
      const zonesSpinner = ora('DNS 존 조회 중...').start();
      const zones = await getZones(apiToken).catch(() => []);
      zonesSpinner.stop();

      const activeZones = zones.filter((z) => z.status === 'active');
      if (activeZones.length === 0) {
        console.error(chalk.red('  활성 도메인이 없습니다. domains.cloudflare.com에서 도메인을 등록해주세요.'));
        process.exit(4);
      }

      let selectedZoneId: string;
      let selectedZoneName: string;

      if (activeZones.length === 1) {
        selectedZoneId = activeZones[0].id;
        selectedZoneName = activeZones[0].name;
        console.log(chalk.dim(`  도메인: ${selectedZoneName} (자동 선택)`));
      } else {
        selectedZoneId = await select<string>({
          message: '도메인(존)을 선택하세요',
          choices: activeZones.map((z) => ({ name: z.name, value: z.id })),
        });
        selectedZoneName = activeZones.find((z) => z.id === selectedZoneId)?.name ?? selectedZoneId;
      }
      console.log();

      let updatedState = structuredClone(state);

      if (tunnelMode === 'quick') {
        // Path A: Quick Tunnel → Named Tunnel migration
        updatedState = await domainConnectPathA(
          updatedState, apiToken, selectedAccountId, selectedZoneId, selectedZoneName, tunnelLogger,
        );
      } else if (tunnelMode === 'named' && !state.domain.cloudflare.zoneId) {
        // Path B: Named Tunnel without DNS — attach domain
        updatedState = await domainConnectPathB(
          updatedState, apiToken, selectedAccountId, selectedZoneId, selectedZoneName, tunnelLogger,
        );
      } else {
        // Path C: Named Tunnel with existing domain — re-sync
        updatedState = await domainConnectPathC(
          updatedState, apiToken, selectedAccountId, selectedZoneId, selectedZoneName, tunnelLogger,
        );
      }

      // Clear API token from state (security)
      updatedState.domain.cloudflare.apiToken = '';

      // Log DOMAIN_CONNECT event
      tunnelLogger.log({
        event: 'DOMAIN_CONNECT',
        tunnelMode: 'named',
        tunnelId: updatedState.domain.cloudflare.tunnelId || undefined,
        tunnelName: updatedState.domain.cloudflare.tunnelName || undefined,
        domain: selectedZoneName,
        detail: 'Domain connected successfully',
      });

      // Persist state
      saveState(updatedState);

      // Display service URLs
      const routes = getActiveServiceRoutes(updatedState);
      console.log(chalk.bold.green('  도메인 연결 완료!'));
      console.log();
      if (routes.length > 0) {
        console.log(chalk.bold('  서비스 주소:'));
        for (const route of routes) {
          console.log(chalk.dim(`    https://${route.subdomain}.${selectedZoneName}`));
        }
        console.log();
      }
    });

  // ── domain disconnect ─────────────────────────────────────────────────

  domain
    .command('disconnect')
    .argument('<app>', 'Name of the app to disconnect')
    .description('앱의 외부 도메인 연결을 해제합니다')
    .helpOption('-h, --help', 'Show help information')
    .addHelpText('after', `
Examples:
  $ brewnet domain disconnect my-api    Remove external domain access for my-api

What this command does:
  Removes the tunnel ingress rule, deletes the DNS CNAME record,
  removes Traefik external labels, and updates the project state.
  The local service continues running.
`)
    .action(async (app: string) => {
      await handleDomainDisconnect(app);
    });

  // ── domain status ────────────────────────────────────────────────────

  domain
    .command('status')
    .argument('[app]', 'Optional app name (shows all if omitted)')
    .description('도메인 연결 상태를 조회합니다')
    .helpOption('-h, --help', 'Show help information')
    .action(async (app: string | undefined) => {
      await handleDomainStatus(app);
    });

  // ── domain list ──────────────────────────────────────────────────────

  domain
    .command('list')
    .description('모든 외부 도메인 연결을 나열합니다')
    .helpOption('-h, --help', 'Show help information')
    .action(async () => {
      await handleDomainList();
    });

  // ── domain tunnel ───────────────────────────────────────────────────────

  const tunnel = domain
    .command('tunnel')
    .description('터널 관리');

  // domain tunnel status
  tunnel
    .command('status')
    .description('터널 상태 조회 — 연결 수 및 서비스 접근 가능 여부 확인')
    .helpOption('-h, --help', 'Show help information')
    .addHelpText('after', `
Examples:
  $ brewnet domain tunnel status   Show tunnel health and per-service accessibility

Output includes:
  - Tunnel mode (quick / named)
  - Tunnel URL or domain
  - Number of active connections
  - Per-service HTTP reachability check (git, files, etc.)

Prerequisites:
  - An existing brewnet installation with a tunnel configured
`)
    .action(async () => {
      const state = loadCurrentState();
      if (!state) {
        console.error(chalk.red('  설치된 brewnet 프로젝트를 찾을 수 없습니다.'));
        process.exit(1);
      }

      const { tunnelMode, quickTunnelUrl, tunnelId, tunnelName, accountId, tunnelToken } = state.domain.cloudflare;

      if (tunnelMode === 'none') {
        console.log(chalk.dim('  터널이 설정되지 않았습니다.'));
        process.exit(1);
      }

      console.log();
      console.log(chalk.bold('  🚇 Tunnel Status'));
      console.log(chalk.dim('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log();

      if (tunnelMode === 'quick') {
        const url = quickTunnelUrl || '(URL 없음 — 컨테이너 재시작 필요)';
        console.log(chalk.dim(`  모드:   Quick Tunnel (임시, 재시작 시 URL 변경)`));
        console.log(chalk.dim(`  URL:    ${url}`));
        console.log();
        if (url !== '(URL 없음 — 컨테이너 재시작 필요)') {
          console.log(chalk.dim('  서비스:'));
          console.log(chalk.dim(`    FileBrowser  ${url}/files`));
          console.log(chalk.dim(`    Gitea        ${url}/git`));
          console.log(chalk.dim(`    Uptime Kuma  ${url}/status`));
        }
        console.log();
        console.log(chalk.yellow(`  ⚠️  영구 URL을 원하면 \`brewnet domain connect\`를 실행하세요.`));
        console.log();
        return;
      }

      // Named Tunnel — query CF API
      if (!tunnelId || !accountId) {
        console.error(chalk.red('  터널 정보가 없습니다. `brewnet domain connect`를 실행하세요.'));
        process.exit(2);
      }

      // Use tunnelToken as a proxy for API token (this is a limitation — named tunnels need apiToken for health check)
      // If we don't have apiToken persisted, we can still check the container status
      const spinner = ora('터널 상태 조회 중...').start();
      try {
        // Try to get health from CF API if we have a persisted token; otherwise show container status only
        const apiTokenForHealth = state.domain.cloudflare.apiToken;
        if (apiTokenForHealth) {
          const health = await getTunnelHealth(apiTokenForHealth, accountId, tunnelId);
          spinner.stop();
          console.log(chalk.dim(`  터널:   ${tunnelName || tunnelId}`));
          console.log(chalk.dim(`  ID:     ${tunnelId}`));
          const statusIcon = health.status === 'healthy' ? chalk.green('✅ healthy') : chalk.yellow(`⚠️  ${health.status}`);
          console.log(`  상태:   ${statusIcon} (커넥터 ${health.connectorCount}개)`);
          if (state.domain.cloudflare.zoneName) {
            console.log(chalk.dim(`  도메인: ${state.domain.cloudflare.zoneName}`));
          }
          console.log(chalk.dim(`  확인:   ${new Date().toISOString()}`));
        } else {
          spinner.stop();
          console.log(chalk.dim(`  터널:   ${tunnelName || tunnelId}`));
          console.log(chalk.dim(`  ID:     ${tunnelId}`));
          console.log(chalk.yellow('  상태:   (API 토큰 없음 — 컨테이너 상태만 확인 가능)'));
          if (state.domain.cloudflare.zoneName) {
            console.log(chalk.dim(`  도메인: ${state.domain.cloudflare.zoneName}`));
          }
        }

        // Show service URLs from routes
        const routes = getActiveServiceRoutes(state);
        if (routes.length > 0 && state.domain.cloudflare.zoneName) {
          console.log();
          console.log(chalk.dim('  서비스:'));
          for (const route of routes) {
            console.log(chalk.dim(`    ${route.subdomain.padEnd(12)} https://${route.subdomain}.${state.domain.cloudflare.zoneName}`));
          }
        }
        console.log();
      } catch (err) {
        spinner.fail(chalk.red('터널 상태 조회 실패'));
        console.error(chalk.dim(`  오류: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(2);
      }

      void tunnelToken; // used in container operations
    });

  // domain tunnel restart
  tunnel
    .command('restart')
    .description('cloudflared 컨테이너를 재시작하고 터널 재연결을 확인합니다')
    .helpOption('-h, --help', 'Show help information')
    .addHelpText('after', `
Examples:
  $ brewnet domain tunnel restart   Restart the cloudflared container and verify reconnection

When to use:
  - After updating tunnel configuration
  - When the tunnel shows as disconnected in \`brewnet domain tunnel status\`
  - After changing DNS records or ingress rules

What this command does:
  Stops and removes the existing cloudflared container, recreates it with the
  stored tunnel token, waits for the tunnel to reconnect, then reports the result.
`)
    .action(async () => {
      const tunnelLogger = new TunnelLogger();
      const state = loadCurrentState();
      if (!state) {
        console.error(chalk.red('  설치된 brewnet 프로젝트를 찾을 수 없습니다.'));
        process.exit(1);
      }

      const { tunnelMode, tunnelId, accountId } = state.domain.cloudflare;

      if (tunnelMode === 'none') {
        console.log(chalk.dim('  터널이 설정되지 않았습니다.'));
        process.exit(1);
      }

      console.log();
      console.log(chalk.bold('  🔄 Cloudflare 터널을 재시작합니다...'));
      console.log();

      const docker = new Dockerode();
      const containerName = 'brewnet-cloudflared';

      // Stop container
      const stopSpinner = ora(`  ${containerName} 컨테이너 중지 중...`).start();
      try {
        const container = docker.getContainer(containerName);
        await container.stop({ t: 10 });
        stopSpinner.succeed(chalk.green('  중지 완료'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not running')) {
          stopSpinner.succeed(chalk.dim('  (이미 중지됨)'));
        } else {
          stopSpinner.fail(chalk.red('  컨테이너 중지 실패'));
          console.error(chalk.dim(`  오류: ${msg}`));
          process.exit(2);
        }
      }

      // Start container
      const startSpinner = ora(`  ${containerName} 컨테이너 시작 중...`).start();
      try {
        const container = docker.getContainer(containerName);
        await container.start();
        startSpinner.succeed(chalk.green('  시작 완료'));
      } catch (err) {
        startSpinner.fail(chalk.red('  컨테이너 시작 실패'));
        console.error(chalk.dim(`  오류: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(2);
      }

      // For Quick Tunnel, re-parse container logs for new URL
      if (tunnelMode === 'quick') {
        const urlSpinner = ora('  새 Quick Tunnel URL 캡처 중...').start();
        try {
          const qtManager = new QuickTunnelManager(tunnelLogger);
          const container = docker.getContainer('brewnet-tunnel-quick');
          const newUrl = await captureQuickTunnelUrl(container);

          const updatedState = structuredClone(state);
          updatedState.domain.cloudflare.quickTunnelUrl = newUrl;
          updatedState.domain.name = new URL(newUrl).hostname;
          saveState(updatedState);

          urlSpinner.succeed(chalk.green(`  새 URL: ${newUrl}`));
          void qtManager; // keep reference
        } catch {
          urlSpinner.warn('  URL 캡처 실패 — 컨테이너 로그를 직접 확인하세요');
        }
      } else if (tunnelMode === 'named' && tunnelId && accountId && state.domain.cloudflare.apiToken) {
        // Poll CF API for healthy status
        const healthSpinner = ora('  터널 연결 확인 중... (최대 30초)').start();
        try {
          await waitForHealthy(state.domain.cloudflare.apiToken, accountId, tunnelId, 30_000);
          healthSpinner.succeed(chalk.green('  터널이 정상 연결되었습니다 (healthy)'));
        } catch {
          healthSpinner.warn('  터널 상태 확인 실패 (30초 초과)');
        }
      } else {
        // Just wait a few seconds for container to initialize
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        console.log(chalk.green('  터널 재시작 완료'));
      }

      tunnelLogger.log({
        event: 'RESTART',
        tunnelMode: tunnelMode as 'quick' | 'named',
        tunnelId: tunnelId || undefined,
        tunnelName: state.domain.cloudflare.tunnelName || undefined,
        detail: `Tunnel container restarted: ${containerName}`,
      });

      console.log();

      // Display current service URLs
      const routes = getActiveServiceRoutes(state);
      if (routes.length > 0) {
        const baseUrl = tunnelMode === 'quick'
          ? state.domain.cloudflare.quickTunnelUrl
          : state.domain.cloudflare.zoneName
            ? `https://*.${state.domain.cloudflare.zoneName}`
            : '';

        if (baseUrl) {
          console.log(chalk.bold('  서비스 주소:'));
          if (tunnelMode === 'quick') {
            for (const route of routes) {
              const path = getQuickTunnelPath(route.subdomain);
              if (path) console.log(chalk.dim(`    ${baseUrl}${path}`));
            }
          } else {
            for (const route of routes) {
              console.log(chalk.dim(`    https://${route.subdomain}.${state.domain.cloudflare.zoneName}`));
            }
          }
          console.log();
        }
      }
    });
}

// ---------------------------------------------------------------------------
// domain connect Path A — Quick Tunnel → Named Tunnel migration
// ---------------------------------------------------------------------------

async function domainConnectPathA(
  state: WizardState,
  apiToken: string,
  accountId: string,
  zoneId: string,
  zoneName: string,
  tunnelLogger: TunnelLogger,
): Promise<WizardState> {
  const updated = structuredClone(state);

  console.log(chalk.bold('  Path A: Quick Tunnel → Named Tunnel 마이그레이션'));
  console.log();

  // Create new Named Tunnel
  const tunnelName = updated.domain.cloudflare.tunnelName || updated.projectName;
  const createSpinner = ora('Named Tunnel 생성 중...').start();
  let createdTunnelId = '';

  try {
    const result = await createTunnel(apiToken, accountId, tunnelName);
    createdTunnelId = result.tunnelId;
    updated.domain.cloudflare.tunnelId = result.tunnelId;
    updated.domain.cloudflare.tunnelToken = result.tunnelToken;
    updated.domain.cloudflare.tunnelName = tunnelName;
    updated.domain.cloudflare.accountId = accountId;
    createSpinner.succeed(chalk.green(`터널 생성됨: ${tunnelName}`));

    tunnelLogger.log({
      event: 'CREATE',
      tunnelMode: 'named',
      tunnelId: result.tunnelId,
      tunnelName,
      domain: zoneName,
      detail: 'Named tunnel created via domain connect (migrating from Quick Tunnel)',
    });
  } catch (err) {
    createSpinner.fail(chalk.red('터널 생성 실패'));
    throw err;
  }
  console.log();

  // Configure ingress
  const routes = getActiveServiceRoutes(updated);
  if (routes.length > 0) {
    const ingressSpinner = ora('인그레스 설정 중...').start();
    try {
      await configureTunnelIngress(apiToken, accountId, createdTunnelId, zoneName, routes);
      ingressSpinner.succeed(chalk.green(`인그레스 설정 완료 (${routes.length}개 서비스)`));
    } catch (err) {
      ingressSpinner.fail(chalk.red('인그레스 설정 실패'));
      await deleteTunnel(apiToken, accountId, createdTunnelId).catch(() => {/* best-effort */});
      throw err;
    }

    // Create DNS records
    const dnsSpinner = ora('DNS 레코드 생성 중...').start();
    const created: string[] = [];
    for (const route of routes) {
      try {
        await createDnsRecord(apiToken, zoneId, createdTunnelId, route.subdomain, zoneName);
        created.push(route.subdomain);
      } catch {
        // Non-fatal — best-effort
      }
    }
    dnsSpinner.succeed(chalk.green(`DNS 레코드 생성 완료 (${created.length}/${routes.length}개)`));
    console.log();
  }

  // Stop Quick Tunnel container
  const stopSpinner = ora('Quick Tunnel 중지 중...').start();
  try {
    const qtManager = new QuickTunnelManager(tunnelLogger);
    await qtManager.stop();
    stopSpinner.succeed(chalk.green('Quick Tunnel 중지 완료'));
  } catch {
    stopSpinner.warn('Quick Tunnel 중지 실패 (수동으로 중지하세요: docker stop brewnet-tunnel-quick)');
  }
  console.log();

  // Update state
  updated.domain.provider = 'tunnel';
  updated.domain.cloudflare.tunnelMode = 'named';
  updated.domain.cloudflare.zoneId = zoneId;
  updated.domain.cloudflare.zoneName = zoneName;
  updated.domain.name = zoneName;
  updated.domain.cloudflare.quickTunnelUrl = '';

  return updated;
}

// ---------------------------------------------------------------------------
// domain connect Path B — Named Tunnel (no DNS) → attach domain
// ---------------------------------------------------------------------------

async function domainConnectPathB(
  state: WizardState,
  apiToken: string,
  accountId: string,
  zoneId: string,
  zoneName: string,
  _tunnelLogger: TunnelLogger,
): Promise<WizardState> {
  const updated = structuredClone(state);

  console.log(chalk.bold('  Path B: 기존 터널에 도메인 연결'));
  console.log();

  const tunnelId = updated.domain.cloudflare.tunnelId;
  if (!tunnelId) {
    throw new Error('터널 ID가 없습니다. `brewnet init`을 다시 실행하세요.');
  }

  const routes = getActiveServiceRoutes(updated);

  // Configure ingress
  if (routes.length > 0) {
    const ingressSpinner = ora('인그레스 규칙 설정 중...').start();
    try {
      await configureTunnelIngress(apiToken, accountId, tunnelId, zoneName, routes);
      ingressSpinner.succeed(chalk.green(`인그레스 설정 완료 (${routes.length}개 서비스)`));
    } catch (err) {
      ingressSpinner.fail(chalk.red('인그레스 설정 실패'));
      throw err;
    }
    console.log();

    // Create DNS records (upsert)
    const dnsSpinner = ora('DNS CNAME 레코드 생성 중...').start();
    const created: string[] = [];
    for (const route of routes) {
      try {
        await createDnsRecord(apiToken, zoneId, tunnelId, route.subdomain, zoneName);
        created.push(route.subdomain);
      } catch {
        // Non-fatal — record may already exist
      }
    }
    dnsSpinner.succeed(chalk.green(`DNS 레코드 완료 (${created.length}/${routes.length}개)`));
    console.log();
  }

  updated.domain.cloudflare.zoneId = zoneId;
  updated.domain.cloudflare.zoneName = zoneName;
  updated.domain.name = zoneName;

  return updated;
}

// ---------------------------------------------------------------------------
// domain connect Path C — Named Tunnel with existing domain — re-sync
// ---------------------------------------------------------------------------

async function domainConnectPathC(
  state: WizardState,
  apiToken: string,
  accountId: string,
  zoneId: string,
  zoneName: string,
  _tunnelLogger: TunnelLogger,
): Promise<WizardState> {
  const updated = structuredClone(state);

  console.log(chalk.bold('  Path C: 인그레스 + DNS 재동기화'));
  console.log();

  const tunnelId = updated.domain.cloudflare.tunnelId;
  if (!tunnelId) {
    throw new Error('터널 ID가 없습니다. `brewnet init`을 다시 실행하세요.');
  }

  const routes = getActiveServiceRoutes(updated);

  // Re-configure ingress (upsert)
  if (routes.length > 0) {
    const ingressSpinner = ora('인그레스 재동기화 중...').start();
    try {
      await configureTunnelIngress(apiToken, accountId, tunnelId, zoneName, routes);
      ingressSpinner.succeed(chalk.green('인그레스 재동기화 완료'));
    } catch (err) {
      ingressSpinner.warn(chalk.yellow(`인그레스 재동기화 실패: ${err instanceof Error ? err.message : String(err)}`));
    }
    console.log();

    // Upsert DNS records
    const dnsSpinner = ora('DNS 레코드 재동기화 중...').start();
    let count = 0;
    for (const route of routes) {
      try {
        await createDnsRecord(apiToken, zoneId, tunnelId, route.subdomain, zoneName);
        count++;
      } catch {
        // Non-fatal — upsert pattern
      }
    }
    dnsSpinner.succeed(chalk.green(`DNS 재동기화 완료 (${count}/${routes.length}개)`));
    console.log();
  }

  updated.domain.cloudflare.zoneId = zoneId;
  updated.domain.cloudflare.zoneName = zoneName;
  updated.domain.name = zoneName;

  return updated;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForHealthy(
  apiToken: string,
  accountId: string,
  tunnelId: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const health = await getTunnelHealth(apiToken, accountId, tunnelId).catch(() => null);
    if (health?.status === 'healthy' && health.connectorCount > 0) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error('Timeout');
}

async function captureQuickTunnelUrl(container: Dockerode.Container): Promise<string> {
  const URL_REGEX = /https?:\/\/([\w-]+\.trycloudflare\.com)/i;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('URL capture timeout')), 30_000);

    container.logs({ follow: true, stdout: true, stderr: true, tail: 0 }, (err, stream) => {
      if (err || !stream) {
        clearTimeout(timer);
        return reject(err ?? new Error('No stream'));
      }
      stream.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const match = URL_REGEX.exec(text);
        if (match) {
          clearTimeout(timer);
          (stream as import('node:stream').Readable).destroy();
          resolve(match[0].startsWith('http') ? match[0] : `https://${match[1]}`);
        }
      });
      stream.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
  });
}

/** Returns the URL path prefix used for a Quick Tunnel subdomain (e.g. `gitea` → `/git`). */
function getQuickTunnelPath(subdomain: string): string {
  const map: Record<string, string> = {
    gitea: '/git',
    filebrowser: '/files',
    'uptime-kuma': '/status',
    grafana: '/grafana',
    pgadmin: '/pgadmin',
  };
  return map[subdomain] ?? '';
}

// ---------------------------------------------------------------------------
// handleDomainConnect — External domain connection via DomainManager
// ---------------------------------------------------------------------------

async function handleDomainConnect(
  appName: string,
  domainHostname: string,
  force: boolean,
): Promise<void> {
  const tunnelLogger = new TunnelLogger();

  const lastProject = getLastProject();
  if (!lastProject) {
    console.error(chalk.red('  설치된 brewnet 프로젝트를 찾을 수 없습니다.'));
    console.error(chalk.dim('  먼저 `brewnet init`을 실행하세요.'));
    process.exit(1);
  }

  // Parse subdomain and domain from hostname
  const dotIndex = domainHostname.indexOf('.');
  if (dotIndex === -1) {
    console.error(chalk.red(`  잘못된 도메인 형식입니다: ${domainHostname}`));
    console.error(chalk.dim('  예: my-api.yourdomain.com'));
    process.exit(1);
  }
  const subdomain = domainHostname.substring(0, dotIndex);
  const domain = domainHostname.substring(dotIndex + 1);

  console.log();
  console.log(chalk.bold.cyan('  brewnet domain connect'));
  console.log(chalk.dim(`  앱: ${appName} → ${domainHostname}`));
  console.log();

  let manager: DomainManager;
  try {
    manager = new DomainManager(lastProject);
  } catch (err) {
    console.error(chalk.red(`  프로젝트 로드 실패: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  const state = manager.getState();

  // Check if this is a Scenario C (CNAME-only) setup
  if (!state.domain.cloudflare.zoneId && state.domain.cloudflare.tunnelId) {
    // Scenario C: CNAME-only mode — show manual instructions
    const tunnelUuid = state.domain.cloudflare.tunnelId;
    console.log(chalk.bold.yellow('  📋 Scenario C: CNAME 수동 설정 필요'));
    console.log();
    console.log(chalk.dim('  도메인 네임서버가 Cloudflare에 위임되지 않았습니다.'));
    console.log(chalk.dim('  DNS 제공자에서 아래 CNAME 레코드를 직접 추가하세요:'));
    console.log();
    console.log(chalk.bold(`  이름:    ${subdomain}`));
    console.log(chalk.bold(`  유형:    CNAME`));
    console.log(chalk.bold(`  값:     ${tunnelUuid}.cfargotunnel.com`));
    console.log();
    console.log(chalk.dim('  주요 DNS 제공자 설정 방법:'));
    console.log(chalk.dim('    GoDaddy:    DNS 관리 → 레코드 추가 → CNAME'));
    console.log(chalk.dim('    Namecheap:  고급 DNS → 새 레코드 → CNAME'));
    console.log(chalk.dim('    가비아:     DNS 관리 → 레코드 추가 → CNAME'));
    console.log(chalk.dim('    Cafe24:     DNS 관리 → CNAME 추가'));
    console.log();
    return;
  }

  // Media streaming ToS warning (FR-012)
  const mediaServices = ['jellyfin', 'media', 'plex', 'emby'];
  if (mediaServices.includes(appName.toLowerCase())) {
    console.log(chalk.yellow('  ⚠️  주의: Cloudflare는 대용량 미디어 스트리밍(비디오 등)을'));
    console.log(chalk.yellow('  프록시를 통해 전송하는 것을 서비스 약관(ToS)에서 제한합니다.'));
    console.log(chalk.yellow('  미디어 서비스 외부 연결은 ToS 위반 위험이 있습니다.'));
    console.log();
  }

  const spinner = ora('외부 도메인 연결 중...').start();

  const result = await manager.connect(appName, subdomain, domain, { force });

  spinner.stop();

  // Display step results
  for (const step of result.steps) {
    const icon = step.status === 'completed' ? chalk.green('✅')
      : step.status === 'skipped' ? chalk.yellow('⏭️')
      : chalk.red('❌');
    const duration = step.durationMs ? chalk.dim(` (${(step.durationMs / 1000).toFixed(1)}s)`) : '';
    const stepName = {
      health_check: 'Local health check',
      ingress_update: 'Tunnel ingress updated',
      dns_creation: 'DNS CNAME record created',
      traefik_labels: 'Traefik labels updated',
      dns_propagation: 'DNS propagation verified',
    }[step.step] ?? step.step;
    console.log(`  ${icon} ${stepName}${duration}`);
    if (step.status === 'failed' && step.error) {
      console.log(chalk.dim(`     ${step.error}`));
    }
  }
  console.log();

  if (result.success) {
    console.log(chalk.bold.green(`  ✅ ${result.externalUrl} is live!`));

    tunnelLogger.log({
      event: 'DOMAIN_CONNECT',
      tunnelMode: 'named',
      tunnelId: state.domain.cloudflare.tunnelId || undefined,
      tunnelName: state.domain.cloudflare.tunnelName || undefined,
      domain: domainHostname,
      detail: `External domain connected: ${appName} → ${domainHostname}`,
    });
  } else {
    console.error(chalk.red(`  ❌ 연결 실패: ${result.error}`));
    if (result.error === 'CNAME_CONFLICT') {
      console.log(chalk.dim('  기존 CNAME을 덮어쓰려면 --force 옵션을 사용하세요:'));
      console.log(chalk.dim(`    brewnet domain connect ${appName} --domain ${domainHostname} --force`));
    }
    process.exit(1);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// handleDomainDisconnect — T018-T021
// ---------------------------------------------------------------------------

async function handleDomainDisconnect(appName: string): Promise<void> {
  const tunnelLogger = new TunnelLogger();
  const lastProject = getLastProject();
  if (!lastProject) {
    console.error(chalk.red('  설치된 brewnet 프로젝트를 찾을 수 없습니다.'));
    process.exit(1);
  }

  let manager: DomainManager;
  try {
    manager = new DomainManager(lastProject);
  } catch (err) {
    console.error(chalk.red(`  프로젝트 로드 실패: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold.cyan('  brewnet domain disconnect'));
  console.log(chalk.dim(`  앱: ${appName}`));
  console.log();

  const spinner = ora('외부 도메인 연결 해제 중...').start();
  const result = await manager.disconnect(appName);
  spinner.stop();

  for (const step of result.steps) {
    const icon = step.status === 'completed' ? chalk.green('✅') : chalk.red('❌');
    const stepName = {
      ingress_removal: 'Tunnel ingress rule removed',
      dns_deletion: 'DNS CNAME record deleted',
      traefik_cleanup: 'Traefik external labels removed',
    }[step.step] ?? step.step;
    console.log(`  ${icon} ${stepName}`);
    if (step.status === 'failed' && step.error) {
      console.log(chalk.dim(`     ${step.error}`));
    }
  }
  console.log();

  if (result.success) {
    console.log(chalk.green(`  ✅ ${appName}의 외부 도메인 연결이 해제되었습니다.`));
    console.log(chalk.dim(`  ℹ  ${appName}은(는) 로컬에서 계속 실행 중입니다.`));

    tunnelLogger.log({
      event: 'DOMAIN_CONNECT',
      tunnelMode: 'named',
      detail: `External domain disconnected: ${appName} (${result.removedHostname})`,
    });
  } else {
    console.error(chalk.red(`  ❌ 연결 해제 실패: ${result.error}`));
    process.exit(1);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// handleDomainStatus — T023-T026
// ---------------------------------------------------------------------------

async function handleDomainStatus(appName?: string): Promise<void> {
  const lastProject = getLastProject();
  if (!lastProject) {
    console.error(chalk.red('  설치된 brewnet 프로젝트를 찾을 수 없습니다.'));
    process.exit(1);
  }

  let manager: DomainManager;
  try {
    manager = new DomainManager(lastProject);
  } catch (err) {
    console.error(chalk.red(`  프로젝트 로드 실패: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  const spinner = ora('도메인 상태 조회 중...').start();
  const statuses = await manager.status(appName);
  spinner.stop();

  if (statuses.length === 0) {
    console.log(chalk.dim('  연결된 외부 도메인이 없습니다.'));
    console.log(chalk.dim('  `brewnet domain connect <app> --domain <hostname>` 명령으로 연결하세요.'));
    console.log();
    return;
  }

  console.log();
  for (const s of statuses) {
    const localIcon = s.local.healthy ? chalk.green('✅') : chalk.red('❌');
    const externalIcon = s.external.httpsReachable ? chalk.green('✅') : chalk.red('❌');
    const tunnelIcon = s.tunnel.status === 'healthy' ? chalk.green('✅')
      : s.tunnel.status === 'degraded' ? chalk.yellow('⚠️')
      : chalk.red('❌');
    const dnsIcon = s.external.dnsResolved ? chalk.green('✅') : chalk.red('❌');

    console.log(chalk.bold(`  ${s.appName}`));
    console.log(`    Local:    ${s.local.url.padEnd(40)} ${localIcon}`);
    console.log(`    External: ${s.external.url.padEnd(40)} ${externalIcon}${s.external.httpsReachable ? '' : ' unreachable'}`);
    console.log(`    Tunnel:   ${(s.tunnel.status).padEnd(40)} ${tunnelIcon} (${s.tunnel.connectorCount} connections)`);
    if (s.dns) {
      console.log(`    DNS:      CNAME → ${s.dns.content.padEnd(28)} ${dnsIcon}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// handleDomainList — T028-T029
// ---------------------------------------------------------------------------

async function handleDomainList(): Promise<void> {
  const lastProject = getLastProject();
  if (!lastProject) {
    console.error(chalk.red('  설치된 brewnet 프로젝트를 찾을 수 없습니다.'));
    process.exit(1);
  }

  let manager: DomainManager;
  try {
    manager = new DomainManager(lastProject);
  } catch (err) {
    console.error(chalk.red(`  프로젝트 로드 실패: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  const connections = manager.list();

  if (connections.length === 0) {
    console.log();
    console.log(chalk.dim('  연결된 외부 도메인이 없습니다.'));
    console.log(chalk.dim('  `brewnet domain connect <app> --domain <hostname>` 명령으로 연결하세요.'));
    console.log();
    return;
  }

  console.log();
  console.log(chalk.bold('  External Domain Connections'));
  console.log(chalk.dim('  ─────────────────────────────────────────────────────────────'));

  // Simple table output
  const header = `  ${'App'.padEnd(12)} ${'External URL'.padEnd(40)} ${'Connected'}`;
  console.log(chalk.bold(header));
  console.log(chalk.dim('  ' + '─'.repeat(65)));

  for (const conn of connections) {
    const date = new Date(conn.connectedAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    console.log(`  ${conn.appName.padEnd(12)} ${`https://${conn.hostname}`.padEnd(40)} ${dateStr}`);
  }
  console.log();
}
