/**
 * Brewnet CLI — System Checker (Step 0 of the Init Wizard)
 *
 * Runs a series of pre-flight checks to verify that the host system meets
 * the minimum requirements for running Brewnet services:
 *
 *   - OS platform (macOS / Linux)
 *   - Docker Engine + Docker Compose
 *   - Node.js version (>= 20)
 *   - Available disk space
 *   - Available system memory (RAM)
 *   - Port availability (80, 443, 2222)
 *   - Git installation
 *
 * Every individual check function catches its own errors and returns a
 * {@link CheckResult} — they never throw. The {@link runAllChecks}
 * orchestrator runs ALL checks (no short-circuiting) and aggregates the
 * results.
 *
 * @module services/system-checker
 */

import { execa } from 'execa';
import { createServer } from 'node:net';
import os from 'node:os';
const { platform, release, totalmem } = os;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
  critical: boolean;
  /** One-line actionable fix hint shown on failure */
  remediation?: string;
}

export interface RunAllChecksResult {
  results: CheckResult[];
  hasCriticalFailure: boolean;
  warnings: CheckResult[];
}

// ---------------------------------------------------------------------------
// T036 — checkOS
// ---------------------------------------------------------------------------

export async function checkOS(): Promise<CheckResult> {
  try {
    const plat = platform();
    const rel = release();

    if (plat === 'darwin' || plat === 'linux') {
      const label = plat === 'darwin' ? 'macOS' : 'Linux';
      return {
        name: 'OS',
        status: 'pass',
        message: `${label} detected — supported platform`,
        details: `${plat} ${rel}`,
        critical: true,
      };
    }

    return {
      name: 'OS',
      status: 'fail',
      message: `Unsupported platform: ${plat}. Brewnet requires macOS or Linux.`,
      details: `${plat} ${rel}`,
      critical: true,
      remediation: 'macOS 12+ 또는 Ubuntu 20.04+에서 실행하세요.',
    };
  } catch (err) {
    return {
      name: 'OS',
      status: 'fail',
      message: 'Unable to determine operating system',
      details: String(err),
      critical: true,
      remediation: 'macOS 12+ 또는 Ubuntu 20.04+에서 실행하세요.',
    };
  }
}

// ---------------------------------------------------------------------------
// T037 — checkDocker
// ---------------------------------------------------------------------------

/**
 * Parse a major version number from a Docker version string.
 * Examples:
 *   "Docker version 27.0.3, build 7d4bcd8" → 27
 *   "Docker version 20.10.7, build f0df350" → 20
 */
function parseDockerMajor(stdout: string): number {
  const match = stdout.match(/(\d+)\.\d+/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function checkDocker(): Promise<CheckResult> {
  try {
    // 1) Check docker --version
    const versionResult = await execa('docker', ['--version']);
    const versionString = versionResult.stdout;
    const major = parseDockerMajor(versionString);

    // 2) Check docker compose version (verifies Docker Compose V2 is available)
    try {
      await execa('docker', ['compose', 'version']);
    } catch {
      // Docker Compose not available — Docker daemon may be down or compose missing
      return {
        name: 'Docker',
        status: 'fail',
        message: 'Docker daemon is not running or Docker Compose is not available (BN001)',
        details: versionString,
        critical: true,
        remediation: 'macOS: Docker Desktop 앱 실행 | Linux: sudo systemctl start docker',
      };
    }

    // 3) Version check — require >= 24.0
    if (major < 24) {
      return {
        name: 'Docker',
        status: 'fail',
        message: `Docker version ${major}.x is too old. Brewnet requires Docker 24.0+.`,
        details: versionString,
        critical: true,
        remediation: 'https://docs.docker.com/engine/install/ 에서 최신 Docker 설치 후 재시도하세요.',
      };
    }

    return {
      name: 'Docker',
      status: 'pass',
      message: 'Docker is installed and running',
      details: versionString,
      critical: true,
    };
  } catch {
    return {
      name: 'Docker',
      status: 'fail',
      message: 'Docker not found or not installed. Please install Docker and try again.',
      details: 'Install Docker: https://docs.docker.com/get-docker/',
      critical: true,
      remediation: 'macOS: Docker Desktop 앱 실행 | Linux: sudo systemctl start docker',
    };
  }
}

// ---------------------------------------------------------------------------
// T038 — checkNodeVersion
// ---------------------------------------------------------------------------

const MIN_NODE_MAJOR = 20;

export async function checkNodeVersion(): Promise<CheckResult> {
  try {
    // Try execa('node', ['--version']) first for testability,
    // fall back to process.version if execa fails.
    let version: string;
    try {
      const result = await execa('node', ['--version']);
      version = result.stdout.trim();
    } catch {
      version = process.version;
    }

    const match = version.match(/^v?(\d+)/);
    const major = match ? parseInt(match[1], 10) : 0;

    if (major >= MIN_NODE_MAJOR) {
      return {
        name: 'Node.js',
        status: 'pass',
        message: `Node.js ${version} detected`,
        details: version,
        critical: true,
      };
    }

    return {
      name: 'Node.js',
      status: 'fail',
      message: `Node.js ${version} is too old. Please install or upgrade to Node.js >= 20.`,
      details: `Found ${version}, minimum required is v20.0.0`,
      critical: true,
      remediation: 'https://nodejs.org/en/download/ 에서 v20+ 설치 후 재시도하세요.',
    };
  } catch (err) {
    return {
      name: 'Node.js',
      status: 'fail',
      message: 'Unable to determine Node.js version',
      details: String(err),
      critical: true,
    };
  }
}

// ---------------------------------------------------------------------------
// T039 — checkDiskSpace
// ---------------------------------------------------------------------------

/**
 * Parse available disk space in GB from `df` output.
 *
 * Supports two common output formats:
 *  - GB-based: header contains "G-blocks" → Available column value is in GB
 *  - KB-based: header contains "K-blocks" or "1K" → convert from KB to GB
 *  - Default fallback: if the value is > 10000, treat as KB; otherwise GB
 */
function parseDfAvailableGB(stdout: string): number {
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) return -1;

  const header = lines[0];
  const dataLine = lines[lines.length - 1]; // last line with actual data
  const fields = dataLine.trim().split(/\s+/);

  // Available is typically the 4th column (index 3)
  if (fields.length < 4) return -1;

  const availableRaw = parseInt(fields[3], 10);
  if (isNaN(availableRaw)) return -1;

  // Determine unit from header
  if (header.match(/G-blocks|1G/i)) {
    // Values are already in GB
    return availableRaw;
  }

  if (header.match(/K-blocks|1K/i)) {
    // Values are in 1K blocks — convert to GB
    return availableRaw / (1024 * 1024);
  }

  // Heuristic fallback: if the number is very large, assume KB
  if (availableRaw > 100000) {
    return availableRaw / (1024 * 1024);
  }

  // Otherwise assume GB
  return availableRaw;
}

export async function checkDiskSpace(minGB: number = 20): Promise<CheckResult> {
  try {
    const plat = platform();
    const dfArgs = plat === 'darwin' ? ['-g', '/'] : ['-BG', '/'];

    const result = await execa('df', dfArgs);
    const availableGB = parseDfAvailableGB(result.stdout);

    if (availableGB < 0) {
      return {
        name: 'Disk Space',
        status: 'warn',
        message: 'Unable to determine available disk space',
        details: result.stdout,
        critical: false,
      };
    }

    const roundedGB = Math.round(availableGB * 10) / 10;

    if (availableGB >= minGB) {
      return {
        name: 'Disk Space',
        status: 'pass',
        message: `${roundedGB}GB available disk space`,
        details: `${roundedGB}GB available (minimum: ${minGB}GB)`,
        critical: false,
      };
    }

    return {
      name: 'Disk Space',
      status: 'warn',
      message: `Low disk space: ${roundedGB}GB available (recommended: ${minGB}GB)`,
      details: `${roundedGB}GB available, ${minGB}GB recommended`,
      critical: false,
      remediation: '불필요한 파일을 삭제해 공간을 확보하세요. (df -h 로 확인)',
    };
  } catch {
    return {
      name: 'Disk Space',
      status: 'warn',
      message: 'Unable to check disk space',
      critical: false,
    };
  }
}

// ---------------------------------------------------------------------------
// T039 — checkMemory
// ---------------------------------------------------------------------------

export async function checkMemory(minGB: number = 2): Promise<CheckResult> {
  try {
    const totalBytes = totalmem();
    const totalGB = totalBytes / (1024 * 1024 * 1024);
    const roundedGB = Math.round(totalGB * 10) / 10;

    if (totalGB >= minGB) {
      return {
        name: 'Memory',
        status: 'pass',
        message: `${roundedGB}GB RAM detected`,
        details: `${roundedGB}GB total (minimum: ${minGB}GB)`,
        critical: false,
      };
    }

    return {
      name: 'Memory',
      status: 'warn',
      message: `Low memory: ${roundedGB}GB RAM (recommended: ${minGB}GB)`,
      details: `${roundedGB}GB total, ${minGB}GB recommended`,
      critical: false,
      remediation: '실행 중인 앱을 종료해 메모리를 확보하세요.',
    };
  } catch (err) {
    return {
      name: 'Memory',
      status: 'warn',
      message: 'Unable to determine system memory',
      details: String(err),
      critical: false,
    };
  }
}

// ---------------------------------------------------------------------------
// T040 — checkPort
// ---------------------------------------------------------------------------

export async function checkPort(port: number): Promise<CheckResult> {
  return new Promise<CheckResult>((resolve) => {
    try {
      const server = createServer();
      let resolved = false;

      const handleError = (err: NodeJS.ErrnoException): void => {
        if (resolved) return;
        resolved = true;

        if (err.code === 'EADDRINUSE') {
          resolve({
            name: `Port ${port}`,
            status: 'warn',
            message: `Port ${port} is already in use`,
            details: `Port ${port} is in use (EADDRINUSE). Another process is bound to this port.`,
            critical: false,
            remediation: `lsof -i :${port} 으로 프로세스 확인 후 종료하세요.`,
          });
        } else if (err.code === 'EACCES') {
          resolve({
            name: `Port ${port}`,
            status: 'warn',
            message: `Port ${port} requires elevated permissions`,
            details: `Port ${port} permission denied (EACCES). Try running with sudo or use a port >= 1024.`,
            critical: false,
            remediation: `sudo brewnet init 으로 재시도하거나 포트를 변경하세요.`,
          });
        } else {
          resolve({
            name: `Port ${port}`,
            status: 'warn',
            message: `Port ${port} check failed: ${err.message}`,
            details: `Port ${port}: ${err.code ?? err.message}`,
            critical: false,
          });
        }
      };

      server.on('error', handleError);

      server.listen(port, () => {
        if (resolved) return;
        resolved = true;
        server.close(() => {
          resolve({
            name: `Port ${port}`,
            status: 'pass',
            message: `Port ${port} is available`,
            details: `Port ${port}`,
            critical: false,
          });
        });
      });
    } catch (err) {
      resolve({
        name: `Port ${port}`,
        status: 'warn',
        message: `Port ${port} check failed`,
        details: String(err),
        critical: false,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// T041 — checkGit
// ---------------------------------------------------------------------------

export async function checkGit(): Promise<CheckResult> {
  try {
    const result = await execa('git', ['--version']);
    const version = result.stdout.trim();

    return {
      name: 'Git',
      status: 'pass',
      message: `Git is installed`,
      details: version,
      critical: false,
    };
  } catch {
    return {
      name: 'Git',
      status: 'warn',
      message: 'Git not found. Install Git for deployment features.',
      details: 'Git is not installed or not in PATH',
      critical: false,
      remediation: 'macOS: xcode-select --install | Linux: sudo apt-get install -y git',
    };
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — runAllChecks
// ---------------------------------------------------------------------------

const DEFAULT_PORTS = [80, 443, 2222];

export async function runAllChecks(): Promise<RunAllChecksResult> {
  const results: CheckResult[] = [];

  // Run all checks — never short-circuit
  try {
    results.push(await checkOS());
  } catch {
    results.push({
      name: 'OS',
      status: 'fail',
      message: 'OS check failed unexpectedly',
      critical: true,
    });
  }

  try {
    results.push(await checkDocker());
  } catch {
    results.push({
      name: 'Docker',
      status: 'fail',
      message: 'Docker check failed unexpectedly',
      critical: true,
    });
  }

  try {
    results.push(await checkNodeVersion());
  } catch {
    results.push({
      name: 'Node.js',
      status: 'fail',
      message: 'Node.js check failed unexpectedly',
      critical: true,
    });
  }

  try {
    results.push(await checkMemory());
  } catch {
    results.push({
      name: 'Memory',
      status: 'warn',
      message: 'Memory check failed unexpectedly',
      critical: false,
    });
  }

  try {
    results.push(await checkDiskSpace());
  } catch {
    results.push({
      name: 'Disk Space',
      status: 'warn',
      message: 'Disk space check failed unexpectedly',
      critical: false,
    });
  }

  // Check default ports
  for (const port of DEFAULT_PORTS) {
    try {
      results.push(await checkPort(port));
    } catch {
      results.push({
        name: `Port ${port}`,
        status: 'warn',
        message: `Port ${port} check failed unexpectedly`,
        critical: false,
      });
    }
  }

  try {
    results.push(await checkGit());
  } catch {
    results.push({
      name: 'Git',
      status: 'warn',
      message: 'Git check failed unexpectedly',
      critical: false,
    });
  }

  // Compute aggregates
  const hasCriticalFailure = results.some(
    (r) => r.status === 'fail' && r.critical === true,
  );

  const warnings = results.filter((r) => r.status === 'warn');

  return {
    results,
    hasCriticalFailure,
    warnings,
  };
}
