/**
 * T050 — Step 2: Server Component Toggle Rules (Pure Logic)
 *
 * Pure functions that enforce business rules for server component selection.
 * These functions take a WizardState and return an updated WizardState,
 * with no side effects. Used by the Step 2 wizard UI and by tests.
 *
 * Rules:
 *   - Web Server is always enabled (required)
 *   - Git Server is always enabled (required)
 *   - File Server or Media Server enabled → SFTP auto-suggested
 *   - Domain = 'local' → Mail Server hidden / not available
 *   - DB Server enabled → cache selection available
 *   - DB Server enabled + empty dbPassword → auto-generate password
 *   - SSH Server default → passwordAuth = false (key-only)
 *   - Language/frontend selected → App Server auto-enabled
 *   - App Server auto-enabled → FileBrowser auto-enabled
 *
 * @module wizard/steps/server-components
 */

import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type {
  WizardState,
  WebServerService,
  FileServerService,
  DbPrimary,
  CacheService,
} from '@brewnet/shared';
import { DB_VERSIONS } from '@brewnet/shared';
import { generatePassword } from '../../utils/password.js';
import { estimateResources } from '../../utils/resources.js';

// ---------------------------------------------------------------------------
// Pure Rule Functions
// ---------------------------------------------------------------------------

/**
 * Apply all component toggle rules to the given wizard state.
 * Ensures invariants (required components, auto-suggestions, auto-generation).
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with rules applied
 */
export function applyComponentRules(state: WizardState): WizardState {
  const next = structuredClone(state);

  // Required components — always enabled
  next.servers.webServer.enabled = true;
  next.servers.gitServer.enabled = true;

  // SSH Server defaults to key-only auth
  if (next.servers.sshServer.enabled && next.servers.sshServer.passwordAuth === undefined) {
    next.servers.sshServer.passwordAuth = false;
  }

  // SFTP auto-suggestion when File Server or Media is enabled
  if (shouldAutoSuggestSftp(next)) {
    next.servers.sshServer.sftp = true;
  }

  // Mail Server hidden when domain is local
  if (!isMailServerAvailable(next)) {
    next.servers.mailServer.enabled = false;
  }

  // DB password auto-generation
  if (next.servers.dbServer.enabled && !next.servers.dbServer.dbPassword) {
    next.servers.dbServer.dbPassword = generatePassword(16);
  }

  return next;
}

/**
 * Check whether the mail server option should be visible / available.
 * Mail requires a real domain (not 'local').
 *
 * @param state - Current wizard state
 * @returns true if mail server can be enabled
 */
export function isMailServerAvailable(state: WizardState): boolean {
  // Mail server requires a real domain (not local)
  return state.domain.provider !== 'local';
}

/**
 * Check whether SFTP should be auto-suggested (checked by default).
 * SFTP is auto-suggested when File Server or Media Server is enabled.
 *
 * @param state - Current wizard state
 * @returns true if SFTP should be auto-suggested
 */
export function shouldAutoSuggestSftp(state: WizardState): boolean {
  return state.servers.fileServer.enabled || state.servers.media.enabled;
}

/**
 * Apply devStack-based auto-enables.
 * When languages or frontend technologies are selected, App Server
 * and FileBrowser are automatically enabled.
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with auto-enables applied
 */
export function applyDevStackAutoEnables(state: WizardState): WizardState {
  const next = structuredClone(state);

  const hasLanguages = next.devStack.languages.length > 0;
  const hasFrontend = next.devStack.frontend !== null;
  const hasDevStack = hasLanguages || hasFrontend;

  next.servers.appServer.enabled = hasDevStack;

  // FileBrowser auto-enabled alongside App Server
  if (hasDevStack) {
    next.servers.fileBrowser.enabled = true;
  } else {
    // When no devStack, FileBrowser reverts to its previous state
    // (only auto-disable if it was auto-enabled by devStack)
    next.servers.fileBrowser.enabled = false;
  }

  return next;
}

/**
 * Check if cache layer selection is available.
 * Cache is only configurable when DB Server is enabled.
 *
 * @param state - Current wizard state
 * @returns true if cache selection should be shown
 */
export function isCacheSelectionAvailable(state: WizardState): boolean {
  return state.servers.dbServer.enabled;
}

// ---------------------------------------------------------------------------
// Interactive Step Function (T052-T058)
// ---------------------------------------------------------------------------

/**
 * Run Step 3: Server Components.
 *
 * Displays admin account summary (set in Pre-Step) and collects
 * server component selections.
 * Applies component rules at the end to enforce invariants.
 *
 * Flow:
 *   1. Display header "Step 3/8 — Server Components"
 *   2. Admin Account summary (read-only, set in Pre-Step)
 *   3. Web Server (always ON, select service)
 *   4. File Server (toggle, select service)
 *   5. Git Server (always ON, show info)
 *   6. DB Server (toggle, primary, version, cache, password)
 *   7. Media (toggle jellyfin)
 *   8. SSH Server (toggle, port, passwordAuth, SFTP auto-suggest)
 *   9. Apply component rules
 *  10. Show resource estimation
 *  11. Return updated state
 *
 * @param state - Current wizard state
 * @returns Updated wizard state with server component selections
 */
export async function runServerComponentsStep(
  state: WizardState,
): Promise<WizardState> {
  const next = structuredClone(state);

  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 3/8') + chalk.bold(' — Server Components'),
  );
  console.log(
    chalk.dim(
      '  Select server components to install',
    ),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Admin Account summary (read-only — configured in Pre-Step)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Admin Account') + chalk.dim(' (configured in Pre-Step)'));
  console.log(chalk.dim(`    Username: ${next.admin.username || 'admin'}`));
  console.log(chalk.dim(`    Password: ${'*'.repeat(Math.min(next.admin.password?.length ?? 0, 12))} (set)`));
  console.log();

  // -------------------------------------------------------------------------
  // 3. Web Server (always ON — select service)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Web Server') + chalk.green(' (required)'));
  console.log(chalk.dim('  모든 서비스 앞단에서 HTTPS 처리 및 도메인 라우팅을 담당하는 리버스 프록시'));
  console.log();

  const webService = await select<WebServerService>({
    message: 'Reverse proxy',
    choices: [
      { name: 'Traefik (recommended)', value: 'traefik', description: '자동 SSL 갱신 + Docker 레이블 기반 라우팅. 서비스 추가 시 설정 불필요' },
      { name: 'Nginx', value: 'nginx', description: '업계 표준 웹서버 겸 프록시. 안정적이며 범용 설정 지원' },
      { name: 'Caddy', value: 'caddy', description: '간결한 설정 파일, Let\'s Encrypt 자동화 내장' },
    ],
    default: next.servers.webServer.service || 'traefik',
  });
  next.servers.webServer.service = webService;
  console.log();

  // -------------------------------------------------------------------------
  // 4. File Server (toggle + select service)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  File Server'));
  console.log(chalk.dim('  파일 저장·공유·동기화 서버. Dropbox / S3 같은 자체 호스팅 스토리지'));
  console.log();

  const fileServerEnabled = await confirm({
    message: 'Enable File Server?',
    default: next.servers.fileServer.enabled,
  });
  next.servers.fileServer.enabled = fileServerEnabled;

  if (fileServerEnabled) {
    const fileService = await select<FileServerService>({
      message: 'File server service',
      choices: [
        { name: 'Nextcloud', value: 'nextcloud', description: '파일 동기화 + 캘린더·연락처·사진 앱 포함 올인원 협업 Suite' },
        { name: 'MinIO (S3-compatible)', value: 'minio', description: 'AWS S3 호환 오브젝트 스토리지. 대용량 파일·백업·미디어 저장에 최적' },
      ],
      default: next.servers.fileServer.service || 'nextcloud',
    });
    next.servers.fileServer.service = fileService;
  } else {
    next.servers.fileServer.service = '';
  }
  console.log();

  // -------------------------------------------------------------------------
  // 5. Git Server (always ON — info display)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Git Server') + chalk.green(' (required)'));
  console.log(
    chalk.dim(`  Gitea — Web UI port ${next.servers.gitServer.port}, SSH port ${next.servers.gitServer.sshPort}`),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 6. DB Server (toggle + primary + version + cache + password)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Database Server'));
  console.log(chalk.dim('  앱 데이터를 영구 저장하는 관계형 DB. 대부분의 서비스에 필수'));
  console.log();

  const dbEnabled = await confirm({
    message: 'Enable Database Server?',
    default: next.servers.dbServer.enabled,
  });
  next.servers.dbServer.enabled = dbEnabled;

  if (dbEnabled) {
    // Primary database
    const dbPrimary = await select<DbPrimary>({
      message: 'Primary database',
      choices: [
        { name: 'PostgreSQL (recommended)', value: 'postgresql', description: '기능이 풍부한 오픈소스 RDBMS. JSON·전문검색 지원, 대규모 서비스에 적합' },
        { name: 'MySQL', value: 'mysql', description: '세계 최다 사용 DB. WordPress·Drupal 등 PHP 생태계와 높은 호환성' },
        { name: 'SQLite (embedded)', value: 'sqlite', description: '파일 기반 경량 DB. 외부 서버 불필요, 소규모·단일 서비스용' },
      ],
      default: next.servers.dbServer.primary || 'postgresql',
    });
    next.servers.dbServer.primary = dbPrimary;

    // Version selection (skip for SQLite — it only has version "3")
    if (dbPrimary !== 'sqlite') {
      const versions = DB_VERSIONS[dbPrimary] ?? [];
      if (versions.length > 0) {
        const dbVersion = await select<string>({
          message: `${dbPrimary === 'postgresql' ? 'PostgreSQL' : 'MySQL'} version`,
          choices: versions.map((v) => ({ name: v, value: v })),
          default: next.servers.dbServer.primaryVersion || versions[0],
        });
        next.servers.dbServer.primaryVersion = dbVersion;
      }

      // Admin UI (pgAdmin / phpMyAdmin)
      const adminUILabel = dbPrimary === 'postgresql' ? 'pgAdmin' : 'phpMyAdmin';
      const adminUI = await confirm({
        message: `Enable ${adminUILabel} (database admin UI)?`,
        default: next.servers.dbServer.adminUI,
      });
      next.servers.dbServer.adminUI = adminUI;
    } else {
      next.servers.dbServer.primaryVersion = '3';
      next.servers.dbServer.adminUI = false;
    }

    // DB name and user
    const dbName = await input({
      message: 'Database name',
      default: next.servers.dbServer.dbName || 'brewnet_db',
    });
    next.servers.dbServer.dbName = dbName;

    const dbUser = await input({
      message: 'Database user',
      default: next.servers.dbServer.dbUser || 'brewnet',
    });
    next.servers.dbServer.dbUser = dbUser;

    // DB password — auto-generate if empty
    if (!next.servers.dbServer.dbPassword) {
      next.servers.dbServer.dbPassword = generatePassword(16);
      console.log(
        chalk.dim('  Database password auto-generated.'),
      );
    }

    // Cache layer
    const cacheChoice = await select<CacheService>({
      message: 'Cache layer',
      choices: [
        { name: 'Redis (recommended)', value: 'redis', description: '인메모리 캐시 + 세션·큐 저장소. 응답 속도를 획기적으로 향상' },
        { name: 'Valkey', value: 'valkey', description: 'Redis 호환 오픈소스 포크. Redis 7과 API 동일, 완전 무료 라이선스' },
        { name: 'KeyDB', value: 'keydb', description: '멀티스레드 Redis 호환. 단일 인스턴스에서 더 높은 처리량 제공' },
        { name: 'None', value: '', description: '캐시 레이어 없이 DB 직접 접근. 소규모·저트래픽 서비스에 적합' },
      ],
      default: next.servers.dbServer.cache || 'redis',
    });
    next.servers.dbServer.cache = cacheChoice;
  } else {
    // Reset DB fields when disabled
    next.servers.dbServer.primary = '';
    next.servers.dbServer.primaryVersion = '';
    next.servers.dbServer.dbName = '';
    next.servers.dbServer.dbUser = '';
    next.servers.dbServer.dbPassword = '';
    next.servers.dbServer.adminUI = false;
    next.servers.dbServer.cache = '';
  }
  console.log();

  // -------------------------------------------------------------------------
  // 7. Media (toggle jellyfin)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  Media Server'));
  console.log(chalk.dim('  영화·드라마·음악·사진을 스트리밍하는 자체 Netflix. 브라우저·모바일·TV 앱 지원'));
  console.log();

  const mediaEnabled = await confirm({
    message: 'Enable Media Server (Jellyfin)?',
    default: next.servers.media.enabled,
  });
  next.servers.media.enabled = mediaEnabled;
  next.servers.media.services = mediaEnabled ? ['jellyfin'] : [];
  console.log();

  // -------------------------------------------------------------------------
  // 8. SSH Server (toggle + passwordAuth + SFTP auto-suggest)
  // -------------------------------------------------------------------------
  console.log(chalk.bold('  SSH Server'));
  console.log(chalk.dim('  터미널로 서버에 원격 접속하거나 SFTP로 파일을 전송하는 보안 채널'));
  console.log();

  const sshEnabled = await confirm({
    message: 'Enable SSH Server?',
    default: next.servers.sshServer.enabled,
  });
  next.servers.sshServer.enabled = sshEnabled;

  if (sshEnabled) {
    next.servers.sshServer.port = 2222;
    console.log(chalk.dim('  SSH port: 2222'));

    const passwordAuth = await confirm({
      message: 'Allow password authentication? (key-only auth recommended)',
      default: next.servers.sshServer.passwordAuth ?? false,
    });
    next.servers.sshServer.passwordAuth = passwordAuth;

    // SFTP auto-suggestion
    if (shouldAutoSuggestSftp(next)) {
      console.log(
        chalk.dim('  SFTP auto-enabled (File Server or Media Server is active)'),
      );
      next.servers.sshServer.sftp = true;
    } else {
      const sftpEnabled = await confirm({
        message: 'Enable SFTP subsystem?',
        default: next.servers.sshServer.sftp,
      });
      next.servers.sshServer.sftp = sftpEnabled;
    }
  }
  console.log();

  // -------------------------------------------------------------------------
  // 9. Apply component rules
  // -------------------------------------------------------------------------
  const finalState = applyComponentRules(next);

  // -------------------------------------------------------------------------
  // 10. Resource estimation summary
  // -------------------------------------------------------------------------
  const resources = estimateResources(finalState);

  console.log(chalk.bold('  Resource Estimation'));
  console.log(chalk.dim(`    Containers: ${resources.containers}`));
  console.log(chalk.dim(`    RAM:        ~${resources.ramGB}`));
  console.log(chalk.dim(`    Disk:       ~${resources.diskGB} GB`));
  console.log();

  // -------------------------------------------------------------------------
  // 11. Summary
  // -------------------------------------------------------------------------
  console.log(chalk.green('  Server components configured.'));
  console.log();

  return finalState;
}
