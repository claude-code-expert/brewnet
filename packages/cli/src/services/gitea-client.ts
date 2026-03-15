// packages/cli/src/services/gitea-client.ts
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GitRepoEntry } from '../types/app-entry.js';

export interface GiteaClientConfig {
  /** Full base URL without trailing slash, e.g. "http://localhost/git" (via Traefik) */
  baseUrl: string;
  username: string;
  password: string;
  /** Path to persist the API token, e.g. ~/.brewnet/gitea-token */
  tokenPath: string;
}

export class GiteaClient {
  private config: GiteaClientConfig;

  constructor(config: GiteaClientConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  private async ensureToken(): Promise<string> {
    const { tokenPath, baseUrl, username, password } = this.config;

    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim();
    }

    // Create token via Basic Auth
    const basic = Buffer.from(`${username}:${password}`).toString('base64');
    const res = await fetch(`${baseUrl}/api/v1/users/${username}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `brewnet-${Date.now()}`,
        scopes: ['write:repository', 'read:repository', 'write:user', 'read:user'],
      }),
    });

    if (!res.ok) {
      throw new Error(`Gitea token creation failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { sha1: string };
    const token = data.sha1;

    mkdirSync(dirname(tokenPath), { recursive: true });
    writeFileSync(tokenPath, token, 'utf-8');
    chmodSync(tokenPath, 0o600);

    return token;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `token ${await this.ensureToken()}`,
      'Content-Type': 'application/json',
    };
  }

  // ---------------------------------------------------------------------------
  // Repository operations
  // ---------------------------------------------------------------------------

  async repoExists(name: string): Promise<boolean> {
    const { baseUrl, username } = this.config;
    const res = await fetch(
      `${baseUrl}/api/v1/repos/${username}/${name}`,
      { headers: await this.authHeaders() },
    );
    return res.status === 200;
  }

  /** Creates a private repo and returns the clone URL. */
  async createRepo(name: string, description = ''): Promise<string> {
    const { baseUrl } = this.config;
    const res = await fetch(`${baseUrl}/api/v1/user/repos`, {
      method: 'POST',
      headers: await this.authHeaders(),
      body: JSON.stringify({ name, description, private: true, auto_init: false }),
    });

    if (!res.ok) {
      throw new Error(`Gitea createRepo failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { clone_url: string };
    return data.clone_url;
  }

  async deleteRepo(name: string): Promise<void> {
    const { baseUrl, username } = this.config;
    await fetch(`${baseUrl}/api/v1/repos/${username}/${name}`, {
      method: 'DELETE',
      headers: await this.authHeaders(),
    });
  }

  /** Returns all repos accessible to the authenticated user. */
  async listRepos(): Promise<GitRepoEntry[]> {
    const { baseUrl } = this.config;
    const res = await fetch(`${baseUrl}/api/v1/user/repos`, {
      headers: await this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Gitea listRepos failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as GitRepoEntry[];
  }

  /** URL suitable for git remote add — includes credentials in URL (stored in .git/config which is chmod 600). */
  authedCloneUrl(cloneUrl: string): string {
    const { username, password } = this.config;
    // Percent-encode special chars so git URL parser handles them correctly
    const encUser = encodeURIComponent(username);
    const encPass = encodeURIComponent(password);
    return cloneUrl.replace('http://', `http://${encUser}:${encPass}@`);
  }
}
