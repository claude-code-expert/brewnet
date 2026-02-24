/**
 * Unit tests for the Brewnet structured error system (T014).
 *
 * Covers every error code (BN001-BN010), factory methods, format(),
 * toJSON(), isBrewnetError(), and proper Error inheritance.
 */

import { BrewnetError, isBrewnetError } from '../../../../packages/cli/src/utils/errors.js';
import type { BrewnetErrorCode } from '../../../../packages/cli/src/utils/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that a BrewnetError has the expected shape. */
function expectBrewnetError(
  err: BrewnetError,
  expected: {
    code: BrewnetErrorCode;
    httpStatus: number;
    messageIncludes: string;
    remediationIncludes: string;
  },
) {
  expect(err).toBeInstanceOf(BrewnetError);
  expect(err).toBeInstanceOf(Error);
  expect(err.name).toBe('BrewnetError');
  expect(err.code).toBe(expected.code);
  expect(err.httpStatus).toBe(expected.httpStatus);
  expect(err.message).toContain(expected.messageIncludes);
  expect(err.remediation).toContain(expected.remediationIncludes);
}

// ---------------------------------------------------------------------------
// Constructor & inheritance
// ---------------------------------------------------------------------------

describe('BrewnetError', () => {
  describe('constructor and Error inheritance', () => {
    it('should extend Error and be an instance of both Error and BrewnetError', () => {
      const err = new BrewnetError('BN001', 'test', 500, 'fix it');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BrewnetError);
    });

    it('should set name to "BrewnetError"', () => {
      const err = new BrewnetError('BN001', 'test', 500, 'fix it');
      expect(err.name).toBe('BrewnetError');
    });

    it('should preserve message via Error.prototype.message', () => {
      const err = new BrewnetError('BN002', 'custom message', 409, 'hint');
      expect(err.message).toBe('custom message');
    });

    it('should store code, httpStatus, and remediation as readonly properties', () => {
      const err = new BrewnetError('BN003', 'msg', 500, 'remedy');
      expect(err.code).toBe('BN003');
      expect(err.httpStatus).toBe(500);
      expect(err.remediation).toBe('remedy');
    });

    it('should have a stack trace', () => {
      const err = new BrewnetError('BN001', 'test', 500, 'fix it');
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('BrewnetError');
    });

    it('should work correctly in try/catch', () => {
      try {
        throw new BrewnetError('BN001', 'thrown', 503, 'remedy');
      } catch (e) {
        expect(e).toBeInstanceOf(BrewnetError);
        expect(e).toBeInstanceOf(Error);
        if (e instanceof BrewnetError) {
          expect(e.code).toBe('BN001');
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // format()
  // -------------------------------------------------------------------------

  describe('format()', () => {
    it('should return a string with Error [CODE]: message on the first line', () => {
      const err = new BrewnetError('BN001', 'Something broke', 500, 'Try again');
      const output = err.format();
      expect(output).toContain('Error [BN001]: Something broke');
    });

    it('should include the remediation text indented', () => {
      const err = new BrewnetError('BN005', 'Rate limited', 429, 'Wait and retry');
      const output = err.format();
      expect(output).toContain('  Wait and retry');
    });

    it('should have an empty line between the error line and remediation', () => {
      const err = new BrewnetError('BN001', 'msg', 500, 'fix');
      const lines = err.format().split('\n');
      expect(lines[0]).toBe('Error [BN001]: msg');
      expect(lines[1]).toBe('');
      expect(lines[2]).toBe('  fix');
    });

    it('should preserve multiline remediation text', () => {
      const multiline = 'Line one\nLine two\nLine three';
      const err = new BrewnetError('BN009', 'db error', 500, multiline);
      const output = err.format();
      expect(output).toContain('Line one');
      expect(output).toContain('Line two');
      expect(output).toContain('Line three');
    });
  });

  // -------------------------------------------------------------------------
  // toJSON()
  // -------------------------------------------------------------------------

  describe('toJSON()', () => {
    it('should return an object with code, message, httpStatus, and remediation', () => {
      const err = new BrewnetError('BN004', 'invalid key', 401, 'check key');
      const json = err.toJSON();
      expect(json).toEqual({
        code: 'BN004',
        message: 'invalid key',
        httpStatus: 401,
        remediation: 'check key',
      });
    });

    it('should be JSON-serializable (no circular references)', () => {
      const err = BrewnetError.dockerNotRunning();
      const serialized = JSON.stringify(err.toJSON());
      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('should not include stack or name in the JSON output', () => {
      const err = BrewnetError.dockerNotRunning();
      const json = err.toJSON();
      expect(json).not.toHaveProperty('stack');
      expect(json).not.toHaveProperty('name');
    });

    it('should produce an object suitable for structured logging', () => {
      const err = BrewnetError.portConflict(8080, 'nginx');
      const json = err.toJSON();
      expect(Object.keys(json).sort()).toEqual(
        ['code', 'httpStatus', 'message', 'remediation'].sort(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Factory methods — BN001 through BN010
  // -------------------------------------------------------------------------

  describe('factory methods', () => {
    // BN001 — dockerNotRunning
    describe('dockerNotRunning() [BN001]', () => {
      it('should create a BN001 error with status 503', () => {
        const err = BrewnetError.dockerNotRunning();
        expectBrewnetError(err, {
          code: 'BN001',
          httpStatus: 503,
          messageIncludes: 'Docker daemon is not running',
          remediationIncludes: 'Docker is required',
        });
      });

      it('should include platform-specific fix hints', () => {
        const err = BrewnetError.dockerNotRunning();
        expect(err.remediation).toContain('macOS');
        expect(err.remediation).toContain('Linux');
        expect(err.remediation).toContain('Docker Desktop');
        expect(err.remediation).toContain('systemctl start docker');
      });
    });

    // BN002 — portConflict
    describe('portConflict() [BN002]', () => {
      it('should create a BN002 error with the specified port and status 409', () => {
        const err = BrewnetError.portConflict(3000);
        expectBrewnetError(err, {
          code: 'BN002',
          httpStatus: 409,
          messageIncludes: 'Port 3000 is already in use',
          remediationIncludes: 'Port 3000 is required',
        });
      });

      it('should include process info when provided', () => {
        const err = BrewnetError.portConflict(8080, 'nginx');
        expect(err.message).toContain('in use by nginx');
      });

      it('should omit process info when not provided', () => {
        const err = BrewnetError.portConflict(8080);
        expect(err.message).toBe('Port 8080 is already in use');
        expect(err.message).not.toContain('in use by');
      });

      it('should include lsof hint with the correct port', () => {
        const err = BrewnetError.portConflict(443);
        expect(err.remediation).toContain('lsof -i :443');
      });
    });

    // BN003 — sslFailed
    describe('sslFailed() [BN003]', () => {
      it('should create a BN003 error for the given domain with status 500', () => {
        const err = BrewnetError.sslFailed('example.com');
        expectBrewnetError(err, {
          code: 'BN003',
          httpStatus: 500,
          messageIncludes: 'SSL certificate issuance failed for example.com',
          remediationIncludes: "Let's Encrypt",
        });
      });

      it('should include DNS verification hint with the domain', () => {
        const err = BrewnetError.sslFailed('mysite.dev');
        expect(err.remediation).toContain('dig +short mysite.dev');
        expect(err.remediation).toContain('brewnet domain ssl mysite.dev');
      });

      it('should mention Cloudflare Tunnel as an alternative', () => {
        const err = BrewnetError.sslFailed('test.org');
        expect(err.remediation).toContain('Cloudflare Tunnel');
      });
    });

    // BN004 — invalidLicense
    describe('invalidLicense() [BN004]', () => {
      it('should create a BN004 error with status 401', () => {
        const err = BrewnetError.invalidLicense();
        expectBrewnetError(err, {
          code: 'BN004',
          httpStatus: 401,
          messageIncludes: 'Invalid or expired license key',
          remediationIncludes: 'license key is invalid or has expired',
        });
      });

      it('should include the account URL and config command', () => {
        const err = BrewnetError.invalidLicense();
        expect(err.remediation).toContain('https://brewnet.dev/account');
        expect(err.remediation).toContain('brewnet config set license');
      });
    });

    // BN005 — rateLimited
    describe('rateLimited() [BN005]', () => {
      it('should create a BN005 error with status 429', () => {
        const err = BrewnetError.rateLimited();
        expectBrewnetError(err, {
          code: 'BN005',
          httpStatus: 429,
          messageIncludes: 'Rate limit exceeded',
          remediationIncludes: 'Too many requests',
        });
      });

      it('should mention CI usage consideration', () => {
        const err = BrewnetError.rateLimited();
        expect(err.remediation).toContain('CI');
      });
    });

    // BN006 — buildFailed
    describe('buildFailed() [BN006]', () => {
      it('should create a BN006 error with status 500 (no logs)', () => {
        const err = BrewnetError.buildFailed();
        expectBrewnetError(err, {
          code: 'BN006',
          httpStatus: 500,
          messageIncludes: 'Application build failed',
          remediationIncludes: 'build process exited with a non-zero status',
        });
      });

      it('should include build log snippet when logs are provided', () => {
        const logs = 'line1\nline2\nline3\nline4\nline5\nline6\nERROR: final line';
        const err = BrewnetError.buildFailed(logs);
        expect(err.remediation).toContain('Build output (last lines)');
        expect(err.remediation).toContain('ERROR: final line');
      });

      it('should show at most the last 5 lines of build logs', () => {
        const lines = Array.from({ length: 10 }, (_, i) => `log line ${i + 1}`);
        const logs = lines.join('\n');
        const err = BrewnetError.buildFailed(logs);
        // Last 5 lines: log line 6 through log line 10
        expect(err.remediation).toContain('log line 6');
        expect(err.remediation).toContain('log line 10');
        expect(err.remediation).not.toContain('log line 5');
      });

      it('should not include build output section when logs are undefined', () => {
        const err = BrewnetError.buildFailed();
        expect(err.remediation).not.toContain('Build output');
      });

      it('should mention brewnet.yml and the logs command', () => {
        const err = BrewnetError.buildFailed();
        expect(err.remediation).toContain('brewnet.yml');
        expect(err.remediation).toContain('brewnet logs --build');
      });
    });

    // BN007 — invalidGitRepo
    describe('invalidGitRepo() [BN007]', () => {
      it('should create a BN007 error with the path and status 400', () => {
        const err = BrewnetError.invalidGitRepo('/srv/myproject');
        expectBrewnetError(err, {
          code: 'BN007',
          httpStatus: 400,
          messageIncludes: 'Not a valid Git repository: /srv/myproject',
          remediationIncludes: 'not a Git repository',
        });
      });

      it('should include path-specific fix commands', () => {
        const err = BrewnetError.invalidGitRepo('/home/user/app');
        expect(err.remediation).toContain('ls -la /home/user/app');
        expect(err.remediation).toContain('git init /home/user/app');
      });
    });

    // BN008 — resourceNotFound
    describe('resourceNotFound() [BN008]', () => {
      it('should create a BN008 error for the given resource with status 404', () => {
        const err = BrewnetError.resourceNotFound('jellyfin');
        expectBrewnetError(err, {
          code: 'BN008',
          httpStatus: 404,
          messageIncludes: 'Resource not found: jellyfin',
          remediationIncludes: '"jellyfin" could not be found',
        });
      });

      it('should suggest brewnet status to list available resources', () => {
        const err = BrewnetError.resourceNotFound('nonexistent-service');
        expect(err.remediation).toContain('brewnet status');
      });
    });

    // BN009 — databaseError
    describe('databaseError() [BN009]', () => {
      it('should create a BN009 error with detail and status 500', () => {
        const err = BrewnetError.databaseError('SQLITE_CORRUPT');
        expectBrewnetError(err, {
          code: 'BN009',
          httpStatus: 500,
          messageIncludes: 'Database error: SQLITE_CORRUPT',
          remediationIncludes: 'internal database operation failed',
        });
      });

      it('should include disk space and permission checks in remediation', () => {
        const err = BrewnetError.databaseError('disk full');
        expect(err.remediation).toContain('df -h');
        expect(err.remediation).toContain('~/.brewnet/db/');
        expect(err.remediation).toContain('brewnet config reset-db');
      });
    });

    // BN010 — proRequired
    describe('proRequired() [BN010]', () => {
      it('should create a BN010 error for the given feature with status 403', () => {
        const err = BrewnetError.proRequired('Web Dashboard');
        expectBrewnetError(err, {
          code: 'BN010',
          httpStatus: 403,
          messageIncludes: '"Web Dashboard" requires a Brewnet Pro subscription',
          remediationIncludes: 'Pro plan',
        });
      });

      it('should include pricing URL and license command', () => {
        const err = BrewnetError.proRequired('monitoring');
        expect(err.remediation).toContain('https://brewnet.dev/pricing');
        expect(err.remediation).toContain('brewnet config set license');
      });

      it('should mention both Pro and Team plan pricing', () => {
        const err = BrewnetError.proRequired('ACL');
        expect(err.remediation).toContain('$9/mo');
        expect(err.remediation).toContain('$29/mo/server');
      });
    });
  });

  // -------------------------------------------------------------------------
  // isBrewnetError() type guard
  // -------------------------------------------------------------------------

  describe('isBrewnetError()', () => {
    it('should return true for a BrewnetError instance', () => {
      const err = BrewnetError.dockerNotRunning();
      expect(isBrewnetError(err)).toBe(true);
    });

    it('should return true for a manually constructed BrewnetError', () => {
      const err = new BrewnetError('BN001', 'msg', 500, 'fix');
      expect(isBrewnetError(err)).toBe(true);
    });

    it('should return false for a plain Error', () => {
      const err = new Error('plain error');
      expect(isBrewnetError(err)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isBrewnetError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isBrewnetError(undefined)).toBe(false);
    });

    it('should return false for a string', () => {
      expect(isBrewnetError('BN001')).toBe(false);
    });

    it('should return false for a number', () => {
      expect(isBrewnetError(503)).toBe(false);
    });

    it('should return false for a plain object that looks like a BrewnetError', () => {
      const fake = {
        code: 'BN001',
        message: 'Docker daemon is not running',
        httpStatus: 503,
        remediation: 'fix it',
        name: 'BrewnetError',
      };
      expect(isBrewnetError(fake)).toBe(false);
    });

    it('should return true when caught as unknown in a catch block', () => {
      try {
        throw BrewnetError.rateLimited();
      } catch (e: unknown) {
        expect(isBrewnetError(e)).toBe(true);
        if (isBrewnetError(e)) {
          expect(e.code).toBe('BN005');
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Comprehensive error code coverage
  // -------------------------------------------------------------------------

  describe('all error codes produce correct HTTP statuses', () => {
    const cases: Array<[string, () => BrewnetError, BrewnetErrorCode, number]> = [
      ['BN001', () => BrewnetError.dockerNotRunning(), 'BN001', 503],
      ['BN002', () => BrewnetError.portConflict(80), 'BN002', 409],
      ['BN003', () => BrewnetError.sslFailed('x.com'), 'BN003', 500],
      ['BN004', () => BrewnetError.invalidLicense(), 'BN004', 401],
      ['BN005', () => BrewnetError.rateLimited(), 'BN005', 429],
      ['BN006', () => BrewnetError.buildFailed(), 'BN006', 500],
      ['BN007', () => BrewnetError.invalidGitRepo('/tmp'), 'BN007', 400],
      ['BN008', () => BrewnetError.resourceNotFound('svc'), 'BN008', 404],
      ['BN009', () => BrewnetError.databaseError('err'), 'BN009', 500],
      ['BN010', () => BrewnetError.proRequired('feat'), 'BN010', 403],
    ];

    it.each(cases)(
      '%s should produce httpStatus %i',
      (_label, factory, expectedCode, expectedStatus) => {
        const err = factory();
        expect(err.code).toBe(expectedCode);
        expect(err.httpStatus).toBe(expectedStatus);
      },
    );
  });

  describe('all factory methods return BrewnetError instances with non-empty remediation', () => {
    const factories: Array<[string, () => BrewnetError]> = [
      ['dockerNotRunning', () => BrewnetError.dockerNotRunning()],
      ['portConflict', () => BrewnetError.portConflict(3000)],
      ['sslFailed', () => BrewnetError.sslFailed('test.com')],
      ['invalidLicense', () => BrewnetError.invalidLicense()],
      ['rateLimited', () => BrewnetError.rateLimited()],
      ['buildFailed', () => BrewnetError.buildFailed()],
      ['invalidGitRepo', () => BrewnetError.invalidGitRepo('/x')],
      ['resourceNotFound', () => BrewnetError.resourceNotFound('x')],
      ['databaseError', () => BrewnetError.databaseError('x')],
      ['proRequired', () => BrewnetError.proRequired('x')],
    ];

    it.each(factories)('%s() should return a BrewnetError with non-empty remediation', (_name, factory) => {
      const err = factory();
      expect(err).toBeInstanceOf(BrewnetError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('BrewnetError');
      expect(err.remediation.length).toBeGreaterThan(0);
      expect(err.message.length).toBeGreaterThan(0);
    });
  });
});
