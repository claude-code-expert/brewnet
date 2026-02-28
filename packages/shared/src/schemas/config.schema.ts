// T012 — Zod schema for brewnet.config.json import/export
// A subset of WizardState used when exporting or importing wizard configurations.
// Sensitive fields (passwords, tokens) are excluded from export by default.

import { z } from 'zod';
import {
  setupTypeSchema,
  webServerServiceSchema,
  fileServerServiceSchema,
  dbPrimarySchema,
  cacheServiceSchema,
  domainProviderSchema,
  sslModeSchema,
  fileBrowserModeSchema,
  devModeSchema,
  languageSchema,
  frontendTechSchema,
} from './wizard-state.schema.js';

// ─── Config Sub-Schemas (export-safe, no secrets) ────────────────────────────

const configAdminSchema = z.object({
  username: z.string().min(1),
  storage: z.literal('local'),
});

const configWebServerSchema = z.object({
  enabled: z.literal(true),
  service: webServerServiceSchema,
});

const configFileServerSchema = z.object({
  enabled: z.boolean(),
  service: fileServerServiceSchema,
});

const configGitServerSchema = z.object({
  enabled: z.literal(true),
  service: z.literal('gitea'),
  port: z.number().int().min(1).max(65535),
  sshPort: z.number().int().min(1).max(65535),
});

const configDbServerSchema = z.object({
  enabled: z.boolean(),
  primary: dbPrimarySchema,
  primaryVersion: z.string(),
  dbName: z.string(),
  dbUser: z.string(),
  adminUI: z.boolean(),
  cache: cacheServiceSchema,
  // dbPassword is intentionally excluded from export
});

const configMediaSchema = z.object({
  enabled: z.boolean(),
  services: z.array(z.string()),
});

const configSshServerSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1).max(65535),
  passwordAuth: z.boolean(),
  sftp: z.boolean(),
});

const configMailServerSchema = z.object({
  enabled: z.boolean(),
  service: z.literal('docker-mailserver'),
});

const configAppServerSchema = z.object({
  enabled: z.boolean(),
});

const configFileBrowserSchema = z.object({
  enabled: z.boolean(),
  mode: fileBrowserModeSchema,
});

const configServersSchema = z.object({
  webServer: configWebServerSchema,
  fileServer: configFileServerSchema,
  gitServer: configGitServerSchema,
  dbServer: configDbServerSchema,
  media: configMediaSchema,
  sshServer: configSshServerSchema,
  mailServer: configMailServerSchema,
  appServer: configAppServerSchema,
  fileBrowser: configFileBrowserSchema,
});

const configDevStackSchema = z.object({
  languages: z.array(languageSchema),
  frameworks: z.record(z.string(), z.string()),
  frontend: frontendTechSchema.nullable(),
});

const configBoilerplateSchema = z.object({
  generate: z.boolean(),
  sampleData: z.boolean(),
  devMode: devModeSchema,
});

const configCloudflareSchema = z.object({
  enabled: z.boolean(),
  tunnelName: z.string(),
  // tunnelToken is intentionally excluded from export
});

const configDomainSchema = z.object({
  provider: domainProviderSchema,
  name: z.string(),
  ssl: sslModeSchema,
  cloudflare: configCloudflareSchema,
});

// ─── Root Config Schema ──────────────────────────────────────────────────────

export const brewnetConfigSchema = z.object({
  schemaVersion: z.literal(7),
  projectName: z.string().min(1).regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'Project name must start with a lowercase letter or number and contain only lowercase letters, numbers, and hyphens',
  ),
  projectPath: z.string().min(1),
  setupType: setupTypeSchema,
  admin: configAdminSchema,
  servers: configServersSchema,
  devStack: configDevStackSchema,
  boilerplate: configBoilerplateSchema,
  domain: configDomainSchema,
});

export type BrewnetConfig = z.infer<typeof brewnetConfigSchema>;

// ─── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validates a brewnet.config.json object. Throws on failure.
 */
export function validateBrewnetConfig(data: unknown): BrewnetConfig {
  return brewnetConfigSchema.parse(data);
}

/**
 * Safely validates a brewnet.config.json object without throwing.
 */
export function safeValidateBrewnetConfig(data: unknown): z.SafeParseReturnType<unknown, BrewnetConfig> {
  return brewnetConfigSchema.safeParse(data);
}
