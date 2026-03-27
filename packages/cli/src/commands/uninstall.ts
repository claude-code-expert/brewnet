/**
 * brewnet uninstall — Complete uninstall
 *
 * Removes all Brewnet services, volumes, networks, project files,
 * and ~/.brewnet metadata. Accepts --dry-run, --keep-data,
 * --keep-config, and --force flags.
 *
 * @module commands/uninstall
 */

import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { Command } from 'commander';
import chalk from 'chalk';
import { confirm, select } from '@inquirer/prompts';
import {
  buildUninstallTargets,
  listInstallations,
  runUninstall,
} from '../services/uninstall-manager.js';
import { getLastProject, loadState } from '../wizard/state.js';
import { listDomainConnections } from '../services/project-db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printTargets(
  targets: ReturnType<typeof buildUninstallTargets>,
): void {
  for (const t of targets) {
    const tag = t.skipped
      ? chalk.dim(`  [skip] ${t.label} (${t.skipReason ?? 'preserved'})`)
      : chalk.red(`  [remove] ${t.label}`);
    console.log(tag);
  }
}

/**
 * Stop cloudflared system service and remove the plist/systemd unit.
 * Requires sudo — prompts the user for their password.
 */
async function cleanupCloudflaredService(): Promise<void> {
  const { execa: execaFn } = await import('execa');
  const os = platform();

  if (os === 'darwin') {
    const plist = '/Library/LaunchDaemons/com.cloudflare.cloudflared.plist';
    if (!existsSync(plist)) return;

    console.log(chalk.dim('  cloudflared 시스템 서비스 정리 중... (sudo 비밀번호 필요)'));
    try {
      await execaFn('sudo', ['launchctl', 'bootout', 'system/com.cloudflare.cloudflared'], { stdio: 'inherit', reject: false });
      await execaFn('sudo', ['rm', '-f', plist], { stdio: 'inherit' });
      console.log(chalk.green('  ✓ cloudflared LaunchDaemon 서비스 제거 완료'));
    } catch (err) {
      console.log(chalk.yellow(`  ⚠  cloudflared 서비스 제거 실패: ${err instanceof Error ? err.message : err}`));
    }
  } else if (os === 'linux') {
    // systemd service
    try {
      const { exitCode } = await execaFn('systemctl', ['is-active', 'cloudflared'], { reject: false });
      if (exitCode !== 0) return; // not installed or not active

      console.log(chalk.dim('  cloudflared 시스템 서비스 정리 중... (sudo 비밀번호 필요)'));
      await execaFn('sudo', ['systemctl', 'stop', 'cloudflared'], { stdio: 'inherit', reject: false });
      await execaFn('sudo', ['systemctl', 'disable', 'cloudflared'], { stdio: 'inherit', reject: false });
      await execaFn('sudo', ['rm', '-f', '/etc/systemd/system/cloudflared.service'], { stdio: 'inherit', reject: false });
      await execaFn('sudo', ['systemctl', 'daemon-reload'], { stdio: 'inherit', reject: false });
      console.log(chalk.green('  ✓ cloudflared systemd 서비스 제거 완료'));
    } catch (err) {
      console.log(chalk.yellow(`  ⚠  cloudflared 서비스 제거 실패: ${err instanceof Error ? err.message : err}`));
    }
  }
}

// ---------------------------------------------------------------------------
// Command registration (T114 + T115)
// ---------------------------------------------------------------------------

export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description('Remove all Brewnet services, volumes, and project files')
    .option('--dry-run', 'List what would be removed without making changes')
    .option('--keep-data', 'Preserve Docker volumes (database and file data)')
    .option('--keep-config', 'Preserve project directory (stop containers only)')
    .option('--force', 'Skip confirmation prompt')
    .action(
      async (options: {
        dryRun: boolean;
        keepData: boolean;
        keepConfig: boolean;
        force: boolean;
      }) => {
        // --- Gather project info ---
        const installations = listInstallations();
        let lastProject = getLastProject();
        let state = lastProject ? loadState(lastProject) : null;
        let discoveredPath: string | null = null;

        // If wizard state is missing but filesystem scan found installations,
        // pick the target from discovered projects instead.
        if (!state && installations.length > 0) {
          let picked = installations[0];
          if (installations.length > 1) {
            picked = await select({
              message: '삭제할 프로젝트를 선택하세요',
              choices: installations.map((inst) => ({
                value: inst,
                name: `${inst.name}  ${chalk.dim(inst.path ?? '')}`,
              })),
            });
          }
          lastProject = picked.name;
          state = lastProject ? loadState(lastProject) : null;
          discoveredPath = picked.path ?? null;
        }

        // --- Dry-run banner ---
        if (options.dryRun) {
          console.log(chalk.cyan('\nDry-run mode — no changes will be made.\n'));
        }

        // --- Show what is installed ---
        if (installations.length === 0) {
          console.log(chalk.yellow('No Brewnet installations found in wizard state.'));
          console.log(chalk.dim('  Checking for orphaned Docker resources...\n'));

          // Even without project state, try to clean up brewnet-* containers/volumes/networks
          if (!options.dryRun) {
            const { execa: execaFn } = await import('execa');
            const env = { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env['PATH'] ?? ''}` };

            // Stop & remove brewnet-* containers
            const psResult = await execaFn('docker', ['ps', '-a', '--filter', 'name=brewnet', '-q'], { env, reject: false });
            const containerIds = psResult.stdout.trim().split('\n').filter(Boolean);
            if (containerIds.length > 0) {
              await execaFn('docker', ['rm', '-f', ...containerIds], { env, reject: false });
              console.log(chalk.green(`  ✓ Removed ${containerIds.length} orphaned container(s)`));
            }

            // Remove brewnet-* volumes
            const volResult = await execaFn('docker', ['volume', 'ls', '--filter', 'name=brewnet', '-q'], { env, reject: false });
            const volNames = volResult.stdout.trim().split('\n').filter(Boolean);
            if (volNames.length > 0) {
              await execaFn('docker', ['volume', 'rm', ...volNames], { env, reject: false });
              console.log(chalk.green(`  ✓ Removed ${volNames.length} orphaned volume(s)`));
            }

            // Remove brewnet-* networks
            const netResult = await execaFn('docker', ['network', 'ls', '--filter', 'name=brewnet', '-q'], { env, reject: false });
            const netIds = netResult.stdout.trim().split('\n').filter(Boolean);
            if (netIds.length > 0) {
              await execaFn('docker', ['network', 'rm', ...netIds], { env, reject: false });
              console.log(chalk.green(`  ✓ Removed ${netIds.length} orphaned network(s)`));
            }

            if (containerIds.length === 0 && volNames.length === 0 && netIds.length === 0) {
              console.log(chalk.dim('  Nothing to remove.'));
            }
          }
          return;
        }

        console.log(chalk.bold('\nInstalled projects:'));
        for (const inst of installations) {
          const isCurrent = inst.name === lastProject;
          console.log(
            `  ${isCurrent ? chalk.green('▶') : ' '} ${chalk.cyan(inst.name)}  ${chalk.dim(inst.path ?? '(path unknown)')}`,
          );
        }

        console.log(
          chalk.yellow(
            '\n  ⚠  CAUTION: This is a clean uninstall. All Brewnet services,\n' +
            '     containers, volumes, and project files will be removed.\n',
          ),
        );

        // --- Build target list ---
        // Use wizard state path first, then discovered filesystem path
        const projectPath = state?.projectPath ?? discoveredPath ?? null;
        const targets = buildUninstallTargets(projectPath, {
          keepData: options.keepData,
          keepConfig: options.keepConfig,
        });

        console.log(chalk.bold('\nThe following will be removed:'));
        printTargets(targets);

        if (!options.keepData) {
          console.log(
            chalk.yellow(
              '\n  ⚠  WARNING: Database and file server data will be permanently deleted.',
            ),
          );
          console.log(chalk.dim('     Use --keep-data to preserve volumes.'));
        }

        // --- Dry-run: stop here ---
        if (options.dryRun) {
          console.log(chalk.dim('\nDry-run complete. No changes made.'));
          return;
        }

        // --- Confirmation prompt (skip with --force) ---
        if (!options.force) {
          let confirmed = false;
          try {
            confirmed = await confirm({
              message: chalk.red('Proceed with uninstall? This cannot be undone.'),
              default: false,
            });
          } catch {
            // Ctrl+C or non-interactive
            console.log(chalk.dim('\nAborted.'));
            return;
          }

          if (!confirmed) {
            console.log(chalk.dim('Aborted.'));
            return;
          }
        }

        // --- Run uninstall ---
        console.log('');
        const result = await runUninstall({
          keepData: options.keepData,
          keepConfig: options.keepConfig,
          force: options.force,
          projectPath: projectPath ?? undefined,
          projectName: lastProject || undefined,
        });

        // --- Display results ---
        for (const item of result.removed) {
          console.log(`  ${chalk.green('✓')} Removed: ${item}`);
        }
        for (const item of result.skipped) {
          console.log(`  ${chalk.dim('○')} Skipped: ${chalk.dim(item)}`);
        }
        for (const err of result.errors) {
          console.log(`  ${chalk.red('✗')} Error: ${chalk.red(err)}`);
        }

        if (result.success) {
          console.log(chalk.green('\n✓ Uninstall complete.\n'));
        } else {
          console.log(chalk.yellow('\n⚠  Uninstall completed with errors.\n'));
          process.exitCode = 1;
        }

        // --- Cloudflare Tunnel cleanup (context-aware) ---
        // Run cleanup whenever CF credentials are present, regardless of tunnelMode.
        // Quick Tunnel projects that were later upgraded to Named Tunnel have credentials
        // and DNS records that must be cleaned up.
        if (state?.domain?.cloudflare) {
          const cf = state.domain.cloudflare;
          const { apiToken, accountId, tunnelId, tunnelName, zoneName, zoneId } = cf;
          const tunnelMode = cf.tunnelMode;

          if (apiToken && accountId && tunnelId) {
            console.log(chalk.dim('\n  Cloudflare 리소스 정리 중...'));

            if (zoneId) {
              try {
                const { getDnsRecords, deleteDnsRecord, getActiveServiceRoutes } = await import('../services/cloudflare-client.js');
                const tunnelTarget = `${tunnelId}.cfargotunnel.com`;
                const allRecords: Array<{ id: string; name: string; content: string }> = [];

                // Build full hostname list: builtin service routes + app domain connections
                // Bug fix: previously only app connections were included, missing git/cloud/files/media/pgadmin
                const builtinHostnames = zoneName
                  ? getActiveServiceRoutes(state).map((r) => `${r.subdomain}.${zoneName}`)
                  : [];
                const appHostnames: string[] = [];
                const domainConns = listDomainConnections(projectPath ?? process.cwd());
                for (const conn of domainConns) {
                  appHostnames.push(conn.hostname);
                  // apex connection: also clean up www DNS record
                  if (conn.subdomain === '@' && conn.domain) {
                    appHostnames.push(`www.${conn.domain}`);
                  }
                }
                const hostnames = [...new Set([...builtinHostnames, ...appHostnames])];

                for (const hostname of hostnames) {
                  const recs = await getDnsRecords(apiToken, zoneId, hostname);
                  allRecords.push(...recs.filter((r) => r.content === tunnelTarget));
                }
                for (const rec of allRecords) {
                  await deleteDnsRecord(apiToken, zoneId, rec.id);
                }
                if (allRecords.length > 0) {
                  console.log(chalk.green(`  ✓ DNS CNAME 레코드 ${allRecords.length}개 삭제`));
                }
              } catch (dnsErr) {
                console.log(chalk.yellow(`  ⚠  DNS 레코드 삭제 실패: ${dnsErr instanceof Error ? dnsErr.message : dnsErr}`));
              }
            }

            try {
              const { deleteTunnel } = await import('../services/cloudflare-client.js');
              await deleteTunnel(apiToken, accountId, tunnelId, { cascade: true });
              console.log(chalk.green(`  ✓ Cloudflare Tunnel "${tunnelName || tunnelId}" 삭제 완료`));
            } catch (tunErr) {
              console.log(chalk.yellow(`  ⚠  터널 자동 삭제 실패: ${tunErr instanceof Error ? tunErr.message : tunErr}`));
              console.log(chalk.dim('     CF 대시보드에서 수동 삭제하세요:'));
              console.log(chalk.dim('     → https://one.dash.cloudflare.com → Networks → Tunnels'));
              if (tunnelName) console.log(chalk.dim(`     → "${tunnelName}" 선택 → Delete`));
            }

            // Stop and remove local cloudflared system service (macOS / Linux)
            await cleanupCloudflaredService();
          } else if (tunnelMode === 'named') {
            // Named tunnel configured but no API token — manual cleanup guide
            console.log(chalk.yellow('\n  ⚠  Cloudflare Named Tunnel 리소스가 남아있습니다.'));
            console.log(chalk.dim('     API 토큰이 없어 자동 삭제가 불가합니다.'));
            console.log(chalk.dim('     CF 대시보드에서 수동 삭제하세요:\n'));
            console.log(chalk.dim('     1. 터널 삭제:'));
            console.log(chalk.dim('        → https://one.dash.cloudflare.com → Networks → Tunnels'));
            if (tunnelName) console.log(chalk.dim(`        → "${tunnelName}" 선택 → Delete`));
            if (zoneName) {
              console.log(chalk.dim('     2. DNS CNAME 레코드 삭제:'));
              console.log(chalk.dim(`        → ${zoneName} → DNS → Records`));
              console.log(chalk.dim('        → *.cfargotunnel.com 을 가리키는 CNAME 삭제'));
            }
          } else {
            // Quick Tunnel with no CF credentials — nothing to clean up on CF side
            console.log(chalk.dim('  Quick Tunnel은 계정 연동이 없어 CF 측 정리가 필요 없습니다.'));
          }
          console.log();
        }

        // --- Re-install hint ---
        console.log(
          chalk.dim(
            '  To reinstall, run:\n' +
              `  ${chalk.bold('curl -fsSL https://raw.githubusercontent.com/claude-code-expert/brewnet/main/install.sh | bash')}`,
          ),
        );
      },
    );
}
