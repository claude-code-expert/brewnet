/**
 * QuickTunnelManager — manages Cloudflare Quick Tunnel via Docker.
 *
 * Quick Tunnel runs `cloudflared tunnel --url http://traefik:80` and
 * auto-assigns a *.trycloudflare.com URL. No Cloudflare account is required.
 *
 * The manager:
 *   1. Starts the cloudflared container (quick-tunnel variant)
 *   2. Streams container logs to extract the assigned *.trycloudflare.com URL
 *   3. Exposes the URL for use in the wizard and Step 7 display
 *   4. Provides a stop() method to shut down the container
 *
 * URL regex: /https?:\/\/([\w-]+\.trycloudflare\.com)/i
 * Timeout: 30 seconds to capture URL
 *
 * @module services/quick-tunnel
 */

import Dockerode from 'dockerode';
import type { TunnelLogger } from '../utils/tunnel-logger.js';

const CONTAINER_NAME = 'brewnet-tunnel-quick';
const CLOUDFLARED_IMAGE = 'cloudflare/cloudflared:latest';
// Real quick-tunnel URLs always contain at least one hyphen in the subdomain
// (e.g. "purple-meadow-abc123.trycloudflare.com").
// This prevents matching internal CF API endpoints like "api.trycloudflare.com"
// that appear in cloudflared logs before the actual tunnel URL is assigned.
const URL_REGEX = /https?:\/\/([\w]+-[\w][\w-]*\.trycloudflare\.com)/i;
const URL_TIMEOUT_MS = 30_000;

export class QuickTunnelManager {
  private docker: Dockerode;
  private logger: TunnelLogger;
  private capturedUrl = '';
  private containerId = '';

  constructor(logger: TunnelLogger, dockerSocket?: string) {
    this.docker = dockerSocket
      ? new Dockerode({ socketPath: dockerSocket })
      : new Dockerode();
    this.logger = logger;
  }

  /** Returns the last captured Quick Tunnel URL, or empty string if not yet started. */
  getUrl(): string {
    return this.capturedUrl;
  }

  /**
   * Start the Quick Tunnel container and wait for the *.trycloudflare.com URL.
   *
   * @returns The assigned tunnel URL (e.g. "https://purple-meadow.trycloudflare.com")
   * @throws If no URL is captured within 30 seconds
   */
  async start(): Promise<string> {
    // Remove any existing container with the same name
    await this.removeExistingContainer();

    // Pull image if not present (best-effort)
    await this.ensureImage();

    // Create and start container
    const container = await this.docker.createContainer({
      Image: CLOUDFLARED_IMAGE,
      name: CONTAINER_NAME,
      Cmd: ['tunnel', '--no-autoupdate', '--url', 'http://traefik:80'],
      HostConfig: {
        NetworkMode: 'brewnet',
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });

    this.containerId = container.id;
    await container.start();

    // Stream logs and extract URL
    const url = await this.captureUrl(container);
    this.capturedUrl = url;

    this.logger.log({
      event: 'QUICK_START',
      tunnelMode: 'quick',
      detail: 'Quick Tunnel started',
      quickTunnelUrl: url,
    } as Parameters<TunnelLogger['log']>[0]);

    return url;
  }

  /**
   * Stop and remove the Quick Tunnel container.
   */
  async stop(): Promise<void> {
    const name = this.containerId || CONTAINER_NAME;
    try {
      const container = this.containerId
        ? this.docker.getContainer(this.containerId)
        : this.docker.getContainer(CONTAINER_NAME);

      await container.stop({ t: 5 }).catch(() => {/* already stopped */});
      await container.remove({ force: true }).catch(() => {/* already removed */});

      this.capturedUrl = '';
      this.containerId = '';

      this.logger.log({
        event: 'QUICK_STOP',
        tunnelMode: 'quick',
        detail: `Quick Tunnel container stopped (${name})`,
      });
    } catch {
      // Container may not exist — not an error
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async removeExistingContainer(): Promise<void> {
    try {
      const existing = this.docker.getContainer(CONTAINER_NAME);
      await existing.remove({ force: true });
    } catch {
      // Container does not exist — OK
    }
  }

  private async ensureImage(): Promise<void> {
    try {
      await this.docker.getImage(CLOUDFLARED_IMAGE).inspect();
    } catch {
      // Image not found — pull it
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(CLOUDFLARED_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (err2: Error | null) => {
            if (err2) return reject(err2);
            resolve();
          });
        });
      });
    }
  }

  private captureUrl(container: Dockerode.Container): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Quick Tunnel 시작 실패: 30초 내에 URL을 얻지 못했습니다.'));
      }, URL_TIMEOUT_MS);

      container.logs(
        { follow: true, stdout: true, stderr: true, tail: 0 },
        (err, stream) => {
          if (err || !stream) {
            clearTimeout(timer);
            return reject(err ?? new Error('컨테이너 로그 스트림을 열 수 없습니다.'));
          }

          const onData = (chunk: Buffer) => {
            // Docker log stream: 8-byte header + payload
            const text = chunk.toString('utf8');
            const match = URL_REGEX.exec(text);
            if (match) {
              clearTimeout(timer);
              stream.removeListener('data', onData);
              stream.destroy();
              // Use capture group 1 (domain only) to build a clean https URL.
              // Avoid using match[0] with replace(/\/.*$/) which incorrectly
              // strips the // from the https:// protocol prefix.
              resolve(`https://${match[1]}`);
            }
          };

          stream.on('data', onData);
          stream.on('error', (streamErr) => {
            clearTimeout(timer);
            reject(streamErr);
          });
        },
      );
    });
  }
}
