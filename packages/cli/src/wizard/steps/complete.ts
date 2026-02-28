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
import Table from 'cli-table3';
import type { WizardState } from '@brewnet/shared';
import { buildServiceUrlMap } from '../../utils/service-verifier.js';
import {
  collectAllServices,
  getCredentialTargets,
} from '../../utils/resources.js';
import { sortByDependency } from '../../services/health-checker.js';
import { createAdminServer } from '../../services/admin-server.js';

/**
 * Wrap a URL in OSC 8 terminal hyperlink escape sequences.
 * Supported by: iTerm2, VS Code terminal, Windows Terminal, and many others.
 * Falls back to plain text in unsupported terminals.
 */
function hyperlink(url: string): string {
  return `\x1b]8;;${url}\x07${url}\x1b]8;;\x07`;
}

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
    chalk.bold.green('  Step 8/8') + chalk.bold(' — Complete!'),
  );
  console.log(
    chalk.dim('  Your home server has been brewed fresh.'),
  );
  console.log();

  // -------------------------------------------------------------------------
  // 2. Access URLs (local + external two-column table)
  // -------------------------------------------------------------------------
  const ADMIN_PORT = 8088;
  const services = collectAllServices(state);
  const sorted = sortByDependency(services);
  const serviceUrls = buildServiceUrlMap(state);
  const hasTunnel =
    (state.domain.cloudflare.enabled || state.domain.provider === 'quick-tunnel') &&
    (state.domain.cloudflare.tunnelMode === 'quick' ||
      state.domain.cloudflare.tunnelMode === 'named');

  const urlMap = [...serviceUrls];

  if (urlMap.length > 0) {
    console.log(chalk.bold('  Access URLs'));
    console.log();

    if (hasTunnel) {
      const maxExtLen = Math.max(
        10,
        ...urlMap.map((e) => (e.externalUrl ?? '—').length),
      );
      const urlTable = new Table({
        head: [chalk.bold('Service'), chalk.bold('Local'), chalk.bold('External')],
        colWidths: [20, 28, maxExtLen + 4],
        style: { head: [], border: ['dim'] },
      });

      for (const entry of urlMap) {
        urlTable.push([
          entry.label,
          chalk.cyan(entry.localUrl),
          entry.externalUrl ? chalk.green(entry.externalUrl) : chalk.dim('—'),
        ]);
      }

      console.log(urlTable.toString());
    } else {
      // No tunnel: plain list with OSC 8 clickable hyperlinks
      const maxNameLen = Math.max(...urlMap.map((e) => e.label.length));
      for (const entry of urlMap) {
        const labelPadded = entry.label.padEnd(maxNameLen);
        console.log(`    ${chalk.cyan(labelPadded)}  ${hyperlink(entry.localUrl)}`);
      }
    }

    console.log();
  }

  // -------------------------------------------------------------------------
  // 3. Credentials summary
  // -------------------------------------------------------------------------
  const credTargets = getCredentialTargets(state);
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
  // 4. External access info by tunnel mode
  // -------------------------------------------------------------------------
  if (state.domain.provider === 'quick-tunnel') {
    // Quick Tunnel — show URL + per-service paths + restart warning
    const quickUrl = state.domain.cloudflare.quickTunnelUrl;
    console.log(chalk.bold('  Quick Tunnel'));
    console.log(chalk.yellow('    ⚠️  임시 URL — 서버 재시작 시 변경됩니다'));
    console.log(chalk.dim(`    URL:  ${quickUrl}`));
    console.log();
    // Show per-service paths for installed services only
    const quickPaths: Record<string, string> = {
      gitea: '/git',
      filebrowser: '/files',
      'uptime-kuma': '/status',
      grafana: '/grafana',
      pgadmin: '/pgadmin',
    };
    const installedServices = new Set(sorted);
    const serviceLabels: Record<string, string> = {
      gitea: 'Gitea',
      filebrowser: 'FileBrowser',
      'uptime-kuma': 'Uptime Kuma',
      grafana: 'Grafana',
      pgadmin: 'pgAdmin',
    };
    const activePaths = Object.entries(quickPaths)
      .filter(([id]) => installedServices.has(id));

    if (activePaths.length > 0) {
      console.log(chalk.dim('    서비스 경로:'));
      const maxLen = Math.max(...activePaths.map(([id]) => (serviceLabels[id] ?? id).length));
      for (const [id, path] of activePaths) {
        const label = (serviceLabels[id] ?? id).padEnd(maxLen);
        console.log(chalk.dim(`      ${label}  ${quickUrl}${path}`));
      }
      console.log();
    }
    console.log(chalk.dim('    영구 URL로 업그레이드:'));
    console.log(`    ${chalk.cyan('brewnet domain connect')}`);
    console.log();
  } else if (state.domain.provider === 'tunnel') {
    console.log(chalk.bold('  Cloudflare Tunnel'));
    console.log(chalk.dim(`    터널:  ${state.domain.cloudflare.tunnelName}`));
    if (state.domain.cloudflare.tunnelId) {
      console.log(chalk.dim(`    ID:    ${state.domain.cloudflare.tunnelId}`));
    }
    if (state.domain.cloudflare.zoneName) {
      console.log(chalk.dim(`    도메인: ${state.domain.cloudflare.zoneName}`));
    } else {
      console.log(chalk.dim('    도메인: 미설정'));
      console.log(chalk.dim('    도메인 연결:'));
      console.log(`    ${chalk.cyan('brewnet domain connect')}`);
    }
    console.log();
    if (!state.domain.cloudflare.tunnelId) {
      console.log(chalk.dim('  외부 접근 호스트 추가:'));
      console.log(chalk.dim('    → one.dash.cloudflare.com → Networks → Connectors → Cloudflare Tunnels'));
      console.log(chalk.dim('    → 터널 선택 → Published applications → Add'));
      console.log();
      console.log(chalk.dim('  Brewnet 명령:'));
      console.log(`    ${chalk.cyan('brewnet domain tunnel status')}`);
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
  // 7. Start Admin Panel and open in browser
  // -------------------------------------------------------------------------
  const adminUrl = `http://localhost:${ADMIN_PORT}`;

  try {
    const admin = createAdminServer({
      port: ADMIN_PORT,
      projectPath: state.projectPath,
    });
    await admin.start();

    console.log(chalk.bold('  Admin Panel'));
    console.log(chalk.dim('    홈서버 관리 대시보드가 시작되었습니다.'));
    console.log(`    ${chalk.cyan.bold(adminUrl)}`);
    console.log(chalk.dim('    (Ctrl+C로 brewnet을 종료해도 서비스는 계속 실행됩니다)'));
    console.log();

    if (!options?.noOpen) {
      console.log(chalk.dim('  브라우저에서 Admin Panel을 열고 있습니다...'));
      try {
        const { execa } = await import('execa');
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        await execa(cmd, [adminUrl]);
      } catch { /* best-effort */ }
    }
  } catch {
    // Non-fatal — admin panel failure should not block completion
    console.log(chalk.dim(`  Admin Panel 시작 실패. 수동 실행: ${chalk.cyan('brewnet admin')}`));
    console.log();
  }
}
