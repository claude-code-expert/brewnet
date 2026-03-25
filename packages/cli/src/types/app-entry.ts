// packages/cli/src/types/app-entry.ts

/** Source mode for a managed app. */
export type AppMode = 'boilerplate' | 'git-clone' | 'new-project' | 'local-path';

/** Lifecycle status of a managed app. */
export type AppStatus = 'creating' | 'running' | 'stopped' | 'failed';

/** Step status inside an AppJob. */
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

/** One step in an async creation job. */
export interface AppJobStep {
  label: string;
  status: StepStatus;
  message?: string;
}

/** Async job for tracking app creation progress (in-memory only). */
export interface AppJob {
  jobId: string;
  appName: string;
  status: 'running' | 'done' | 'failed';
  steps: AppJobStep[];
  error?: string;
  /** Rolling log lines from docker compose / health check (last 200 lines). */
  logs?: string[];
}

/** Persisted record for one managed app (stored in apps.json). */
export interface AppEntry {
  /** Unique logical name chosen by the user. */
  name: string;
  mode: AppMode;
  /** Installed boilerplate stackId — Mode A only. */
  stackId?: string;
  /** External Git URL — Mode B only. */
  sourceUrl?: string;
  /** Absolute path to the app's source directory on disk. */
  appDir: string;
  lang?: string;
  framework?: string;
  port: number;
  /** Gitea repo URL once connected (e.g. http://localhost:3000/admin/my-app). */
  giteaRepoUrl?: string;
  status: AppStatus;
  createdAt: string;
}

/** Input to createApp(). */
export interface CreateAppOptions {
  mode: AppMode;
  appName: string;
  port?: number;
  // Mode A
  stackId?: string;
  // Mode B
  gitUrl?: string;
  branch?: string;
  // Mode C
  language?: string;
  frameworkId?: string;
  includePostgres?: boolean;
  includeRedis?: boolean;
  // Mode D: local path deploy (no Gitea)
  localPath?: string;
}

/** One entry in the deploy history (stored in ~/.brewnet/deploy-history.json). */
export interface DeployHistoryEntry {
  appName: string;
  commitHash: string;
  commitMessage: string;
  status: 'success' | 'failed';
  deployedAt: string; // ISO 8601
}

/** One repository entry from Gitea GET /api/v1/user/repos. */
export interface GitRepoEntry {
  id: number;
  name: string;
  clone_url: string;
  html_url: string;
  description: string;
  private: boolean;
  // Raw Gitea API fields
  language?: string;
  stars_count?: number;
  updated?: string;
  // Enriched by admin server before returning to client
  appName?: string;
  stars?: number;
  updatedAt?: string;
}

/** Git + Gitea information for a managed app. */
export interface AppGitInfo {
  /** Gitea web URL, e.g. http://localhost/git/admin/my-api */
  giteaUrl: string;
  /** HTTP clone URL */
  cloneUrlHttp: string;
  /** SSH clone URL */
  cloneUrlSsh: string;
  /** Absolute path on disk */
  localPath: string;
  /** Current default branch */
  branch: string;
  /** Latest commit on the branch, null if repo is empty */
  latestCommit: {
    hash: string;
    shortHash: string;
    message: string;
    date: string; // ISO 8601
  } | null;
}

/** Per-app deploy settings (stored in apps.json alongside AppEntry). */
export interface DeploySettings {
  autoDeploy: boolean;
  deployBranch: string;
  webhookSecret?: string;
}
