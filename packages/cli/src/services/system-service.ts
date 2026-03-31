/**
 * OS-level service registration for the Brewnet admin server.
 *
 * Supports:
 *   - macOS: ~/Library/LaunchAgents/com.brewnet.admin.plist (LaunchAgent)
 *   - Linux: ~/.config/systemd/user/brewnet-admin.service (systemd user unit)
 *
 * The admin server runs in --foreground mode under the OS service manager,
 * which handles process lifecycle (start on login/boot, restart on crash).
 *
 * @module services/system-service
 */

import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execa } from 'execa';

export interface InstallOptions {
  /** Absolute path to the brewnet binary (e.g. /usr/local/bin/brewnet) */
  brewnetBin: string;
  /** Admin panel port (default 8088) */
  port: number;
  /** Target platform — defaults to process.platform */
  platform?: string;
  /** Optional project path forwarded as --path */
  projectPath?: string;
}

const LAUNCHAGENT_LABEL = 'com.brewnet.admin';
const SYSTEMD_SERVICE_NAME = 'brewnet-admin';

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

/**
 * Returns the OS service file path for the given platform, or null if
 * the platform is not supported.
 */
export function getServiceFilePath(platform: string): string | null {
  const home = homedir();
  if (platform === 'darwin') {
    return join(home, 'Library', 'LaunchAgents', `${LAUNCHAGENT_LABEL}.plist`);
  }
  if (platform === 'linux') {
    return join(home, '.config', 'systemd', 'user', `${SYSTEMD_SERVICE_NAME}.service`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Install status
// ---------------------------------------------------------------------------

export function isBrewnetServiceInstalled(platform: string = process.platform): boolean {
  const filePath = getServiceFilePath(platform);
  if (!filePath) return false;
  return existsSync(filePath);
}

// ---------------------------------------------------------------------------
// macOS plist
// ---------------------------------------------------------------------------

function buildPlist(opts: InstallOptions): string {
  const logDir = join(homedir(), '.brewnet', 'logs');
  const logFile = join(logDir, 'admin-server.log');

  const portArgs =
    opts.port !== 8088
      ? `\t\t<string>--port</string>\n\t\t<string>${opts.port}</string>\n`
      : '';

  const pathArgs = opts.projectPath
    ? `\t\t<string>--path</string>\n\t\t<string>${opts.projectPath}</string>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${LAUNCHAGENT_LABEL}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${opts.brewnetBin}</string>
\t\t<string>admin</string>
\t\t<string>--foreground</string>
\t\t<string>--no-open</string>
${portArgs}${pathArgs}\t</array>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<true/>
\t<key>StandardOutPath</key>
\t<string>${logFile}</string>
\t<key>StandardErrorPath</key>
\t<string>${logFile}</string>
</dict>
</plist>
`;
}

// ---------------------------------------------------------------------------
// Linux systemd unit
// ---------------------------------------------------------------------------

function buildSystemdUnit(opts: InstallOptions): string {
  const portFlag = opts.port !== 8088 ? ` --port ${opts.port}` : '';
  const pathFlag = opts.projectPath ? ` --path ${opts.projectPath}` : '';

  return `[Unit]
Description=Brewnet Admin Server
After=network.target

[Service]
Type=simple
ExecStart=${opts.brewnetBin} admin --foreground --no-open${portFlag}${pathFlag}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Write the OS service file and activate it.
 * Throws for unsupported platforms.
 */
export async function installBrewnetService(opts: InstallOptions): Promise<void> {
  const platform = opts.platform ?? process.platform;
  const filePath = getServiceFilePath(platform);

  if (!filePath) {
    throw new Error(`brewnet service install is not supported on platform: ${platform}`);
  }

  if (platform === 'darwin') {
    const dir = join(homedir(), 'Library', 'LaunchAgents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, buildPlist(opts), 'utf-8');
    // Unload first if already loaded (best-effort)
    await execa('launchctl', ['unload', '-w', filePath], { reject: false });
    await execa('launchctl', ['load', '-w', filePath]);
    return;
  }

  if (platform === 'linux') {
    const dir = join(homedir(), '.config', 'systemd', 'user');
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, buildSystemdUnit(opts), 'utf-8');
    await execa('systemctl', ['--user', 'daemon-reload']);
    await execa('systemctl', ['--user', 'enable', '--now', SYSTEMD_SERVICE_NAME]);
    return;
  }
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

/**
 * Stop, disable, and remove the OS service file.
 * Returns true if the service was installed and removed, false otherwise.
 */
export async function uninstallBrewnetService(platform: string = process.platform): Promise<boolean> {
  const filePath = getServiceFilePath(platform);
  if (!filePath || !existsSync(filePath)) return false;

  if (platform === 'darwin') {
    await execa('launchctl', ['unload', '-w', filePath], { reject: false });
    unlinkSync(filePath);
    return true;
  }

  if (platform === 'linux') {
    await execa('systemctl', ['--user', 'stop', SYSTEMD_SERVICE_NAME], { reject: false });
    await execa('systemctl', ['--user', 'disable', SYSTEMD_SERVICE_NAME], { reject: false });
    unlinkSync(filePath);
    await execa('systemctl', ['--user', 'daemon-reload'], { reject: false });
    return true;
  }

  return false;
}
