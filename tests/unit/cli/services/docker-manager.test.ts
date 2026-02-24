/**
 * Unit tests for Docker Manager — Docker daemon availability check (T025).
 *
 * Test case reference:
 *   TC-01-04: When Docker daemon is not running, any Docker-dependent operation
 *             should produce error with code `BN001` and exit 1.
 *
 * These are TDD tests — they define the expected behavior of
 * `checkDockerAvailability()` before (or alongside) the implementation.
 *
 * Mock strategy:
 *   - `dockerode` is mocked via `jest.unstable_mockModule` (ESM-compatible).
 *   - The module under test is dynamically imported AFTER mocks are registered.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock setup — must come before any dynamic imports of the module under test
// ---------------------------------------------------------------------------

const mockPing = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => ({
    ping: mockPing,
  })),
}));

// ---------------------------------------------------------------------------
// Dynamic imports (after mock registration)
// ---------------------------------------------------------------------------

const { checkDockerAvailability } = await import(
  '../../../../packages/cli/src/services/docker-manager.js'
);

const { BrewnetError, isBrewnetError } = await import(
  '../../../../packages/cli/src/utils/errors.js'
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DockerManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // checkDockerAvailability — Happy path
  // =========================================================================

  describe('checkDockerAvailability() — Docker daemon is running', () => {
    it('should return { available: true } when ping succeeds', async () => {
      mockPing.mockResolvedValueOnce('OK');

      const result = await checkDockerAvailability();

      expect(result).toEqual({ available: true });
    });

    it('should call docker.ping() exactly once', async () => {
      mockPing.mockResolvedValueOnce('OK');

      await checkDockerAvailability();

      expect(mockPing).toHaveBeenCalledTimes(1);
    });

    it('should return available: true regardless of the ping response value', async () => {
      // Docker ping can return different payloads; what matters is it resolves.
      mockPing.mockResolvedValueOnce('whatever');

      const result = await checkDockerAvailability();

      expect(result).toEqual({ available: true });
      expect(result.available).toBe(true);
    });
  });

  // =========================================================================
  // checkDockerAvailability — Error path (TC-01-04)
  // =========================================================================

  describe('checkDockerAvailability() — Docker daemon is NOT running (TC-01-04)', () => {
    it('should throw when docker.ping() rejects', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      await expect(checkDockerAvailability()).rejects.toThrow();
    });

    it('should throw a BrewnetError instance', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        // If we reach here, the test should fail
        expect(true).toBe(false);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(BrewnetError);
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('should throw with error code BN001', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        expect(isBrewnetError(err)).toBe(true);
        if (isBrewnetError(err)) {
          expect(err.code).toBe('BN001');
        }
      }
    });

    it('should throw with HTTP status 503 (Service Unavailable)', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          expect(err.httpStatus).toBe(503);
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });

    it('should throw with message indicating Docker daemon is not running', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          expect(err.message).toBe('Docker daemon is not running');
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });

    it('should include remediation advice mentioning Docker Desktop or systemctl', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          expect(err.remediation).toContain('Docker');
          // Should mention at least one way to fix it
          const mentionsDesktop = err.remediation.includes('Docker Desktop');
          const mentionsSystemctl = err.remediation.includes('systemctl start docker');
          expect(mentionsDesktop || mentionsSystemctl).toBe(true);
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });

    it('should throw BN001 for ENOENT errors (Docker socket missing)', async () => {
      mockPing.mockRejectedValueOnce(
        new Error('connect ENOENT /var/run/docker.sock'),
      );

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          expect(err.code).toBe('BN001');
          expect(err.httpStatus).toBe(503);
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });

    it('should throw BN001 for permission denied errors', async () => {
      const permError = new Error('permission denied') as NodeJS.ErrnoException;
      permError.code = 'EACCES';
      mockPing.mockRejectedValueOnce(permError);

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          expect(err.code).toBe('BN001');
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });

    it('should throw BN001 for timeout errors', async () => {
      mockPing.mockRejectedValueOnce(new Error('request timeout'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          expect(err.code).toBe('BN001');
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });

    it('should set error name to "BrewnetError"', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.name).toBe('BrewnetError');
        } else {
          throw new Error('Expected an Error instance');
        }
      }
    });
  });

  // =========================================================================
  // Error serialization (format / toJSON)
  // =========================================================================

  describe('BN001 error serialization', () => {
    it('should produce valid JSON with code, message, httpStatus, and remediation', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          const json = err.toJSON();
          expect(json).toHaveProperty('code', 'BN001');
          expect(json).toHaveProperty('message', 'Docker daemon is not running');
          expect(json).toHaveProperty('httpStatus', 503);
          expect(json).toHaveProperty('remediation');
          expect(typeof json.remediation).toBe('string');
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });

    it('should produce a human-readable format() output including the error code', async () => {
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      try {
        await checkDockerAvailability();
        expect(true).toBe(false);
      } catch (err: unknown) {
        if (isBrewnetError(err)) {
          const formatted = err.format();
          expect(formatted).toContain('[BN001]');
          expect(formatted).toContain('Docker daemon is not running');
        } else {
          throw new Error('Expected BrewnetError');
        }
      }
    });
  });

  // =========================================================================
  // Concise assertions using rejects matchers
  // =========================================================================

  describe('checkDockerAvailability() — rejects matchers', () => {
    it('should reject with BrewnetError when ping fails', async () => {
      mockPing.mockRejectedValueOnce(new Error('cannot connect'));

      await expect(checkDockerAvailability()).rejects.toBeInstanceOf(BrewnetError);
    });

    it('should reject with matching error properties', async () => {
      mockPing.mockRejectedValueOnce(new Error('cannot connect'));

      await expect(checkDockerAvailability()).rejects.toMatchObject({
        code: 'BN001',
        httpStatus: 503,
        message: 'Docker daemon is not running',
        name: 'BrewnetError',
      });
    });

    it('should resolve when ping succeeds', async () => {
      mockPing.mockResolvedValueOnce('OK');

      await expect(checkDockerAvailability()).resolves.toEqual({
        available: true,
      });
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle docker.ping() rejecting with a non-Error value', async () => {
      // Some libraries reject with strings or plain objects
      mockPing.mockRejectedValueOnce('connection failed');

      await expect(checkDockerAvailability()).rejects.toBeInstanceOf(BrewnetError);
    });

    it('should throw BN001 when ping rejects with a string', async () => {
      mockPing.mockRejectedValueOnce('connection failed');

      await expect(checkDockerAvailability()).rejects.toMatchObject({
        code: 'BN001',
      });
    });

    it('should handle docker.ping() rejecting with undefined', async () => {
      mockPing.mockRejectedValueOnce(undefined);

      await expect(checkDockerAvailability()).rejects.toMatchObject({
        code: 'BN001',
      });
    });

    it('should not return available: false — it either succeeds or throws', async () => {
      // Verify the contract: success returns { available: true }, failure throws.
      // There is no { available: false } return path.
      mockPing.mockResolvedValueOnce('OK');
      const result = await checkDockerAvailability();
      expect(result.available).toBe(true);
      expect(Object.keys(result)).toEqual(['available']);
    });

    it('should create a new Dockerode instance when no options provided', async () => {
      const Dockerode = (await import('dockerode')).default;
      mockPing.mockResolvedValueOnce('OK');

      await checkDockerAvailability();

      expect(Dockerode).toHaveBeenCalled();
    });

    it('should use provided docker instance from options when given', async () => {
      const customPing = jest.fn<() => Promise<string>>().mockResolvedValueOnce('OK');
      const customDocker = { ping: customPing } as unknown as import('dockerode').default;

      const result = await checkDockerAvailability({ docker: customDocker });

      expect(result).toEqual({ available: true });
      expect(customPing).toHaveBeenCalledTimes(1);
      // The default mock should NOT have been called
      expect(mockPing).not.toHaveBeenCalled();
    });

    it('should throw BN001 when custom docker instance ping fails', async () => {
      const customPing = jest.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('custom failure'));
      const customDocker = { ping: customPing } as unknown as import('dockerode').default;

      await expect(checkDockerAvailability({ docker: customDocker })).rejects.toMatchObject({
        code: 'BN001',
        httpStatus: 503,
      });
    });
  });

  // =========================================================================
  // Multiple sequential calls
  // =========================================================================

  describe('sequential availability checks', () => {
    it('should handle Docker becoming available between calls', async () => {
      // First call: Docker is down
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      await expect(checkDockerAvailability()).rejects.toMatchObject({
        code: 'BN001',
      });

      // Second call: Docker is now running
      mockPing.mockResolvedValueOnce('OK');
      const result = await checkDockerAvailability();
      expect(result).toEqual({ available: true });
    });

    it('should handle Docker going down between calls', async () => {
      // First call: Docker is running
      mockPing.mockResolvedValueOnce('OK');
      const result = await checkDockerAvailability();
      expect(result).toEqual({ available: true });

      // Second call: Docker went down
      mockPing.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      await expect(checkDockerAvailability()).rejects.toMatchObject({
        code: 'BN001',
      });
    });
  });
});
