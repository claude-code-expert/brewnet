/**
 * Additional unit tests for config/defaults
 *
 * Covers: applyMinimalInstallDefaults (L167) not tested elsewhere.
 */

import { describe, it, expect } from '@jest/globals';
import {
  createDefaultWizardState,
  applyMinimalInstallDefaults,
} from '../../../../packages/cli/src/config/defaults.js';

describe('applyMinimalInstallDefaults', () => {
  it('sets setupType to minimal and enables only web+git servers', () => {
    const base = createDefaultWizardState();
    const result = applyMinimalInstallDefaults(base);

    expect(result.setupType).toBe('minimal');
    expect(result.servers.webServer.enabled).toBe(true);
    expect(result.servers.webServer.service).toBe('traefik');
    expect(result.servers.gitServer.enabled).toBe(true);
    expect(result.servers.gitServer.service).toBe('gitea');
    expect(result.servers.fileServer.enabled).toBe(false);
    expect(result.servers.dbServer.enabled).toBe(false);
  });

  it('preserves the original state projectName', () => {
    const base = { ...createDefaultWizardState(), projectName: 'my-app' };
    const result = applyMinimalInstallDefaults(base);
    expect(result.projectName).toBe('my-app');
  });
});
