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
    chalk.dim('  외부 접근 방식을 선택하세요.'),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. 3-option scenario selector
  // -------------------------------------------------------------------------
  type ScenarioChoice = '1-quick' | '2-named' | '3-local';

  const scenario = await select<ScenarioChoice>({
    message: '외부 접근 방식을 선택하세요',
    choices: [
      {
        name: '1. Quick Tunnel (즉시 사용, 임시 URL — 도메인 불필요)',
        value: '1-quick' as const,
        description: '계정 없이 바로 시작. 단, 서버 재시작 시 URL이 변경됩니다.',
      },
      {
        name: '2. Named Tunnel (Cloudflare 계정 필요, 영구 URL)',
        value: '2-named' as const,
        description: 'Cloudflare 계정 + API 토큰 필요. 도메인 유무에 따라 설정이 달라집니다.',
      },
      {
        name: '3. 로컬 전용 (외부 접근 없음)',
        value: '3-local' as const,
        description: '내부 네트워크에서만 접근. brewnet.local 도메인 사용.',
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

  console.log(chalk.dim(`  접근: ${next.domain.name} (LAN 전용)`));
  console.log(chalk.dim('  외부 접근: 비활성화'));
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
  console.log(chalk.dim('  Cloudflare 계정 없이 즉시 사용 가능한 임시 URL을 생성합니다.'));
  console.log();
  console.log(chalk.yellow('  ⚠️  서버 재시작 시 URL이 변경됩니다. 영구 URL이 필요하면'));
  console.log(chalk.yellow('     설치 완료 후 `brewnet domain connect`를 실행하세요.'));
  console.log();
  console.log(chalk.dim('  Quick Tunnel URL은 서비스 시작 후 자동으로 발급됩니다.'));
  console.log();

  // State 설정만 — 실제 컨테이너 시작은 Step 6 (docker compose up)에서
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
  console.log(chalk.bold.white('  [1] Cloudflare 로그인'));
  console.log(chalk.dim('      https://dash.cloudflare.com → 로그인'));
  console.log();
  if (includeDns) {
    console.log(chalk.bold.white('  [2] 도메인을 Cloudflare에 추가 (처음 사용 시)'));
    console.log(chalk.dim('      좌측 사이드바에서 "Domains" 클릭'));
    console.log(chalk.dim('      → "Add a domain" 버튼 → 도메인 입력 → Continue'));
    console.log(chalk.dim('      → Free 플랜 선택 → Continue → 네임서버 2개 확인'));
    console.log(chalk.dim('      → 도메인 등록업체에서 네임서버 교체 → 저장'));
    console.log(chalk.dim('      (네임서버 전파 최대 24시간 소요)'));
    console.log();
  }
  console.log(chalk.bold.white('  [3] API Token 생성'));
  console.log(chalk.dim('      우측 상단 프로필 → My Profile → API Tokens → Create Token'));
  console.log(chalk.dim('      → "Edit Cloudflare Tunnel" 템플릿 → Use template'));
  console.log(chalk.dim('      → Zone Resources: 사용할 도메인 선택 → Continue → Create Token'));
  console.log();
  console.log(chalk.dim('  필요 권한: Cloudflare Tunnel:Edit  •  DNS:Edit  •  Zone:Read'));
  console.log();

  const tokenUrl = buildTokenCreationUrl(next.projectName);
  console.log(chalk.dim('  사전 설정된 토큰 생성 URL (브라우저에서 열림):'));
  console.log(`  ${chalk.cyan(tokenUrl)}`);
  console.log();
  await tryOpenUrl(tokenUrl);

  // Step 2: Prompt for API token
  let apiToken = await input({
    message: 'Cloudflare API Token을 붙여넣으세요',
    default: '',
    validate: (v) => v.trim().length > 0 ? true : 'API Token이 필요합니다',
  });
  apiToken = apiToken.trim();
  console.log();

  // Step 3: Verify token (with retry)
  const verifySpinner = ora('API 토큰 검증 중...').start();
  let verifyResult: { valid: boolean; email?: string };
  try {
    verifyResult = await verifyToken(apiToken);
  } catch {
    verifyResult = { valid: false };
  }

  if (!verifyResult.valid) {
    verifySpinner.fail(chalk.red('유효하지 않은 API 토큰입니다. [BN004]'));
    console.log(chalk.dim('  Cloudflare 대시보드에서 토큰을 확인해주세요.'));
    console.log();
    throw new Error('API 토큰 검증 실패');
  }

  verifySpinner.succeed(
    chalk.green('토큰 검증 완료') +
    (verifyResult.email ? chalk.dim(` (계정: ${verifyResult.email})`) : ''),
  );
  console.log();

  // Step 4: Account auto-detection / selection
  const accountsSpinner = ora('Cloudflare 계정 조회 중...').start();
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
    console.log(chalk.yellow('  계정을 찾을 수 없습니다. Account ID를 직접 입력해주세요.'));
    const manualAccountId = await input({
      message: 'Cloudflare Account ID',
      default: next.domain.cloudflare.accountId || '',
      validate: (v) => v.trim().length > 0 ? true : 'Account ID가 필요합니다',
    });
    selectedAccountId = manualAccountId.trim();
    selectedAccountName = selectedAccountId;
  } else if (accounts.length === 1) {
    selectedAccountId = accounts[0].id;
    selectedAccountName = accounts[0].name;
    console.log(chalk.dim(`  계정: ${selectedAccountName} (자동 선택)`));
  } else {
    selectedAccountId = await select<string>({
      message: 'Cloudflare 계정을 선택하세요',
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
    const zonesSpinner = ora('DNS 존 조회 중...').start();
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
      console.log(chalk.yellow('  활성 도메인이 없습니다. domains.cloudflare.com에서 도메인을 등록해주세요.'));
      console.log();
      throw new Error('Cloudflare 계정에 활성 도메인이 없습니다.');
    }

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

    next.domain.cloudflare.zoneId = selectedZoneId;
    next.domain.cloudflare.zoneName = selectedZoneName;
    next.domain.name = selectedZoneName;
    console.log();
  }

  // Step 6: Tunnel name
  const tunnelName = await input({
    message: '터널 이름',
    default: next.domain.cloudflare.tunnelName || next.projectName,
  });
  next.domain.cloudflare.tunnelName = tunnelName.trim();
  console.log();

  // Step 7: Create tunnel
  let createdTunnelId = '';
  const createSpinner = ora('Cloudflare 터널 생성 중...').start();
  try {
    const tunnelResult = await createTunnel(
      apiToken,
      selectedAccountId,
      next.domain.cloudflare.tunnelName,
    );
    createdTunnelId = tunnelResult.tunnelId;
    next.domain.cloudflare.tunnelId = tunnelResult.tunnelId;
    next.domain.cloudflare.tunnelToken = tunnelResult.tunnelToken;
    createSpinner.succeed(chalk.green(`터널 생성됨: ${next.domain.cloudflare.tunnelName}`));
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
    createSpinner.fail(chalk.red('터널 생성에 실패했습니다. [BN009]'));
    console.log(chalk.yellow(`  오류: ${err instanceof Error ? err.message : String(err)}`));
    console.log();

    tunnelLogger.log({
      event: 'ROLLBACK',
      tunnelMode: 'named',
      detail: 'Rollback triggered: tunnel creation failed',
      error: err instanceof Error ? err.message : String(err),
    });

    throw new Error('터널 생성에 실패했습니다. 잠시 후 다시 시도해주세요. [BN009]');
  }
  console.log();

  if (includeDns) {
    // Step 8: Configure ingress rules
    const routes = getActiveServiceRoutes(next);
    if (routes.length > 0) {
      const ingressSpinner = ora('터널 인그레스 규칙 설정 중...').start();
      try {
        await configureTunnelIngress(
          apiToken,
          selectedAccountId,
          createdTunnelId,
          selectedZoneName,
          routes,
        );
        ingressSpinner.succeed(chalk.green(`인그레스 설정 완료 (${routes.length}개 서비스)`));
      } catch (err) {
        ingressSpinner.fail(chalk.red('인그레스 설정 실패'));
        console.log(chalk.yellow(`  오류: ${err instanceof Error ? err.message : String(err)}`));
        console.log();

        // Rollback: delete tunnel
        await rollbackTunnel(apiToken, selectedAccountId, createdTunnelId, tunnelLogger, 'ingress 설정 실패');
        throw new Error('설정 실패 — 터널 롤백 완료. 다시 시도하세요.');
      }
      console.log();

      // Step 9: Create DNS CNAME records
      const dnsSpinner = ora('DNS CNAME 레코드 생성 중...').start();
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
        dnsSpinner.fail(chalk.red('DNS 레코드 생성 실패'));
        for (const record of failed) {
          console.log(chalk.yellow(`    실패: ${record}`));
        }
        console.log();

        await rollbackTunnel(apiToken, selectedAccountId, createdTunnelId, tunnelLogger, 'DNS 레코드 생성 전체 실패');
        throw new Error('설정 실패 — 터널 롤백 완료. 다시 시도하세요.');
      }

      if (failed.length === 0) {
        dnsSpinner.succeed(chalk.green(`DNS 레코드 생성 완료 (${created.length}개)`));
      } else {
        dnsSpinner.warn(chalk.yellow(`DNS 레코드: ${created.length}개 생성, ${failed.length}개 실패`));
      }

      for (const record of created) {
        console.log(chalk.dim(`    CNAME: ${record} → ${createdTunnelId}.cfargotunnel.com`));
      }
      for (const record of failed) {
        console.log(chalk.yellow(`    실패: ${record}`));
      }
      console.log();
    }

    // Step 10: Health verification — poll for 'healthy' status (30s timeout)
    const healthSpinner = ora('터널 연결 확인 중... (최대 30초)').start();
    try {
      await waitForTunnelHealthy(apiToken, selectedAccountId, createdTunnelId, 30_000);
      healthSpinner.succeed(chalk.green('터널이 정상 연결되었습니다 (healthy)'));
    } catch {
      healthSpinner.warn(chalk.yellow('터널 상태 확인 실패 (30초 초과)'));
      console.log(chalk.dim('  터널이 백그라운드에서 계속 연결 시도 중일 수 있습니다.'));
      console.log(chalk.dim('  `brewnet domain tunnel status`로 상태를 확인하세요.'));
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
      message: 'Cloudflare에 등록된 도메인이 이미 있으신가요?',
      default: true,
    });
    console.log();

    if (!hasDomain) {
      // Domain purchase guide (previously scenario 3)
      console.log(chalk.bold('  도메인 구입 안내'));
      console.log();
      console.log(chalk.bold.white('  Cloudflare에서 도메인을 등록하는 방법:'));
      console.log();
      console.log(chalk.dim('  1. https://domains.cloudflare.com → 로그인 또는 계정 생성'));
      console.log(chalk.dim('  2. 도메인 검색 → 등록 (연 $8~15 수준, .com 기준)'));
      console.log(chalk.dim('  3. 도메인이 Cloudflare 네임서버로 자동 설정됩니다'));
      console.log(chalk.dim('  4. 등록 완료까지 1~5분 소요'));
      console.log();

      // Offer Quick Tunnel bridge while waiting for domain setup
      const useBridge = await confirm({
        message: 'Quick Tunnel로 임시 접근을 시작하겠습니까? (도메인 준비 중에도 서비스에 접근 가능)',
        default: true,
      });
      console.log();

      if (useBridge) {
        const spinner = ora('Quick Tunnel 시작 중...').start();
        try {
          qtManager = new QuickTunnelManager(tunnelLogger);
          const url = await qtManager.start();
          spinner.succeed(chalk.green(`임시 URL: ${url}`));
          console.log(chalk.dim('  도메인 준비가 완료되면 아래에서 Enter를 눌러 Named Tunnel로 전환합니다.'));
          console.log();
        } catch (err) {
          spinner.fail(chalk.yellow(`Quick Tunnel 실패: ${err instanceof Error ? err.message : String(err)}`));
          console.log();
          qtManager = null;
        }
      }

      // Block until user signals domain is ready
      await input({
        message: '도메인 설정 완료 후 Enter를 누르세요',
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
      const stopSpinner = ora('임시 Quick Tunnel 중지 중...').start();
      try {
        await qtManager.stop();
        stopSpinner.succeed(chalk.green('Quick Tunnel 중지 완료'));
      } catch {
        stopSpinner.warn('Quick Tunnel 중지 실패 (수동으로 중지하세요)');
      }
      console.log();
    }

    if (!hasDomain) {
      console.log(chalk.dim('  도메인 연결: `brewnet domain connect`'));
      console.log();
    }

    printNetworkSummary(updated);
    return updated;
  } catch (err) {
    if (qtManager) {
      await qtManager.stop().catch((stopErr: unknown) => {
        console.warn('[Named Tunnel] Quick Tunnel 중지 실패:', stopErr instanceof Error ? stopErr.message : String(stopErr));
      });
    }
    console.log(chalk.red(`  오류: ${err instanceof Error ? err.message : String(err)}`));
    console.log();
    console.log(chalk.yellow('  Local 모드로 전환합니다.'));
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

  throw new Error(`터널이 ${timeoutMs / 1000}초 내에 healthy 상태가 되지 않았습니다`);
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
  const rollbackSpinner = ora('터널 롤백 중...').start();
  try {
    await deleteTunnel(apiToken, accountId, tunnelId);
    rollbackSpinner.succeed(chalk.yellow('터널 롤백 완료'));

    tunnelLogger.log({
      event: 'ROLLBACK',
      tunnelMode: 'named',
      tunnelId,
      detail: `Rollback triggered: ${reason}`,
    });
  } catch (rollbackErr) {
    rollbackSpinner.fail(chalk.red('롤백 실패 (Cloudflare 대시보드에서 수동 삭제 필요)'));
    console.log(chalk.yellow(`  롤백 오류: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`));

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
    console.log(chalk.dim('    접근:  LAN 전용'));
    console.log(chalk.dim(`    호스트: ${state.domain.name}`));
  } else if (state.domain.provider === 'quick-tunnel') {
    console.log(chalk.dim('    접근:  Quick Tunnel (임시 URL)'));
    console.log(chalk.dim(`    URL:   ${state.domain.cloudflare.quickTunnelUrl}`));
    console.log(chalk.yellow('    ⚠️  재시작 시 URL이 변경됩니다'));
    console.log(chalk.dim('    영구 URL: `brewnet domain connect`'));
  } else {
    console.log(chalk.dim('    접근:  Named Tunnel (외부 접근 가능)'));
    console.log(chalk.dim(`    터널:  ${state.domain.cloudflare.tunnelName}`));
    if (state.domain.cloudflare.tunnelId) {
      console.log(chalk.dim(`    ID:    ${state.domain.cloudflare.tunnelId}`));
    }
    if (state.domain.cloudflare.zoneName) {
      console.log(chalk.dim(`    도메인: ${state.domain.cloudflare.zoneName}`));
    } else {
      console.log(chalk.dim('    도메인: 미설정 (`brewnet domain connect`로 연결)'));
    }
    console.log(chalk.dim('    SSL:   Cloudflare 관리'));
  }
  console.log();
  console.log(chalk.green('  Network Access configured.'));
  console.log();
}
