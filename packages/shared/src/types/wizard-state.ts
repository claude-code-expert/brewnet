// T008 — WizardState type definitions
// Defines the complete wizard state model used throughout the Brewnet CLI wizard flow.

// ─── Primitive Types ─────────────────────────────────────────────────────────

export type Language = 'python' | 'nodejs' | 'java' | 'php' | 'dotnet' | 'rust' | 'go';

export type FrontendTech = 'vuejs' | 'reactjs' | 'typescript' | 'javascript';

export type WebServerService = 'traefik' | 'nginx' | 'caddy';

export type FileServerService = 'nextcloud' | 'minio' | '';

export type DbPrimary = 'postgresql' | 'mysql' | 'sqlite' | '';

export type CacheService = 'redis' | 'valkey' | 'keydb' | '';

export type DomainProvider = 'local' | 'freedomain' | 'custom';

export type SslMode = 'self-signed' | 'letsencrypt' | 'cloudflare';

export type FreeDomainTld = '.dpdns.org' | '.qzz.io' | '.us.kg';

export type SetupType = 'full' | 'partial';

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

export interface MailServerConfig {
  enabled: boolean;
  /** Mail server implementation */
  service: 'docker-mailserver';
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
  mailServer: MailServerConfig;
  appServer: AppServerConfig;
  fileBrowser: FileBrowserConfig;
}

export interface DevStackConfig {
  /** Selected backend languages (multi-select) */
  languages: Language[];
  /** Per-language framework selection. Key = language, value = framework id */
  frameworks: Record<string, string>;
  /** Selected frontend technologies (multi-select) */
  frontend: FrontendTech[];
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
  /** Cloudflare Tunnel token */
  tunnelToken: string;
  /** Cloudflare Tunnel name */
  tunnelName: string;
}

export interface DomainConfig {
  /** Domain provider type */
  provider: DomainProvider;
  /** Domain name (e.g., "myserver.dpdns.org", "example.com") */
  name: string;
  /** SSL certificate strategy */
  ssl: SslMode;
  /** TLD for free domain provider */
  freeDomainTld: FreeDomainTld;
  /** Cloudflare Tunnel configuration */
  cloudflare: CloudflareConfig;
}

// ─── Root State ──────────────────────────────────────────────────────────────

export interface WizardState {
  /** Schema version for migration support. Current version: 5 */
  schemaVersion: 5;
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
}
