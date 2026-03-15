// packages/cli/src/services/gitea-client.ts
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';
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

  /**
   * Create a Gitea API token via Basic Auth.
   * If the admin account has mustChangePassword=true (403), auto-fixes via docker exec and retries.
   * Saves the token to tokenPath on success.
   */
  private async _createToken(): Promise<{ wasFixed: boolean }> {
    const { tokenPath, baseUrl, username, password } = this.config;
    const basic = Buffer.from(`${username}:${password}`).toString('base64');

    const makeRequest = () =>
      fetch(`${baseUrl}/api/v1/users/${username}/tokens`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `brewnet-${Date.now()}`,
          scopes: ['write:repository', 'read:repository', 'write:user', 'read:user'],
        }),
      });

    let res = await makeRequest();
    let wasFixed = false;

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 403 && body.includes('must change')) {
        // Auto-fix: reset mustChangePassword via docker exec, then retry
        try {
          execSync(
            `docker exec -u git brewnet-gitea gitea admin user edit` +
            ` --username ${username} --must-change-password false`,
            { stdio: 'pipe' },
          );
        } catch (e) {
          const stderr = (e as { stderr?: Buffer }).stderr?.toString().trim() ?? String(e);
          throw new Error(
            `Gitea admin requires password change — auto-fix failed:\n  ${stderr}\n` +
            `  Manual fix: docker exec -u git brewnet-gitea gitea admin user edit` +
            ` --username ${username} --must-change-password false`,
          );
        }
        wasFixed = true;
        res = await makeRequest();
        if (!res.ok) {
          throw new Error(
            `Gitea token creation failed after auto-fix: ${res.status} ${await res.text()}`,
          );
        }
      } else {
        throw new Error(`Gitea token creation failed: ${res.status} ${body}`);
      }
    }

    const data = (await res.json()) as { sha1: string };
    mkdirSync(dirname(tokenPath), { recursive: true });
    writeFileSync(tokenPath, data.sha1, 'utf-8');
    chmodSync(tokenPath, 0o600);
    return { wasFixed };
  }

  /**
   * Explicit setup step — call once before any API operations.
   * Validates any cached token; deletes and re-creates if stale (401).
   * Returns what happened so the caller can surface it in job step logs.
   */
  async prepare(): Promise<{ autoFixed: boolean; message: string }> {
    const { tokenPath, baseUrl } = this.config;
    if (existsSync(tokenPath)) {
      // Validate cached token — it may be stale if Gitea was reset or re-installed
      const token = readFileSync(tokenPath, 'utf-8').trim();
      try {
        const check = await fetch(`${baseUrl}/api/v1/user`, {
          headers: { Authorization: `token ${token}` },
        });
        if (check.status !== 401) {
          return { autoFixed: false, message: 'token cached' };
        }
        // Token is stale — delete and fall through to re-create
        unlinkSync(tokenPath);
      } catch {
        // Network error — assume token is still valid, let API calls fail naturally
        return { autoFixed: false, message: 'token cached (network check skipped)' };
      }
    }
    const { wasFixed } = await this._createToken();
    return {
      autoFixed: wasFixed,
      message: wasFixed
        ? 'mustChangePassword was set — auto-fixed via docker exec; token created'
        : 'token created',
    };
  }

  private async ensureToken(): Promise<string> {
    const { tokenPath } = this.config;
    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim();
    }
    await this._createToken();
    return readFileSync(tokenPath, 'utf-8').trim();
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

  /** Fetch a single repo's detail (includes default_branch, ssh_url). */
  async getRepo(name: string): Promise<{
    id: number; name: string; clone_url: string; ssh_url: string;
    html_url: string; description: string; private: boolean; default_branch: string;
  }> {
    const { baseUrl, username } = this.config;
    const res = await fetch(`${baseUrl}/api/v1/repos/${username}/${name}`, {
      headers: await this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Gitea getRepo failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      id: number; name: string; clone_url: string; ssh_url: string;
      html_url: string; description: string; private: boolean; default_branch: string;
    }>;
  }

  /** Get the latest commit on a branch. Returns null for empty repos. */
  async getLatestCommit(
    repoName: string,
    branch: string,
  ): Promise<{ hash: string; shortHash: string; message: string; date: string } | null> {
    const { baseUrl, username } = this.config;
    const res = await fetch(
      `${baseUrl}/api/v1/repos/${username}/${repoName}/commits?sha=${encodeURIComponent(branch)}&limit=1`,
      { headers: await this.authHeaders() },
    );
    if (!res.ok) return null;
    const commits = (await res.json()) as Array<{ sha: string; commit: { message: string; committer: { date: string } } }>;
    if (!commits.length) return null;
    const c = commits[0]!;
    return {
      hash: c.sha,
      shortHash: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0]!,
      date: c.commit.committer.date,
    };
  }

  /** Register a push webhook on the repo. */
  async createWebhook(repoName: string, webhookUrl: string, secret: string): Promise<void> {
    const { baseUrl, username } = this.config;
    const res = await fetch(`${baseUrl}/api/v1/repos/${username}/${repoName}/hooks`, {
      method: 'POST',
      headers: await this.authHeaders(),
      body: JSON.stringify({
        type: 'gitea',
        config: { url: webhookUrl, content_type: 'json', secret },
        events: ['push'],
        active: true,
      }),
    });
    if (!res.ok) throw new Error(`Gitea createWebhook failed: ${res.status} ${await res.text()}`);
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
