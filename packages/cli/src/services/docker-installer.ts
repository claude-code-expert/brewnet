/**
 * Brewnet CLI — Docker Installer
 *
 * Handles automatic Docker installation when `brewnet init` is run on a system
 * without Docker. Supports macOS (via Homebrew) and Linux (via the official
 * Docker convenience script).
 *
 * Platform-specific flows:
 *
 *   macOS:
 *     1. Check for Homebrew — install if missing
 *     2. brew install --cask docker  (skipped if /Applications/Docker.app exists)
 *     3. open -a Docker (launch Docker Desktop)
 *     4. Poll until Docker daemon is ready (max 90s)
 *
 *   Linux:
 *     1. Download get.docker.com convenience script
 *     2. sudo sh /tmp/get-docker.sh
 *     3. sudo systemctl start docker && sudo systemctl enable docker
 *     4. sudo usermod -aG docker $USER
 *     5. Poll until Docker daemon is ready (max 30s)
 *
 * All commands that require user interaction (sudo password, Homebrew install)
 * use `stdio: 'inherit'` to pass through to the user's terminal.
 *
 * @module services/docker-installer
 */

import { execa } from 'execa';
import os from 'node:os';
import ora from 'ora';
import chalk from 'chalk';
const { platform } = os;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallResult {
  success: boolean;
  message: string;
  /** true if user needs to re-login for docker group changes (Linux only) */
  requiresRelogin?: boolean;
}

// ---------------------------------------------------------------------------
// PATH augmentation
// ---------------------------------------------------------------------------

/**
 * Build an env object with an augmented PATH that includes all common
 * Docker / Homebrew install locations.
 *
 * macOS Node.js processes often inherit only /usr/bin:/bin:/usr/sbin:/sbin —
 * /usr/local/bin (Docker Desktop CLI) and /opt/homebrew/bin (Apple Silicon
 * Homebrew) are missing.  We prepend them so every execa('docker', ...) and
 * execa('brew', ...) call can resolve the binary regardless of how brewnet
 * was launched.
 */
function augmentedEnv(): NodeJS.ProcessEnv {
  const base = process.env['PATH'] ?? '/usr/bin:/bin:/usr/sbin:/sbin';
  const extra = '/usr/local/bin:/opt/homebrew/bin';
  // Avoid duplicating entries that are already in base
  const combined = extra
    .split(':')
    .filter((p) => !base.split(':').includes(p))
    .concat(base.split(':'))
    .join(':');
  return { ...process.env, PATH: combined };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the `docker` CLI is available anywhere on this machine.
 *
 * Uses an augmented PATH so detection works even when Node.js was started
 * with a restricted PATH (common when launched from npm global scripts).
 */
export async function isDockerInstalled(): Promise<boolean> {
  try {
    await execa('docker', ['--version'], { env: augmentedEnv() });
    return true;
  } catch { /* not found in augmented PATH */ }

  // Final fallback: Docker Desktop app bundle exists (CLI symlink not yet created)
  try {
    await execa('test', ['-d', '/Applications/Docker.app']);
    return true;
  } catch { /* no app bundle */ }

  return false;
}

/**
 * Check if Homebrew is available on macOS.
 */
async function checkHomebrew(): Promise<boolean> {
  try {
    await execa('brew', ['--version'], { env: augmentedEnv() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install Homebrew using the official installer script.
 * Passes through to the terminal so the user can provide their password.
 */
async function installHomebrew(): Promise<void> {
  await execa(
    '/bin/bash',
    ['-c', 'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash'],
    { stdio: 'inherit' },
  );
}

/**
 * Launch Docker Desktop on macOS.
 *
 * Tries direct app bundle path first (`open /Applications/Docker.app`),
 * which works reliably even right after installation when Spotlight hasn't
 * indexed the new app yet.  Falls back to `open -a Docker` as a secondary
 * attempt (covers non-standard install locations).
 *
 * Never throws.
 */
export async function launchDockerDesktop(): Promise<{ success: boolean; error?: string }> {
  // Attempt 1: direct bundle path — unaffected by Spotlight indexing delay
  try {
    const r = await execa('open', ['/Applications/Docker.app'], {
      env: augmentedEnv(),
      reject: false,
    });
    if (r.exitCode === 0) return { success: true };
    // exitCode !== 0 means the .app doesn't exist at this path — try -a fallback
  } catch { /* fall through */ }

  // Attempt 2: Spotlight-based lookup (covers Docker installed elsewhere)
  try {
    const r = await execa('open', ['-a', 'Docker'], {
      env: augmentedEnv(),
      reject: false,
    });
    if (r.exitCode === 0) return { success: true };
    const errMsg = r.stderr?.trim() || r.stdout?.trim() || `exit code ${r.exitCode}`;
    return { success: false, error: errMsg };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run `docker info` and return the error output for diagnostic purposes.
 * Useful for showing the user exactly why the daemon isn't responding.
 * Never throws — returns an empty string if Docker is running normally.
 */
export async function getDaemonDiagnostics(): Promise<string> {
  try {
    const result = await execa('docker', ['info'], {
      env: augmentedEnv(),
      reject: false,
      timeout: 5000,
    });
    if (result.exitCode === 0) return '';
    return result.stderr?.trim() || result.stdout?.trim() || '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Check if the Docker daemon is currently running (single instant check).
 * Returns true only if `docker info` exits with 0 right now.
 */
export async function isDaemonRunning(): Promise<boolean> {
  try {
    const result = await execa('docker', ['info'], {
      env: augmentedEnv(),
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Poll the Docker daemon until it is ready or the timeout expires.
 *
 * @param timeoutMs  Maximum wait time in milliseconds
 * @param intervalMs Poll interval in milliseconds (default 2s)
 * @returns true if daemon became ready, false if timed out
 */
export async function waitForDockerDaemon(
  timeoutMs: number,
  intervalMs = 2000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await execa('docker', ['info'], {
        env: augmentedEnv(),
        reject: false,
      });
      if (result.exitCode === 0) return true;
    } catch {
      // Ignore errors — daemon not ready yet
    }
    await sleep(intervalMs);
  }

  return false;
}

// ---------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------

async function installDockerMacOS(): Promise<InstallResult> {
  // ── Stage 1/3: Homebrew ──────────────────────────────────────────────────
  const s1 = ora({ text: '[1/3] Homebrew 확인 중...', indent: 2 }).start();
  const hasBrew = await checkHomebrew();

  if (!hasBrew) {
    s1.warn('[1/3] Homebrew 미설치 — 먼저 설치합니다');
    console.log();
    console.log(chalk.dim('  (관리자 비밀번호 입력이 필요할 수 있습니다)'));
    console.log();

    try {
      await installHomebrew();
    } catch {
      return {
        success: false,
        message: 'Homebrew 설치에 실패했습니다. https://brew.sh 에서 수동으로 설치해주세요.',
      };
    }

    const brewAvailable = await checkHomebrew();
    if (!brewAvailable) {
      return {
        success: false,
        message:
          'Homebrew 설치 후에도 brew 명령을 찾을 수 없습니다. ' +
          '새 터미널을 열고 다시 시도하거나 https://brew.sh 를 참고하세요.',
      };
    }

    console.log(chalk.green('  ✔ Homebrew 설치 완료'));
    console.log();
  } else {
    s1.succeed('[1/3] Homebrew 확인됨');
  }

  // ── Stage 2/3: brew install --cask docker ───────────────────────────────
  // Skip if Docker.app already exists — avoids brew hang when Docker was
  // installed via .dmg or a previous brew run that succeeded partially.
  const dockerAppExists = await (async () => {
    try { await execa('test', ['-d', '/Applications/Docker.app']); return true; }
    catch { return false; }
  })();

  if (dockerAppExists) {
    console.log(chalk.dim('  [2/3] Docker Desktop이 이미 설치되어 있습니다. 건너뜁니다.'));
  } else {
    const s2 = ora({
      text: '[2/3] Docker Desktop 다운로드 중... (~600MB, 수 분 소요)',
      indent: 2,
    }).start();

    // Accumulate brew stderr so we can surface it on failure.
    const brewErrLines: string[] = [];

    try {
      // stdin: 'inherit' lets macOS system dialogs pass through to the terminal.
      const child = execa('brew', ['install', '--cask', 'docker-desktop'], {
        env: augmentedEnv(),
        stdin: 'inherit',
      });

      const onBrewLine = (line: string) => {
        if (/==> Downloading/i.test(line)) {
          s2.text = '[2/3] Docker Desktop 다운로드 중... (~600MB)';
        } else if (/^\s*#{3,}/.test(line)) {
          const pct = line.match(/(\d+(?:\.\d+)?)%/);
          if (pct) s2.text = `[2/3] Docker Desktop 다운로드 중... ${Math.round(Number(pct[1]))}%`;
        } else if (/==> Verifying/i.test(line)) {
          s2.text = '[2/3] 파일 무결성 검증 중...';
        } else if (/==> Installing/i.test(line)) {
          s2.text = '[2/3] Docker Desktop 설치 중...';
        } else if (/==> Moving/i.test(line)) {
          s2.text = '[2/3] Applications 폴더로 이동 중...';
        } else if (/already installed/i.test(line)) {
          s2.text = '[2/3] Docker Desktop 이미 설치됨 (brew 기록)';
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        chunk.toString().split('\n').forEach(onBrewLine);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(onBrewLine);
        lines.forEach((l) => { if (l.trim()) brewErrLines.push(l.trim()); });
      });

      await child;

      // Verify the app bundle actually landed in /Applications.
      // brew exits 0 in several cases that leave no app:
      //   - "already installed" (brew DB has a record but .app was manually deleted)
      //   - macOS Gatekeeper blocked the move
      //   - partial previous install left brew thinking it is done
      const appNowExists = await (async () => {
        try { await execa('test', ['-d', '/Applications/Docker.app']); return true; }
        catch { return false; }
      })();

      if (!appNowExists) {
        const detail = brewErrLines.slice(-3).join(' | ') || 'brew 출력 없음';
        s2.fail(`[2/3] Docker Desktop 설치 실패 — brew 완료 후 앱 번들 없음`);
        console.log(chalk.dim(`    brew 출력: ${detail}`));
        return {
          success: false,
          message:
            'brew install --cask docker 가 exit 0을 반환했지만 /Applications/Docker.app 이 없습니다.\n' +
            '  아래 명령으로 직접 재설치해주세요:\n' +
            '    brew reinstall --cask docker\n' +
            '  또는 수동 설치: https://docs.docker.com/desktop/mac/',
        };
      }

      s2.succeed('[2/3] Docker Desktop 설치 완료');
    } catch (err) {
      const detail = brewErrLines.slice(-3).join(' | ')
        || (err instanceof Error ? err.message : String(err));
      s2.fail(`[2/3] Docker Desktop 설치 실패: ${detail}`);
      return {
        success: false,
        message: `brew install --cask docker-desktop 실패: ${detail}\n수동 설치: https://docs.docker.com/desktop/mac/`,
      };
    }
  }

  return { success: true, message: 'Docker Desktop 설치 완료' };
}

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

async function installDockerLinux(): Promise<InstallResult> {
  // ── Stage 1/3: 설치 스크립트 실행 (sudo — TTY 필요) ────────────────────
  console.log();
  console.log(chalk.bold('  [1/3] Docker 설치 스크립트 실행 중...'));
  console.log(chalk.dim('  (sudo 비밀번호 입력이 필요할 수 있습니다)'));
  console.log();

  try {
    await execa(
      'sh',
      ['-c', 'curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sudo sh /tmp/get-docker.sh'],
      { stdio: 'inherit' },
    );
  } catch {
    return {
      success: false,
      message: 'Docker 설치 스크립트 실행 실패. 수동으로 설치해주세요: https://docs.docker.com/engine/install/',
    };
  }

  console.log();
  console.log(chalk.green('  ✔ [1/3] Docker 설치 완료'));
  console.log();

  // ── Stage 2/3: 서비스 시작 ───────────────────────────────────────────────
  const s2 = ora({ text: '[2/3] Docker 서비스 시작 중...', indent: 2 }).start();
  try {
    await execa('sudo', ['systemctl', 'start', 'docker'], { reject: false });
    await execa('sudo', ['systemctl', 'enable', 'docker'], { reject: false });
    s2.succeed('[2/3] Docker 서비스 시작됨');
  } catch {
    s2.warn('[2/3] Docker 서비스 자동 시작 실패 — 수동으로 시작: sudo systemctl start docker');
  }

  // ── Stage 3/3: docker 그룹 추가 ─────────────────────────────────────────
  const currentUser = process.env['USER'] ?? process.env['LOGNAME'];
  if (currentUser) {
    const s3 = ora({ text: `[3/3] docker 그룹에 ${currentUser} 추가 중...`, indent: 2 }).start();
    try {
      await execa('sudo', ['usermod', '-aG', 'docker', currentUser], { reject: false });
      s3.succeed(`[3/3] docker 그룹에 ${currentUser} 추가됨`);
    } catch {
      s3.warn('[3/3] docker 그룹 추가 실패 — 수동으로 실행: sudo usermod -aG docker $USER');
    }
  }

  return {
    success: true,
    message: 'Docker 설치 완료',
    requiresRelogin: true,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Install Docker for the current platform.
 *
 * Handles macOS (Docker Desktop via Homebrew) and Linux
 * (official convenience script + systemctl).
 *
 * After a successful install, the caller should invoke
 * {@link waitForDockerDaemon} to confirm the daemon is ready.
 */
export async function installDocker(): Promise<InstallResult> {
  const plat = platform();

  if (plat === 'darwin') {
    return installDockerMacOS();
  }

  if (plat === 'linux') {
    return installDockerLinux();
  }

  return {
    success: false,
    message: `지원되지 않는 플랫폼: ${plat}. macOS 또는 Linux에서 실행해주세요.`,
  };
}
