// packages/cli/src/services/gitea-client.ts
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface GiteaClientConfig {
  /** e.g. "localhost:3000" */
  host: string;
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
    const { tokenPath, host, username, password } = this.config;

    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim();
    }

    // Create token via Basic Auth
    const basic = Buffer.from(`${username}:${password}`).toString('base64');
    const res = await fetch(`http://${host}/api/v1/users/${username}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: `brewnet-${Date.now()}` }),
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
    const { host, username } = this.config;
    const res = await fetch(
      `http://${host}/api/v1/repos/${username}/${name}`,
      { headers: await this.authHeaders() },
    );
    return res.status === 200;
  }

  /** Creates a private repo and returns the clone URL. */
  async createRepo(name: string, description = ''): Promise<string> {
    const { host } = this.config;
    const res = await fetch(`http://${host}/api/v1/user/repos`, {
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
    const { host, username } = this.config;
    await fetch(`http://${host}/api/v1/repos/${username}/${name}`, {
      method: 'DELETE',
      headers: await this.authHeaders(),
    });
  }

  /** URL suitable for git remote add — includes credentials in URL (stored in .git/config which is chmod 600). */
  authedCloneUrl(cloneUrl: string): string {
    const { username, password } = this.config;
    return cloneUrl.replace('http://', `http://${username}:${password}@`);
  }
}
