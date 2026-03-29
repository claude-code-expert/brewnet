// packages/admin-ui/src/types.ts
// Mirrors data shapes returned by admin-server.ts API endpoints.

export interface ServiceStatus {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'error' | 'not_installed';
  cpu: string;
  memory: string;
  uptime: string;
  port: number | null;
  url: string | null;
  externalUrl: string | null;
  backendApiUrl?: string | null;
  removable: boolean;
  stackId?: string;
}

export interface BoilerplateMeta {
  stackId: string;
  appDir?: string;
  backendUrl?: string;
  frontendUrl?: string;
  isUnified?: boolean;
  lang?: string;
  frameworkId?: string;
  dbDriver?: string;
  dbUser?: string;
  dbName?: string;
  gitBranch?: string;
  status?: string;
}

export interface DomainConnection {
  appName: string;
  hostname: string;
  connectedAt?: string;
}

export interface ConfigResponse {
  adminUsername: string;
  passwordHint: string;
  domainProvider: string;
  quickTunnelUrl: string;
  zoneName: string;
  tunnelId: string;
}

export interface AppEntry {
  name: string;
  mode: 'boilerplate' | 'git-clone' | 'new-project';
  stackId?: string;
  sourceUrl?: string;
  appDir: string;
  lang?: string;
  framework?: string;
  port: number;
  giteaRepoUrl?: string;
  status: 'creating' | 'running' | 'stopped' | 'failed';
  createdAt: string;
  // Enriched by /api/apps handler
  lastDeployedAt?: string | null;
  localUrl?: string | null;
  externalUrl?: string | null;
  backendLocalUrl?: string | null;
  backendExternalUrl?: string | null;
  domainRequired?: boolean;
}

export interface AppJob {
  jobId: string;
  appName: string;
  status: 'running' | 'done' | 'failed';
  steps: Array<{ label: string; status: 'pending' | 'running' | 'done' | 'failed'; message?: string }>;
  error?: string;
  logs?: string[];
}

export interface AppGitInfo {
  giteaUrl: string;
  cloneUrlHttp: string;
  cloneUrlSsh: string;
  localPath: string;
  branch: string;
  latestCommit: {
    hash: string;
    shortHash: string;
    message: string;
    date: string;
  } | null;
}

export interface DeploySettings {
  autoDeploy: boolean;
  deployBranch: string;
  webhookSecret?: string;
}

export interface DeployHistoryEntry {
  appName: string;
  commitHash: string;
  commitMessage: string;
  status: 'success' | 'failed';
  deployedAt: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
}

export interface LogStatsResponse {
  total: number;
  byLevel?: Record<string, number>;
  bySource?: Record<string, number>;
}

export interface ServiceDetail {
  name: string;
  description?: string;
  license?: string;
  features?: string[];
  credentials?: { summary: string; keys?: string[]; command?: string };
  connectionParams?: { label: string; value: string }[];
  tips?: string[];
  docs?: string;
}

export interface GitRepoEntry {
  id: number;
  name: string;
  clone_url: string;
  html_url: string;
  description: string;
  private: boolean;
  appName?: string;
}
