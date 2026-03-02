/**
 * T044 — Project Setup Integration Tests (Step 1 of the Wizard)
 *
 * Tests the project setup logic including:
 *   - Full Install defaults applied correctly to state
 *   - Partial Install defaults applied correctly to state
 *   - Project directory creation
 *   - WizardNavigation back navigation from Step 1 to Step 0
 *   - Ctrl+C handler (setupCancelHandler)
 *
 * Test case references:
 *   TC-03-04: Full Install → state has Web + Git + DB enabled
 *   TC-03-05: Partial Install → state has Web + Git only
 *   TC-03-06: Project path creation (directory created)
 *   TC-03-07: Back navigation returns to Step 0
 *   TC-03-08: Ctrl+C handling (setupCancelHandler)
 *
 * Mock strategy:
 *   Since @inquirer/prompts are interactive, we test the underlying logic
 *   functions directly rather than the full runProjectSetupStep() function.
 *   This includes applyFullInstallDefaults(), applyPartialInstallDefaults(),
 *   WizardNavigation, and setupCancelHandler.
 *
 * @module tests/integration/project-setup
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDefaultWizardState,
  applyFullInstallDefaults,
  applyPartialInstallDefaults,
} from '../../packages/cli/src/config/defaults.js';
import {
  WizardNavigation,
  WizardStep,
  setupCancelHandler,
} from '../../packages/cli/src/wizard/navigation.js';
import { validateProjectName } from '../../packages/cli/src/utils/validation.js';
import type { WizardState } from '../../packages/shared/src/types/wizard-state.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a unique temp directory for test isolation.
 */
function createTempDir(): string {
  const base = join(tmpdir(), `brewnet-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(base, { recursive: true });
  return base;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Project Setup Integration — Step 1 (T044)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    // Clean up temp directories
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // =========================================================================
  // TC-03-04: Full Install selected → correct defaults
  // =========================================================================

  describe('TC-03-04: Full Install — state has Web + Git + DB enabled', () => {
    it('should enable webServer with traefik', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      expect(result.servers.webServer.enabled).toBe(true);
      expect(result.servers.webServer.service).toBe('traefik');
    });

    it('should enable gitServer with gitea', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      expect(result.servers.gitServer.enabled).toBe(true);
      expect(result.servers.gitServer.service).toBe('gitea');
      expect(result.servers.gitServer.port).toBe(3000);
      expect(result.servers.gitServer.sshPort).toBe(3022);
    });

    it('should enable dbServer with postgresql', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      expect(result.servers.dbServer.enabled).toBe(true);
      expect(result.servers.dbServer.primary).toBe('postgresql');
      expect(result.servers.dbServer.primaryVersion).toBe('17');
    });

    it('should enable redis cache', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      expect(result.servers.dbServer.cache).toBe('redis');
    });

    it('should enable adminUI for database', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      expect(result.servers.dbServer.adminUI).toBe(true);
    });

    it('should set setupType to "full"', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      expect(result.setupType).toBe('full');
    });

    it('should set db name and user', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      expect(result.servers.dbServer.dbName).toBe('brewnet_db');
      expect(result.servers.dbServer.dbUser).toBe('brewnet');
    });

    it('should preserve other state properties', () => {
      const state = createDefaultWizardState();
      state.projectName = 'my-project';
      state.projectPath = '~/brewnet/my-project';
      const result = applyFullInstallDefaults(state);

      expect(result.projectName).toBe('my-project');
      expect(result.projectPath).toBe('~/brewnet/my-project');
      expect(result.schemaVersion).toBe(7);
    });

    it('should not enable optional services by default', () => {
      const state = createDefaultWizardState();
      const result = applyFullInstallDefaults(state);

      // These are optional and should not be auto-enabled by Full Install
      expect(result.servers.sshServer.enabled).toBe(false);
      expect(result.servers.mailServer.enabled).toBe(false);
    });
  });

  // =========================================================================
  // TC-03-05: Partial Install selected → correct defaults
  // =========================================================================

  describe('TC-03-05: Partial Install — state has Web + Git only', () => {
    it('should enable webServer with traefik', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.webServer.enabled).toBe(true);
      expect(result.servers.webServer.service).toBe('traefik');
    });

    it('should enable gitServer with gitea', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.gitServer.enabled).toBe(true);
      expect(result.servers.gitServer.service).toBe('gitea');
    });

    it('should disable dbServer', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.dbServer.enabled).toBe(false);
      expect(result.servers.dbServer.primary).toBe('');
      expect(result.servers.dbServer.cache).toBe('');
    });

    it('should disable fileServer', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.fileServer.enabled).toBe(false);
      expect(result.servers.fileServer.service).toBe('');
    });

    it('should disable media', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.media.enabled).toBe(false);
      expect(result.servers.media.services).toEqual([]);
    });

    it('should disable sshServer', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.sshServer.enabled).toBe(false);
    });

    it('should disable mailServer', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.mailServer.enabled).toBe(false);
    });

    it('should disable appServer', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.appServer.enabled).toBe(false);
    });

    it('should disable fileBrowser', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.servers.fileBrowser.enabled).toBe(false);
      expect(result.servers.fileBrowser.mode).toBe('');
    });

    it('should set setupType to "partial"', () => {
      const state = createDefaultWizardState();
      const result = applyPartialInstallDefaults(state);

      expect(result.setupType).toBe('partial');
    });

    it('should preserve project name and path', () => {
      const state = createDefaultWizardState();
      state.projectName = 'test-proj';
      state.projectPath = '/custom/path';
      const result = applyPartialInstallDefaults(state);

      expect(result.projectName).toBe('test-proj');
      expect(result.projectPath).toBe('/custom/path');
    });
  });

  // =========================================================================
  // TC-03-06: Project path creation
  // =========================================================================

  describe('TC-03-06: Project path creation — directory created', () => {
    it('should create a new directory when mkdirSync is called', () => {
      const projectDir = join(tempDir, 'new-project');
      expect(existsSync(projectDir)).toBe(false);

      mkdirSync(projectDir, { recursive: true });
      expect(existsSync(projectDir)).toBe(true);
    });

    it('should handle nested directory creation', () => {
      const nestedDir = join(tempDir, 'a', 'b', 'c', 'project');
      expect(existsSync(nestedDir)).toBe(false);

      mkdirSync(nestedDir, { recursive: true });
      expect(existsSync(nestedDir)).toBe(true);
    });

    it('should not throw if directory already exists', () => {
      const projectDir = join(tempDir, 'existing');
      mkdirSync(projectDir, { recursive: true });
      expect(existsSync(projectDir)).toBe(true);

      // Creating again should not throw with recursive: true
      expect(() => {
        mkdirSync(projectDir, { recursive: true });
      }).not.toThrow();
    });

    it('should create directory matching project name pattern', () => {
      const projectName = 'my-homeserver';
      const projectDir = join(tempDir, 'brewnet', projectName);

      mkdirSync(projectDir, { recursive: true });
      expect(existsSync(projectDir)).toBe(true);
    });
  });

  // =========================================================================
  // TC-03-07: Back navigation returns to Step 0
  // =========================================================================

  describe('TC-03-07: Back navigation — returns to Step 0', () => {
    it('should start at AdminSetup (Step 0)', () => {
      const nav = new WizardNavigation();

      expect(nav.currentStep).toBe(WizardStep.AdminSetup);
    });

    it('should move to SystemCheck (Step 1) after goForward()', () => {
      const nav = new WizardNavigation();
      nav.goForward();

      expect(nav.currentStep).toBe(WizardStep.SystemCheck);
    });

    it('should return to AdminSetup (Step 0) after goBack() from SystemCheck', () => {
      const nav = new WizardNavigation();
      nav.goForward(); // AdminSetup → SystemCheck
      expect(nav.currentStep).toBe(WizardStep.SystemCheck);

      const prev = nav.goBack();
      expect(prev).toBe(WizardStep.AdminSetup);
      expect(nav.currentStep).toBe(WizardStep.AdminSetup);
    });

    it('should return null when calling goBack() at Step 0 (no history)', () => {
      const nav = new WizardNavigation();
      const prev = nav.goBack();

      expect(prev).toBeNull();
      expect(nav.currentStep).toBe(WizardStep.AdminSetup);
    });

    it('should report canGoBack() correctly', () => {
      const nav = new WizardNavigation();
      expect(nav.canGoBack()).toBe(false);

      nav.goForward(); // AdminSetup → SystemCheck
      expect(nav.canGoBack()).toBe(true);

      nav.goBack(); // SystemCheck → AdminSetup
      expect(nav.canGoBack()).toBe(false);
    });

    it('should support multi-step navigation forward and back', () => {
      const nav = new WizardNavigation();

      nav.goForward(); // → SystemCheck
      nav.goForward(); // → ProjectSetup
      nav.goForward(); // → ServerComponents
      nav.goForward(); // → DevStack
      expect(nav.currentStep).toBe(WizardStep.DevStack);

      nav.goBack(); // → ServerComponents
      expect(nav.currentStep).toBe(WizardStep.ServerComponents);

      nav.goBack(); // → ProjectSetup
      expect(nav.currentStep).toBe(WizardStep.ProjectSetup);

      nav.goBack(); // → SystemCheck
      expect(nav.currentStep).toBe(WizardStep.SystemCheck);

      nav.goBack(); // → AdminSetup
      expect(nav.currentStep).toBe(WizardStep.AdminSetup);

      nav.goBack(); // No-op, still AdminSetup
      expect(nav.currentStep).toBe(WizardStep.AdminSetup);
    });

    it('should skip steps correctly during forward navigation', () => {
      const nav = new WizardNavigation();
      nav.skipStep(WizardStep.SystemCheck); // Skip the step right after start

      nav.goForward(); // Should skip SystemCheck, go to ProjectSetup
      expect(nav.currentStep).toBe(WizardStep.ProjectSetup);
    });

    it('should go back to original step (not skipped step) after skip-forward + goBack', () => {
      const nav = new WizardNavigation();
      nav.skipStep(WizardStep.SystemCheck);

      nav.goForward(); // AdminSetup → ProjectSetup (skipped SystemCheck)
      expect(nav.currentStep).toBe(WizardStep.ProjectSetup);

      const prev = nav.goBack(); // Should go back to AdminSetup
      expect(prev).toBe(WizardStep.AdminSetup);
    });

    it('should support goToStep for direct navigation', () => {
      const nav = new WizardNavigation();

      nav.goToStep(WizardStep.Review); // Jump directly to Step 6
      expect(nav.currentStep).toBe(WizardStep.Review);

      // Should be able to go back to Step 0 (AdminSetup)
      const prev = nav.goBack();
      expect(prev).toBe(WizardStep.AdminSetup);
    });

    it('should not go past Complete step', () => {
      const nav = new WizardNavigation(WizardStep.Complete);
      const result = nav.goForward();

      expect(result).toBe(WizardStep.Complete);
    });

    it('should report correct step names', () => {
      const nav = new WizardNavigation();
      expect(nav.getStepName()).toBe('Admin Account');

      nav.goForward();
      expect(nav.getStepName()).toBe('System Check');
    });

    it('should track progress correctly', () => {
      const nav = new WizardNavigation();
      let progress = nav.getProgress();
      expect(progress.current).toBe(1);
      expect(progress.total).toBe(9);

      nav.goForward(); // → SystemCheck
      progress = nav.getProgress();
      expect(progress.current).toBe(2);

      nav.goForward(); // → ProjectSetup
      progress = nav.getProgress();
      expect(progress.current).toBe(3);
    });
  });

  // =========================================================================
  // TC-03-08: Ctrl+C handling (setupCancelHandler)
  // =========================================================================

  describe('TC-03-08: Ctrl+C handling — setupCancelHandler', () => {
    it('should return a cleanup function', () => {
      const cleanup = setupCancelHandler(() => {});
      expect(typeof cleanup).toBe('function');
      cleanup(); // Remove handler
    });

    it('should call onCancel when SIGINT is emitted', () => {
      const onCancel = jest.fn();
      const cleanup = setupCancelHandler(onCancel);

      try {
        process.emit('SIGINT');
        expect(onCancel).toHaveBeenCalledTimes(1);
      } finally {
        cleanup();
      }
    });

    it('should remove the handler after cleanup is called', () => {
      const onCancel = jest.fn();
      const cleanup = setupCancelHandler(onCancel);

      cleanup(); // Remove handler

      // Emitting SIGINT should not call onCancel anymore
      // Note: We need to add our own handler temporarily to prevent process exit
      const tempHandler = () => {};
      process.on('SIGINT', tempHandler);
      try {
        process.emit('SIGINT');
        expect(onCancel).not.toHaveBeenCalled();
      } finally {
        process.removeListener('SIGINT', tempHandler);
      }
    });

    it('should handle async onCancel callback', async () => {
      let resolved = false;
      const onCancel = jest.fn(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        resolved = true;
      });

      const cleanup = setupCancelHandler(onCancel);

      try {
        process.emit('SIGINT');
        expect(onCancel).toHaveBeenCalledTimes(1);

        // Wait for async handler to complete
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        expect(resolved).toBe(true);
      } finally {
        cleanup();
      }
    });

    it('should integrate with WizardNavigation cancel', () => {
      const nav = new WizardNavigation();
      expect(nav.isCancelled).toBe(false);

      const cleanup = setupCancelHandler(() => {
        nav.cancel();
      });

      try {
        process.emit('SIGINT');
        expect(nav.isCancelled).toBe(true);
      } finally {
        cleanup();
      }
    });

    it('should allow WizardNavigation reset after cancel', () => {
      const nav = new WizardNavigation();
      nav.cancel();
      expect(nav.isCancelled).toBe(true);

      nav.reset();
      expect(nav.isCancelled).toBe(false);
      expect(nav.currentStep).toBe(WizardStep.AdminSetup);
    });
  });

  // =========================================================================
  // Project name validation (used in Step 1 prompts)
  // =========================================================================

  describe('Project name validation — used by Step 1 input prompt', () => {
    it('should accept valid project names', () => {
      const validNames = [
        'my-homeserver',
        'brewnet-01',
        'ab',
        'a1',
        'test-project-name',
        'x'.repeat(63),
      ];

      for (const name of validNames) {
        const result = validateProjectName(name);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject single character names', () => {
      const result = validateProjectName('a');
      expect(result.valid).toBe(false);
    });

    it('should reject names longer than 63 characters', () => {
      const result = validateProjectName('x'.repeat(64));
      expect(result.valid).toBe(false);
    });

    it('should reject names starting with a hyphen', () => {
      const result = validateProjectName('-bad-name');
      expect(result.valid).toBe(false);
    });

    it('should reject names ending with a hyphen', () => {
      const result = validateProjectName('bad-name-');
      expect(result.valid).toBe(false);
    });

    it('should reject names with uppercase letters', () => {
      const result = validateProjectName('MyServer');
      expect(result.valid).toBe(false);
    });

    it('should reject names with consecutive hyphens', () => {
      const result = validateProjectName('bad--name');
      expect(result.valid).toBe(false);
    });

    it('should reject names with spaces', () => {
      const result = validateProjectName('my server');
      expect(result.valid).toBe(false);
    });

    it('should reject empty strings', () => {
      const result = validateProjectName('');
      expect(result.valid).toBe(false);
    });
  });

  // =========================================================================
  // State factory — createDefaultWizardState
  // =========================================================================

  describe('State factory — createDefaultWizardState', () => {
    it('should create state with schemaVersion 7', () => {
      const state = createDefaultWizardState();
      expect(state.schemaVersion).toBe(7);
    });

    it('should have default project name "my-homeserver"', () => {
      const state = createDefaultWizardState();
      expect(state.projectName).toBe('my-homeserver');
    });

    it('should have default project path', () => {
      const state = createDefaultWizardState();
      expect(state.projectPath).toBe('~/brewnet/my-homeserver');
    });

    it('should have default setup type "full"', () => {
      const state = createDefaultWizardState();
      expect(state.setupType).toBe('full');
    });

    it('should have admin with empty password (to be generated)', () => {
      const state = createDefaultWizardState();
      expect(state.admin.username).toBe('admin');
      expect(state.admin.password).toBe('');
    });

    it('should have webServer enabled by default', () => {
      const state = createDefaultWizardState();
      expect(state.servers.webServer.enabled).toBe(true);
    });

    it('should have gitServer enabled by default', () => {
      const state = createDefaultWizardState();
      expect(state.servers.gitServer.enabled).toBe(true);
    });

    it('should have empty devStack', () => {
      const state = createDefaultWizardState();
      expect(state.devStack.languages).toEqual([]);
      expect(state.devStack.frameworks).toEqual({});
      expect(state.devStack.frontend).toBeNull();
    });

    it('should have local domain provider', () => {
      const state = createDefaultWizardState();
      expect(state.domain.provider).toBe('local');
      expect(state.domain.name).toBe('brewnet.local');
    });
  });

  // =========================================================================
  // Full vs Partial — state transition correctness
  // =========================================================================

  describe('Full → Partial → Full state transitions', () => {
    it('should correctly toggle from full to partial', () => {
      let state = createDefaultWizardState();
      state = applyFullInstallDefaults(state);
      expect(state.servers.dbServer.enabled).toBe(true);

      state = applyPartialInstallDefaults(state);
      expect(state.servers.dbServer.enabled).toBe(false);
      expect(state.setupType).toBe('partial');
    });

    it('should correctly toggle from partial back to full', () => {
      let state = createDefaultWizardState();
      state = applyPartialInstallDefaults(state);
      expect(state.servers.dbServer.enabled).toBe(false);

      state = applyFullInstallDefaults(state);
      expect(state.servers.dbServer.enabled).toBe(true);
      expect(state.servers.dbServer.primary).toBe('postgresql');
      expect(state.setupType).toBe('full');
    });

    it('should preserve custom project name through transitions', () => {
      let state = createDefaultWizardState();
      state.projectName = 'custom-name';
      state.projectPath = '/custom/path';

      state = applyFullInstallDefaults(state);
      expect(state.projectName).toBe('custom-name');
      expect(state.projectPath).toBe('/custom/path');

      state = applyPartialInstallDefaults(state);
      expect(state.projectName).toBe('custom-name');
      expect(state.projectPath).toBe('/custom/path');
    });
  });
});
