// @brewnet/shared — Common types, schemas, and utilities

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  // Wizard state types
  WizardState,
  AdminConfig,
  ServerComponents,
  WebServerConfig,
  FileServerConfig,
  GitServerConfig,
  DbServerConfig,
  MediaConfig,
  SshServerConfig,
  MailServerConfig,
  AppServerConfig,
  FileBrowserConfig,
  DevStackConfig,
  BoilerplateConfig,
  DomainConfig,
  CloudflareConfig,
  // Tunnel event types
  TunnelLogEvent,
  TunnelHealth,
  TunnelServiceStatus,
  // Primitive types
  Language,
  FrontendTech,
  WebServerService,
  FileServerService,
  DbPrimary,
  CacheService,
  DomainProvider,
  SslMode,
  SetupType,
  FileBrowserMode,
  DevMode,
  // Install manifest types
  InstallManifest,
  InstallManifestStack,
} from './types/wizard-state.js';

export type {
  // Service types
  ServiceDefinition,
  HealthCheckConfig,
  BrewnetNetwork,
  ServiceStatus,
  ServiceInstance,
  ServiceRegistryEntry,
} from './types/service.js';

export {
  // Error types and classes
  ErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
  BrewnetError,
} from './types/errors.js';

export type {
  LogEntry,
  LogLevel,
  BackupRecord,
  GeneratedFile,
  GeneratedConfig,
} from './types/errors.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

export {
  // Wizard state schema and validators
  wizardStateSchema,
  validateWizardState,
  safeValidateWizardState,
  // Sub-schemas
  adminConfigSchema,
  webServerConfigSchema,
  fileServerConfigSchema,
  gitServerConfigSchema,
  dbServerConfigSchema,
  mediaConfigSchema,
  sshServerConfigSchema,
  mailServerConfigSchema,
  appServerConfigSchema,
  fileBrowserConfigSchema,
  serverComponentsSchema,
  devStackConfigSchema,
  boilerplateConfigSchema,
  cloudflareConfigSchema,
  domainConfigSchema,
  // Primitive schemas
  languageSchema,
  frontendTechSchema,
  webServerServiceSchema,
  fileServerServiceSchema,
  dbPrimarySchema,
  cacheServiceSchema,
  domainProviderSchema,
  sslModeSchema,
  setupTypeSchema,
  fileBrowserModeSchema,
  devModeSchema,
} from './schemas/wizard-state.schema.js';

export type { ValidatedWizardState } from './schemas/wizard-state.schema.js';

// ─── Create-App Types ─────────────────────────────────────────────────────────

export type {
  StackEntry,
  DbDriver,
  CreateAppOptions,
  StackHealthResult,
} from './types/create-app.js';

export {
  // Config schema and validators
  brewnetConfigSchema,
  validateBrewnetConfig,
  safeValidateBrewnetConfig,
} from './schemas/config.schema.js';

export type { BrewnetConfig } from './schemas/config.schema.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export {
  // Schema & Versioning
  SCHEMA_VERSION,
  MIN_MIGRATABLE_SCHEMA_VERSION,
  // Project Defaults
  DEFAULT_PROJECT_NAME,
  DEFAULT_PROJECT_PATH_PREFIX,
  DEFAULT_DATA_DIR,
  DEFAULT_CONFIG_FILENAME,
  // Admin & Credentials
  DEFAULT_ADMIN_USERNAME,
  DEFAULT_ADMIN_PASSWORD_LENGTH,
  DEFAULT_SERVICE_PASSWORD_LENGTH,
  DEFAULT_DB_NAME,
  DEFAULT_DB_USER,
  // Port Defaults
  DEFAULT_SSH_PORT,
  DEFAULT_GIT_WEB_PORT,
  DEFAULT_GIT_SSH_PORT,
  DEFAULT_HTTP_PORT,
  DEFAULT_HTTPS_PORT,
  DEFAULT_TRAEFIK_DASHBOARD_PORT,
  DEFAULT_SMTP_PORT,
  DEFAULT_IMAP_PORT,
  DEFAULT_SMTP_SUBMISSION_PORT,
  DEFAULT_IMAPS_PORT,
  // Health Check
  HEALTH_CHECK_TIMEOUT_MS,
  HEALTH_CHECK_INTERVAL_MS,
  HEALTH_CHECK_SUCCESS_THRESHOLD,
  HEALTH_CHECK_FAILURE_THRESHOLD,
  // Docker
  DOCKER_COMPOSE_FILENAME,
  DOCKER_NETWORK_EXTERNAL,
  DOCKER_NETWORK_INTERNAL,
  DOCKER_RESTART_POLICY,
  DOCKER_COMPOSE_VERSION,
  // File Permissions
  ENV_FILE_PERMISSIONS,
  SSH_KEY_PERMISSIONS,
  SSH_AUTHORIZED_KEYS_PERMISSIONS,
  DEFAULT_DIR_PERMISSIONS,
  // Storage Keys
  WIZARD_STATE_STORAGE_KEY,
  // Service Images
  SERVICE_IMAGES,
  // Database Versions
  DB_VERSIONS,
  // Defaults
  DEFAULT_WEB_SERVER,
  DEFAULT_DOMAIN_PROVIDER,
  DEFAULT_SSL_MODE,
  DEFAULT_DEV_MODE,
  BOILERPLATE_REPO_URL,
  // CLI Metadata
  CLI_NAME,
  CLI_DESCRIPTION,
  // Rate Limiting
  RATE_LIMIT_FREE,
  RATE_LIMIT_PRO,
  // Backup
  MAX_BACKUP_RETENTION,
  BACKUP_DIR_NAME,
  // Timeouts
  DOCKER_PULL_TIMEOUT_MS,
  DOCKER_START_TIMEOUT_MS,
  SSL_ISSUANCE_TIMEOUT_MS,
  DNS_PROPAGATION_TIMEOUT_MS,
} from './utils/constants.js';
