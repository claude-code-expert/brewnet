// T008 — WizardState type definitions
// Defines the complete wizard state model used throughout the Brewnet CLI wizard flow.

// ─── Primitive Types ─────────────────────────────────────────────────────────

export type Language = 'python' | 'nodejs' | 'java' | 'rust' | 'go' | 'kotlin';

export type FrontendTech = 'react' | 'vue' | 'none';

export type WebServerService = 'traefik' | 'nginx' | 'caddy';

export type FileServerService = 'nextcloud' | 'minio' | '';

export type DbPrimary = 'postgresql' | 'mysql' | 'sqlite' | '';

export type CacheService = '';

export type DomainProvider = 'local' | 'tunnel' | 'quick-tunnel';

export type SslMode = 'self-signed' | 'letsencrypt' | 'cloudflare';

export type SetupType = 'full' | 'partial' | 'minimal';

export type FileBrowserMode = 'directory' | 'standalone' | '';

export type DevMode = 'hot-reload' | 'production';

// ─── Sub-Interfaces ──────────────────────────────────────────────────────────

export interface AdminConfig {
  /** Admin username. Default: "admin" */
  username: string;
  /** Auto-generated password (20 chars). Stored in .env with chmod 600 */
  password: string;
  /** Credential storage method. Always 'local' (.env file) */
  storage: 'local';
}

export interface WebServerConfig {
  /** Web server is always enabled (required component) */
  enabled: true;
  /** Selected web server / reverse proxy */
  service: WebServerService;
}

export interface FileServerConfig {
  enabled: boolean;
  /** Selected file server service, empty string when disabled */
  service: FileServerService;
}

export interface GitServerConfig {
  /** Git server is always enabled (required component) */
  enabled: true;
  /** Git server implementation. Currently only Gitea is supported */
  service: 'gitea';
  /** Gitea web UI port. Default: 3000 */
  port: number;
  /** Gitea SSH port. Default: 3022 */
  sshPort: number;
}

export interface DbServerConfig {
  enabled: boolean;
  /** Primary database engine, empty string when disabled */
  primary: DbPrimary;
  /** Database engine version string (e.g., "16", "8.0") */
  primaryVersion: string;
  /** Default database name */
  dbName: string;
  /** Database user */
  dbUser: string;
  /** Database password (auto-generated or user-supplied) */
  dbPassword: string;
  /** Whether to enable a database admin UI (e.g., pgAdmin, phpMyAdmin) */
  adminUI: boolean;
  /** Login email for pgAdmin (only used when adminUI is true and primary is postgresql) */
  pgadminEmail: string;
  /** Cache layer, empty string when no cache is selected */
  cache: CacheService;
}

export interface MediaConfig {
  enabled: boolean;
  /** List of enabled media services (e.g., ['jellyfin']) */
  services: string[];
}

export interface SshServerConfig {
  enabled: boolean;
  /** SSH listen port. Default: 2222 */
  port: number;
  /** Whether password authentication is allowed. Default: false (key-only) */
  passwordAuth: boolean;
  /** Whether SFTP subsystem is enabled */
  sftp: boolean;
}

export interface AppServerConfig {
  /** Auto-enabled when devStack has languages or frontend selected */
  enabled: boolean;
}

export interface FileBrowserConfig {
  enabled: boolean;
  /** 'directory' = web server static files, 'standalone' = filebrowser container */
  mode: FileBrowserMode;
}

export interface ServerComponents {
  webServer: WebServerConfig;
  fileServer: FileServerConfig;
  gitServer: GitServerConfig;
  dbServer: DbServerConfig;
  media: MediaConfig;
  sshServer: SshServerConfig;
  appServer: AppServerConfig;
  fileBrowser: FileBrowserConfig;
}

export interface DevStackConfig {
  /** Selected backend languages (multi-select) */
  languages: Language[];
  /** Per-language framework selection. Key = language, value = framework id */
  frameworks: Record<string, string>;
  /** Selected frontend technology (single-select), null when no frontend selected */
  frontend: FrontendTech | null;
}

export interface BoilerplateConfig {
  /** Whether to generate boilerplate project files */
  generate: boolean;
  /** Whether to include sample data / seed files */
  sampleData: boolean;
  /** Development mode for generated projects */
  devMode: DevMode;
}

export interface CloudflareConfig {
  /** Whether Cloudflare Tunnel is enabled */
  enabled: boolean;
  /** Discriminates Quick Tunnel vs Named Tunnel vs no tunnel */
  tunnelMode: 'quick' | 'named' | 'none';
  /** Quick Tunnel URL (*.trycloudflare.com) — populated at runtime, never persisted after restart */
  quickTunnelUrl: string;
  /** Cloudflare Account ID (used for API tunnel creation) */
  accountId: string;
  /** Cloudflare API Token — used only during setup, not persisted after tunnel is created */
  apiToken: string;
  /** Cloudflare Tunnel ID (returned from API or entered manually) */
  tunnelId: string;
  /** Cloudflare Tunnel connector token */
  tunnelToken: string;
  /** Cloudflare Tunnel name */
  tunnelName: string;
  /** Cloudflare Zone ID (used for DNS record creation) */
  zoneId: string;
  /** Cloudflare Zone name — the actual domain (e.g. "myserver.com") */
  zoneName: string;
}

// ─── Tunnel Runtime Types (not persisted) ────────────────────────────────────

export interface TunnelServiceStatus {
  name: string;
  url: string;
  subdomain?: string;
  path?: string;
  accessible: boolean;
}

export interface TunnelHealth {
  status: 'healthy' | 'degraded' | 'inactive';
  connectorCount: number;
  tunnelId: string;
  tunnelName: string;
  lastChecked: string;
  services: TunnelServiceStatus[];
}

export interface TunnelLogEvent {
  timestamp: string;
  event:
    | 'CREATE'
    | 'ROLLBACK'
    | 'DOMAIN_CONNECT'
    | 'RESTART'
    | 'STATUS_CHANGE'
    | 'QUICK_START'
    | 'QUICK_STOP';
  tunnelMode: 'quick' | 'named';
  tunnelId?: string;
  tunnelName?: string;
  domain?: string;
  detail: string;
  error?: string;
}

export interface DomainConfig {
  /** Domain provider type */
  provider: DomainProvider;
  /** Domain name (e.g., "myserver.example.com") */
  name: string;
  /** SSL certificate strategy */
  ssl: SslMode;
  /** Cloudflare Tunnel configuration */
  cloudflare: CloudflareConfig;
}

// ─── Domain Connection ──────────────────────────────────────────────────────

export type DomainScenario = 'A' | 'B' | 'C';

export interface DomainConnection {
  /** Name of the local app/service (e.g., "my-api", "gitea") */
  appName: string;
  /**
   * Subdomain label (e.g., "my-api", "git").
   * "@" = apex/root domain connection — auto-bundles www.{domain} as well.
   */
  subdomain: string;
  /** Base domain (e.g., "yourdomain.com") */
  domain: string;
  /** Full hostname — apex domain or subdomain.domain */
  hostname: string;
  /** Cloudflare Tunnel ID used for this connection */
  tunnelId: string;
  /** Cloudflare DNS record ID for the CNAME (apex record when subdomain="@") */
  cnameRecordId: string;
  /** www CNAME record ID — only set when subdomain="@" (apex connection) */
  wwwCnameRecordId?: string;
  /** Internal container port for Traefik routing */
  containerPort: number;
  /** ISO 8601 timestamp of connection creation */
  connectedAt: string;
  /** Which domain scenario was used */
  scenario: DomainScenario;
  /** Next.js basePath (e.g. '/apps/my-app') — used for local health checks and logging; NOT included in CF Tunnel ingress origin (CF does not support path-based origins) */
  basePath?: string;
}

// ─── Root State ──────────────────────────────────────────────────────────────

export interface WizardState {
  /** Schema version for migration support. Current version: 7 (v6→v7: frontend changed from array to single value|null) */
  schemaVersion: 7;
  /** Project display name (e.g., "my-homeserver") */
  projectName: string;
  /** Absolute path where the project is stored */
  projectPath: string;
  /** Whether to install all components or select individually */
  setupType: SetupType;
  /** Admin credentials configuration */
  admin: AdminConfig;
  /** Server component selections */
  servers: ServerComponents;
  /** Development stack / language configuration */
  devStack: DevStackConfig;
  /** Boilerplate generation settings */
  boilerplate: BoilerplateConfig;
  /** Domain and networking configuration */
  domain: DomainConfig;
  /** Active domain connections mapping local apps to external domains via Cloudflare Tunnel */
  domainConnections: DomainConnection[];
  /**
   * Port conflict remapping. Key = original port, value = user-selected alternative.
   * Applied when generating docker-compose.yml port bindings.
   * e.g., { 80: 8080, 443: 8443 }
   */
  portRemapping: Record<number, number>;
}

// ─── Install Manifest ─────────────────────────────────────────────────────────

/** One boilerplate stack entry inside the install manifest. */
export interface InstallManifestStack {
  /** Stack ID, e.g. 'python-fastapi'. Also used as directory name under projectPath. */
  stackId: string;
  /** Directory path relative to projectPath. */
  directory: string;
}

/**
 * Written to `<projectPath>/.brewnet-manifest.json` at the end of `brewnet init`.
 * Records every file and directory that brewnet generated so that `brewnet uninstall`
 * can remove only what brewnet created and preserve any files the user added.
 */
export interface InstallManifest {
  schemaVersion: 1;
  projectName: string;
  /** Stored with ~/... notation for portability. */
  projectPath: string;
  createdAt: string;
  /** Paths relative to projectPath for files brewnet generated. */
  generatedFiles: string[];
  /** Paths relative to projectPath for directories fully owned by brewnet. */
  generatedDirs: string[];
  /** Boilerplate stacks that were git-cloned during init. */
  boilerplateStacks: InstallManifestStack[];
}
