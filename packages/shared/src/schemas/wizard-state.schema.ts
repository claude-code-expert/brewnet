// T011 — Zod schema for WizardState validation
// Validates the complete wizard state object including all sub-schemas.

import { z } from 'zod';
import type { WizardState } from '../types/wizard-state.js';

// ─── Primitive Schemas ───────────────────────────────────────────────────────

export const languageSchema = z.enum([
  'python', 'nodejs', 'java', 'rust', 'go', 'kotlin',
]);

export const frontendTechSchema = z.enum([
  'react', 'vue', 'none',
]);

export const webServerServiceSchema = z.enum(['traefik', 'nginx', 'caddy']);

export const fileServerServiceSchema = z.enum(['nextcloud', 'minio', '']);

export const dbPrimarySchema = z.enum(['postgresql', 'mysql', 'sqlite', '']);

export const cacheServiceSchema = z.enum(['redis', 'valkey', 'keydb', '']);

export const domainProviderSchema = z.enum(['local', 'tunnel', 'quick-tunnel']);

export const sslModeSchema = z.enum(['self-signed', 'letsencrypt', 'cloudflare']);

export const setupTypeSchema = z.enum(['full', 'partial']);

export const fileBrowserModeSchema = z.enum(['directory', 'standalone', '']);

export const devModeSchema = z.enum(['hot-reload', 'production']);

// ─── Sub-Schemas ─────────────────────────────────────────────────────────────

export const adminConfigSchema = z.object({
  username: z.string().min(1, 'Admin username is required'),
  password: z.string().min(8, 'Admin password must be at least 8 characters'),
  storage: z.literal('local'),
});

export const webServerConfigSchema = z.object({
  enabled: z.literal(true),
  service: webServerServiceSchema,
});

export const fileServerConfigSchema = z.object({
  enabled: z.boolean(),
  service: fileServerServiceSchema,
});

export const gitServerConfigSchema = z.object({
  enabled: z.literal(true),
  service: z.literal('gitea'),
  port: z.number().int().min(1).max(65535),
  sshPort: z.number().int().min(1).max(65535),
});

export const dbServerConfigSchema = z.object({
  enabled: z.boolean(),
  primary: dbPrimarySchema,
  primaryVersion: z.string(),
  dbName: z.string(),
  dbUser: z.string(),
  dbPassword: z.string(),
  adminUI: z.boolean(),
  pgadminEmail: z.string(),
  cache: cacheServiceSchema,
});

export const mediaConfigSchema = z.object({
  enabled: z.boolean(),
  services: z.array(z.string()),
});

export const sshServerConfigSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1).max(65535),
  passwordAuth: z.boolean(),
  sftp: z.boolean(),
});

export const mailRelayProviderSchema = z.enum(['', 'gmail', 'sendgrid', 'custom']);

export const mailServerConfigSchema = z.object({
  enabled: z.boolean(),
  service: z.literal('docker-mailserver'),
  port25Blocked: z.boolean(),
  relayProvider: mailRelayProviderSchema,
  relayHost: z.string(),
  relayPort: z.number().int().min(1).max(65535),
  relayUser: z.string(),
  relayPassword: z.string(),
});

export const appServerConfigSchema = z.object({
  enabled: z.boolean(),
});

export const fileBrowserConfigSchema = z.object({
  enabled: z.boolean(),
  mode: fileBrowserModeSchema,
});

export const serverComponentsSchema = z.object({
  webServer: webServerConfigSchema,
  fileServer: fileServerConfigSchema,
  gitServer: gitServerConfigSchema,
  dbServer: dbServerConfigSchema,
  media: mediaConfigSchema,
  sshServer: sshServerConfigSchema,
  mailServer: mailServerConfigSchema,
  appServer: appServerConfigSchema,
  fileBrowser: fileBrowserConfigSchema,
});

export const devStackConfigSchema = z.object({
  languages: z.array(languageSchema),
  frameworks: z.record(z.string(), z.string()),
  frontend: frontendTechSchema.nullable(),
});

export const boilerplateConfigSchema = z.object({
  generate: z.boolean(),
  sampleData: z.boolean(),
  devMode: devModeSchema,
});

export const tunnelModeSchema = z.enum(['quick', 'named', 'none']);

export const cloudflareConfigSchema = z.object({
  enabled: z.boolean(),
  tunnelMode: tunnelModeSchema,
  quickTunnelUrl: z.string(),
  accountId: z.string(),
  apiToken: z.string(),
  tunnelId: z.string(),
  tunnelToken: z.string(),
  tunnelName: z.string(),
  zoneId: z.string(),
  zoneName: z.string(),
});

export const domainConfigSchema = z.object({
  provider: domainProviderSchema,
  name: z.string(),
  ssl: sslModeSchema,
  cloudflare: cloudflareConfigSchema,
});

// ─── Root Schema ─────────────────────────────────────────────────────────────

export const wizardStateSchema = z.object({
  schemaVersion: z.literal(7),
  projectName: z.string().min(1, 'Project name is required').regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'Project name must start with a lowercase letter or number and contain only lowercase letters, numbers, and hyphens',
  ),
  projectPath: z.string().min(1, 'Project path is required'),
  setupType: setupTypeSchema,
  admin: adminConfigSchema,
  servers: serverComponentsSchema,
  devStack: devStackConfigSchema,
  boilerplate: boilerplateConfigSchema,
  domain: domainConfigSchema,
  portRemapping: z.record(z.coerce.number(), z.number().int().min(1).max(65535)),
}) satisfies z.ZodType<WizardState>;

export type ValidatedWizardState = z.infer<typeof wizardStateSchema>;

// ─── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validates a WizardState object and returns the parsed result.
 * Throws a ZodError if validation fails.
 */
export function validateWizardState(data: unknown): WizardState {
  return wizardStateSchema.parse(data);
}

/**
 * Safely validates a WizardState object without throwing.
 * Returns a discriminated union with success/error.
 */
export function safeValidateWizardState(data: unknown): z.SafeParseReturnType<unknown, WizardState> {
  return wizardStateSchema.safeParse(data);
}
