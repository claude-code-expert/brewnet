/**
 * T070 — Step 5: Review & Confirm
 *
 * Pure data functions and interactive step for the Review screen:
 *   - generateReviewSections(): renders wizard selections into organized sections
 *   - exportConfig(): writes a sanitized brewnet.config.json (no secrets)
 *   - importConfig(): reads config JSON and restores WizardState
 *   - runReviewStep(): interactive review flow with Generate/Modify/Export
 *
 * @module wizard/steps/review
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import type { WizardState } from '@brewnet/shared';
import { validateBrewnetConfig } from '@brewnet/shared';
import type { BrewnetConfig } from '@brewnet/shared';
import { WizardStep, STEP_NAMES } from '../navigation.js';
import {
  estimateResources,
  getCredentialTargets,
} from '../../utils/resources.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewItem {
  label: string;
  value: string;
}

export interface ReviewSection {
  id: string;
  title: string;
  step: WizardStep;
  items: ReviewItem[];
}

export interface ReviewResult {
  action: 'generate' | 'modify' | 'export';
  modifyStep?: WizardStep;
  exportPath?: string;
}

// ---------------------------------------------------------------------------
// generateReviewSections
// ---------------------------------------------------------------------------

/**
 * Generate organized review sections from the wizard state.
 * Each section corresponds to a wizard step and lists the relevant selections.
 */
export function generateReviewSections(state: WizardState): ReviewSection[] {
  const sections: ReviewSection[] = [];

  // --- Project section (Step 1) ---
  const projectItems: ReviewItem[] = [
    { label: 'Project Name', value: state.projectName },
    { label: 'Project Path', value: state.projectPath },
    { label: 'Setup Type', value: state.setupType === 'full' ? 'Full Install' : 'Partial Install' },
  ];
  sections.push({
    id: 'project',
    title: 'Project Setup',
    step: WizardStep.ProjectSetup,
    items: projectItems,
  });

  // --- Admin section (Step 2 — top half) ---
  const adminItems: ReviewItem[] = [
    { label: 'Admin Username', value: state.admin.username },
    { label: 'Admin Password', value: '••••••••' }, // masked for security
    { label: 'Credential Storage', value: state.admin.storage },
  ];
  sections.push({
    id: 'admin',
    title: 'Admin Account',
    step: WizardStep.ServerComponents,
    items: adminItems,
  });

  // --- Server Components section (Step 2 — bottom half) ---
  const serverItems: ReviewItem[] = [];

  // Web Server (always enabled)
  serverItems.push({ label: 'Web Server', value: state.servers.webServer.service });

  // Git Server (always enabled)
  serverItems.push({
    label: 'Git Server',
    value: `${state.servers.gitServer.service} (port ${state.servers.gitServer.port}, SSH ${state.servers.gitServer.sshPort})`,
  });

  // File Server
  if (state.servers.fileServer.enabled && state.servers.fileServer.service) {
    serverItems.push({ label: 'File Server', value: state.servers.fileServer.service });
  }

  // Database
  if (state.servers.dbServer.enabled && state.servers.dbServer.primary) {
    const dbLabel = `${state.servers.dbServer.primary} ${state.servers.dbServer.primaryVersion}`.trim();
    serverItems.push({ label: 'Database', value: dbLabel });
    if (state.servers.dbServer.cache) {
      serverItems.push({ label: 'Cache', value: state.servers.dbServer.cache });
    }
    if (state.servers.dbServer.adminUI) {
      serverItems.push({ label: 'DB Admin UI', value: 'Enabled' });
    }
  }

  // Media
  if (state.servers.media.enabled && state.servers.media.services.length > 0) {
    serverItems.push({ label: 'Media', value: state.servers.media.services.join(', ') });
  }

  // SSH
  if (state.servers.sshServer.enabled) {
    const sshDesc = `Port ${state.servers.sshServer.port}${state.servers.sshServer.sftp ? ' + SFTP' : ''}`;
    serverItems.push({ label: 'SSH Server', value: sshDesc });
  }

  // Mail
  if (state.servers.mailServer.enabled) {
    serverItems.push({ label: 'Mail Server', value: state.servers.mailServer.service });
  }

  // FileBrowser
  if (state.servers.fileBrowser.enabled && state.servers.fileBrowser.mode) {
    serverItems.push({ label: 'File Browser', value: state.servers.fileBrowser.mode });
  }

  sections.push({
    id: 'servers',
    title: 'Server Components',
    step: WizardStep.ServerComponents,
    items: serverItems,
  });

  // --- Dev Stack section (Step 3) ---
  const devItems: ReviewItem[] = [];
  if (state.devStack.languages.length > 0) {
    devItems.push({ label: 'Languages', value: state.devStack.languages.join(', ') });
    for (const [lang, fw] of Object.entries(state.devStack.frameworks)) {
      if (fw) {
        devItems.push({ label: `${lang} Framework`, value: fw });
      }
    }
  }
  if (state.devStack.frontend.length > 0) {
    devItems.push({ label: 'Frontend', value: state.devStack.frontend.join(', ') });
  }
  if (devItems.length === 0) {
    devItems.push({ label: 'Dev Stack', value: 'Skipped' });
  }
  sections.push({
    id: 'devStack',
    title: 'Dev Stack & Runtime',
    step: WizardStep.DevStack,
    items: devItems,
  });

  // --- Domain & Network section (Step 4) ---
  const domainItems: ReviewItem[] = [
    { label: 'Domain Provider', value: state.domain.provider },
    { label: 'Domain Name', value: state.domain.name },
    { label: 'SSL', value: state.domain.ssl },
  ];
  if (state.domain.cloudflare.enabled) {
    domainItems.push({ label: 'Cloudflare Tunnel', value: state.domain.cloudflare.tunnelName || 'Enabled' });
  }
  sections.push({
    id: 'domain',
    title: 'Domain & Network',
    step: WizardStep.DomainNetwork,
    items: domainItems,
  });

  // --- Resource Estimate section ---
  const resources = estimateResources(state as any);
  const resourceItems: ReviewItem[] = [
    { label: 'Containers', value: String(resources.containers) },
    { label: 'Estimated RAM', value: resources.ramGB },
    { label: 'Estimated Disk', value: `${resources.diskGB} GB` },
  ];
  sections.push({
    id: 'resources',
    title: 'Resource Estimate',
    step: WizardStep.Review,
    items: resourceItems,
  });

  // --- Credential Propagation section ---
  const targets = getCredentialTargets(state as any);
  if (targets.length > 0) {
    sections.push({
      id: 'credentials',
      title: 'Credential Propagation',
      step: WizardStep.ServerComponents,
      items: targets.map((t) => ({ label: t, value: `← ${state.admin.username}` })),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// exportConfig
// ---------------------------------------------------------------------------

/**
 * Export wizard state to a sanitized config file (no secrets).
 * Writes the file to `<projectPath>/brewnet.config.json`.
 * Returns the absolute path of the written file.
 */
export function exportConfig(state: WizardState, projectPath: string): string {
  // Strip sensitive fields
  const config: BrewnetConfig = {
    schemaVersion: state.schemaVersion,
    projectName: state.projectName,
    projectPath: state.projectPath,
    setupType: state.setupType,
    admin: {
      username: state.admin.username,
      storage: state.admin.storage,
    },
    servers: {
      webServer: { ...state.servers.webServer },
      fileServer: { ...state.servers.fileServer },
      gitServer: { ...state.servers.gitServer },
      dbServer: {
        enabled: state.servers.dbServer.enabled,
        primary: state.servers.dbServer.primary,
        primaryVersion: state.servers.dbServer.primaryVersion,
        dbName: state.servers.dbServer.dbName,
        dbUser: state.servers.dbServer.dbUser,
        adminUI: state.servers.dbServer.adminUI,
        cache: state.servers.dbServer.cache,
        // dbPassword excluded
      },
      media: { ...state.servers.media },
      sshServer: { ...state.servers.sshServer },
      mailServer: { ...state.servers.mailServer },
      appServer: { ...state.servers.appServer },
      fileBrowser: { ...state.servers.fileBrowser },
    },
    devStack: { ...state.devStack },
    boilerplate: { ...state.boilerplate },
    domain: {
      provider: state.domain.provider,
      name: state.domain.name,
      ssl: state.domain.ssl,
      freeDomainTld: state.domain.freeDomainTld,
      cloudflare: {
        enabled: state.domain.cloudflare.enabled,
        tunnelName: state.domain.cloudflare.tunnelName,
        // tunnelToken excluded
      },
    },
  };

  mkdirSync(projectPath, { recursive: true });
  const filePath = join(projectPath, 'brewnet.config.json');
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  return filePath;
}

// ---------------------------------------------------------------------------
// importConfig
// ---------------------------------------------------------------------------

/**
 * Import a config file and restore it to a WizardState.
 * Sensitive fields are populated with empty defaults (to be re-generated).
 */
export function importConfig(configPath: string): WizardState {
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);

  // Validate against the config schema first
  const config = validateBrewnetConfig(parsed);

  // Reconstruct full WizardState by adding back secret fields with defaults
  const state: WizardState = {
    schemaVersion: config.schemaVersion,
    projectName: config.projectName,
    projectPath: config.projectPath,
    setupType: config.setupType,
    admin: {
      username: config.admin.username,
      password: '', // must be re-generated
      storage: config.admin.storage,
    },
    servers: {
      webServer: config.servers.webServer,
      fileServer: config.servers.fileServer,
      gitServer: config.servers.gitServer,
      dbServer: {
        ...config.servers.dbServer,
        dbPassword: '', // must be re-generated
      },
      media: config.servers.media,
      sshServer: config.servers.sshServer,
      mailServer: config.servers.mailServer,
      appServer: config.servers.appServer,
      fileBrowser: config.servers.fileBrowser,
    },
    devStack: config.devStack,
    boilerplate: config.boilerplate,
    domain: {
      ...config.domain,
      cloudflare: {
        ...config.domain.cloudflare,
        tunnelToken: '', // must be re-supplied
      },
    },
  };

  return state;
}

// ---------------------------------------------------------------------------
// runReviewStep (interactive)
// ---------------------------------------------------------------------------

/**
 * Run Step 5: Review & Confirm.
 *
 * Displays all selections in organized sections, shows resource estimates
 * and credential propagation summary, then prompts user for action:
 *   - Generate: proceed to Step 6
 *   - Modify: jump back to a specific step
 *   - Export: write config to file and return
 *
 * @param state - Current wizard state
 * @returns ReviewResult indicating the chosen action
 */
export async function runReviewStep(state: WizardState): Promise<ReviewResult> {
  // -------------------------------------------------------------------------
  // 1. Display header
  // -------------------------------------------------------------------------
  console.log();
  console.log(
    chalk.bold.cyan('  Step 5/7') + chalk.bold(' — Review & Confirm'),
  );
  console.log(chalk.dim('  Review your selections before generating'));
  console.log();

  // -------------------------------------------------------------------------
  // 2. Display all sections
  // -------------------------------------------------------------------------
  const sections = generateReviewSections(state);

  for (const section of sections) {
    console.log(chalk.bold(`  ${section.title}`));
    for (const item of section.items) {
      console.log(`    ${chalk.dim(item.label + ':')} ${item.value}`);
    }
    console.log();
  }

  // -------------------------------------------------------------------------
  // 3. Prompt: Generate / Modify / Export
  // -------------------------------------------------------------------------
  const action = await select<'generate' | 'modify' | 'export'>({
    message: 'What would you like to do?',
    choices: [
      { name: 'Generate — proceed to build and start', value: 'generate' },
      { name: 'Modify — go back and change a section', value: 'modify' },
      { name: 'Export — save configuration to file', value: 'export' },
    ],
  });

  // -------------------------------------------------------------------------
  // 4. Handle action
  // -------------------------------------------------------------------------
  if (action === 'export') {
    const exportDir = await input({
      message: 'Export directory',
      default: state.projectPath,
    });

    const exportPath = exportConfig(state, exportDir);
    console.log();
    console.log(chalk.green(`  Configuration exported to: ${exportPath}`));
    console.log(chalk.dim('  Note: Secrets (passwords, tokens) are excluded from export.'));
    console.log();

    return { action: 'export', exportPath };
  }

  if (action === 'modify') {
    // Build choices from sections (deduplicated by step)
    const stepSet = new Map<WizardStep, string>();
    for (const section of sections) {
      if (!stepSet.has(section.step) && section.step !== WizardStep.Review) {
        stepSet.set(section.step, section.title);
      }
    }

    const modifyStep = await select<WizardStep>({
      message: 'Which section would you like to modify?',
      choices: [...stepSet.entries()].map(([step, title]) => ({
        name: `${STEP_NAMES[step]} — ${title}`,
        value: step,
      })),
    });

    return { action: 'modify', modifyStep };
  }

  // Generate
  return { action: 'generate' };
}
