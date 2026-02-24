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
 *     2. brew install --cask docker
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
import { platform } from 'node:os';

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
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the `docker` CLI is available in PATH.
 */
export async function isDockerInstalled(): Promise<boolean> {
  try {
    await execa('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Homebrew is available on macOS.
 */
async function checkHomebrew(): Promise<boolean> {
  try {
    await execa('brew', ['--version']);
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
      const result = await execa('docker', ['info'], { reject: false });
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
  // 1. Ensure Homebrew is present
  const hasBrew = await checkHomebrew();
  if (!hasBrew) {
    console.log();
    console.log('  Homebrew가 설치되지 않았습니다. Homebrew를 먼저 설치합니다.');
    console.log('  (관리자 비밀번호 입력이 필요할 수 있습니다)');
    console.log();

    try {
      await installHomebrew();
    } catch {
      return {
        success: false,
        message: 'Homebrew 설치에 실패했습니다. https://brew.sh 에서 수동으로 설치해주세요.',
      };
    }

    // Re-check brew is now available
    const brewAvailable = await checkHomebrew();
    if (!brewAvailable) {
      return {
        success: false,
        message:
          'Homebrew 설치 후에도 brew 명령을 찾을 수 없습니다. ' +
          '새 터미널을 열고 다시 시도하거나 https://brew.sh 를 참고하세요.',
      };
    }
  }

  // 2. Install Docker Desktop via Homebrew Cask
  console.log();
  console.log('  Homebrew를 통해 Docker Desktop을 설치합니다...');
  console.log();

  try {
    await execa('brew', ['install', '--cask', 'docker'], { stdio: 'inherit' });
  } catch {
    return {
      success: false,
      message: '`brew install --cask docker` 실패. 수동으로 설치해주세요: https://docs.docker.com/desktop/mac/',
    };
  }

  // 3. Launch Docker Desktop
  console.log();
  console.log('  Docker Desktop을 실행합니다...');

  try {
    await execa('open', ['-a', 'Docker'], { stdio: 'inherit' });
  } catch {
    // Non-fatal — daemon wait below will catch if this fails
  }

  return { success: true, message: 'Docker Desktop 설치 완료' };
}

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

async function installDockerLinux(): Promise<InstallResult> {
  console.log();
  console.log('  공식 Docker 설치 스크립트를 실행합니다. (sudo 권한 필요)');
  console.log();

  // 1. Download and run the official convenience script
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

  // 2. Start and enable Docker service
  try {
    await execa('sudo', ['systemctl', 'start', 'docker'], { stdio: 'inherit' });
    await execa('sudo', ['systemctl', 'enable', 'docker'], { stdio: 'inherit' });
  } catch {
    // systemctl may not be available on all Linux distros — non-fatal
  }

  // 3. Add current user to the docker group
  const currentUser = process.env['USER'] ?? process.env['LOGNAME'];
  if (currentUser) {
    try {
      await execa('sudo', ['usermod', '-aG', 'docker', currentUser], {
        stdio: 'inherit',
      });
    } catch {
      // Non-fatal — user can manually run: sudo usermod -aG docker $USER
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
