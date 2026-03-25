/**
 * @file tests/unit/cli/commands/create-app-command.test.ts
 * @description Unit tests for the `brewnet create-app` command handler (runCreateApp).
 *
 * Uses jest.unstable_mockModule for ESM-compatible mocking. All external
 * dependencies (fs, os, ora, inquirer, boilerplate-manager, system-checker)
 * are mocked so no real I/O or Docker calls occur.
 *
 * Test cases covered:
 *   TC-CA-01: Docker check fails  → BrewnetError.dockerNotRunning() displayed
 *   TC-CA-02: Directory already exists → directoryConflict error displayed
 *   TC-CA-03: Invalid --stack ID → resourceNotFound error displayed
 *   TC-CA-04: Invalid --database driver → resourceNotFound error displayed
 *   TC-CA-05: Clone fails → ora spinner.fail('Clone failed') called
 *   TC-CA-06: Full success path → success box with project name printed
 *   TC-CA-07: Health check times out (healthy:false) → error displayed
 *   TC-CA-08: Port-already-in-use in startContainers → port conflict error
 *   TC-CA-09: generateEnv throws → envSpinner.fail called, error propagated
 *   TC-CA-10: reinitGit throws → gitSpinner.fail called, error propagated
 *   TC-CA-11: verifyEndpoints throws → verifySpinner.fail called, error propagated
 *   TC-CA-12: registerCreateAppCommand registers the create-app subcommand
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Shared mock state (mutated per test via mockImplementation)
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<() => boolean>();
const mockMkdirSync = jest.fn<() => undefined>();
const mockAppendFileSync = jest.fn<() => undefined>();
const mockRmSync = jest.fn<() => undefined>();

const mockHomedir = jest.fn<() => string>().mockReturnValue('/home/user');

// ora spinner instance shared across calls
const mockOraInstance = {
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  text: '',
};
const mockOra = jest.fn(() => mockOraInstance);

const mockSelect = jest.fn<() => Promise<string>>();

const mockCheckDocker = jest.fn<() => Promise<{ status: string }>>();
const mockCloneStack = jest.fn<() => Promise<void>>();
const mockGenerateEnv = jest.fn<() => void>();
const mockReinitGit = jest.fn<() => Promise<void>>();
const mockStartContainers = jest.fn<() => Promise<void>>();
const mockPollHealth = jest.fn<
  () => Promise<{ healthy: boolean; elapsedMs: number; dbConnected?: boolean }>
>();
const mockVerifyEndpoints = jest.fn<() => Promise<void>>();

// ---------------------------------------------------------------------------
// jest.unstable_mockModule declarations (must be before any dynamic imports)
// ---------------------------------------------------------------------------

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  appendFileSync: mockAppendFileSync,
  rmSync: mockRmSync,
}));

jest.unstable_mockModule('node:os', () => ({
  homedir: mockHomedir,
  default: { homedir: mockHomedir },
}));

jest.unstable_mockModule('ora', () => ({
  default: mockOra,
}));

jest.unstable_mockModule('@inquirer/prompts', () => ({
  select: mockSelect,
}));

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/boilerplate-manager.js',
  () => ({
    cloneStack: mockCloneStack,
    generateEnv: mockGenerateEnv,
    reinitGit: mockReinitGit,
    startContainers: mockStartContainers,
    pollHealth: mockPollHealth,
    verifyEndpoints: mockVerifyEndpoints,
  }),
);

jest.unstable_mockModule(
  '../../../../packages/cli/src/services/system-checker.js',
  () => ({
    checkDocker: mockCheckDocker,
  }),
);

// ---------------------------------------------------------------------------
// Helper: parse a create-app sub-command
// ---------------------------------------------------------------------------

/**
 * Builds a fresh program with the create-app command registered, then
 * parses the given user args. process.exit is spied on and converted to a
 * thrown Error so tests remain synchronous and avoid early termination.
 */
async function parseCommand(program: Command, args: string[]): Promise<void> {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((_code) => {
    throw new Error('process.exit called');
  });
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch {
    // ignore — expected from process.exit spy or Commander exitOverride
  } finally {
    exitSpy.mockRestore();
    process.exitCode = 0;
  }
}

// ---------------------------------------------------------------------------
// Load SUT after mocks are declared
// ---------------------------------------------------------------------------

let registerCreateAppCommand: (program: Command) => void;

beforeEach(async () => {
  // Re-import SUT fresh each time (jest module registry is reset between files,
  // but within a file we need the same instance — dynamic import is cached after
  // first call, which is acceptable here since mocks are set up above at
  // module-level and per-test via mockImplementation).
  const mod = await import(
    '../../../../packages/cli/src/commands/create-app.js'
  );
  registerCreateAppCommand = mod.registerCreateAppCommand;
});

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

let consoleErrorSpy: ReturnType<typeof jest.spyOn>;
let consoleLogSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  jest.clearAllMocks();

  // Silence output — individual tests assert on captured calls where needed
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  // Reset ora mock to return the shared instance on every call
  mockOra.mockReturnValue(mockOraInstance as ReturnType<typeof mockOraInstance.start>);
  // ora instance methods return `this` so chaining works
  mockOraInstance.start.mockReturnValue(mockOraInstance);
  mockOraInstance.succeed.mockReturnValue(mockOraInstance);
  mockOraInstance.fail.mockReturnValue(mockOraInstance);
  mockOraInstance.stop.mockReturnValue(mockOraInstance);

  // Default homedir
  mockHomedir.mockReturnValue('/home/user');

  // Default: no audit log I/O errors
  mockMkdirSync.mockReturnValue(undefined);
  mockAppendFileSync.mockReturnValue(undefined);
  mockRmSync.mockReturnValue(undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  consoleLogSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// TC-CA-01: Docker check fails
// ---------------------------------------------------------------------------

describe('TC-CA-01: Docker check fails', () => {
  it('displays a Docker error message and calls process.exit', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'fail' });
    mockExistsSync.mockReturnValue(false);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    // BrewnetError.dockerNotRunning() → format() → "Error [BN001]: Docker daemon is not running"
    const allErrorOutput = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrorOutput).toContain('Docker');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-02: Directory already exists
// ---------------------------------------------------------------------------

describe('TC-CA-02: Directory already exists', () => {
  it('displays "already exists" error', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    // First call (pre-flight existsSync) → true means directory exists
    mockExistsSync.mockReturnValue(true);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    const allErrorOutput = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrorOutput).toContain('already exists');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-03: Invalid --stack ID
// ---------------------------------------------------------------------------

describe('TC-CA-03: Invalid --stack ID', () => {
  it('displays "Valid IDs" error when an unknown stack is provided', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nonexistent-stack', '--database', 'sqlite3']);

    const allErrorOutput = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrorOutput).toContain('Valid IDs');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-04: Invalid --database driver
// ---------------------------------------------------------------------------

describe('TC-CA-04: Invalid --database driver', () => {
  it('displays valid driver options when an unknown driver is provided', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'oracle']);

    const allErrorOutput = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    // resourceNotFound includes the valid options list which contains 'sqlite3'
    expect(allErrorOutput).toContain('sqlite3');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-05: Clone fails
// ---------------------------------------------------------------------------

describe('TC-CA-05: Clone fails', () => {
  it('calls cloneSpinner.fail with "Clone failed"', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockRejectedValue(new Error('network error'));

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    expect(mockOraInstance.fail).toHaveBeenCalledWith('Clone failed');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-06: Full success path
// ---------------------------------------------------------------------------

describe('TC-CA-06: Full success path', () => {
  it('prints success box containing the project name', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    mockPollHealth.mockResolvedValue({ healthy: true, elapsedMs: 1500, dbConnected: true });
    mockVerifyEndpoints.mockResolvedValue(undefined);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    const allLogOutput = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLogOutput).toContain('my-app');
  });

  it('calls all boilerplate steps in order', async () => {
    const callOrder: string[] = [];
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockImplementation(async () => { callOrder.push('clone'); });
    mockGenerateEnv.mockImplementation(() => { callOrder.push('generateEnv'); });
    mockReinitGit.mockImplementation(async () => { callOrder.push('reinitGit'); });
    mockStartContainers.mockImplementation(async () => { callOrder.push('startContainers'); });
    mockPollHealth.mockImplementation(async () => {
      callOrder.push('pollHealth');
      return { healthy: true, elapsedMs: 500, dbConnected: true };
    });
    mockVerifyEndpoints.mockImplementation(async () => { callOrder.push('verifyEndpoints'); });

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    expect(callOrder).toEqual(['clone', 'generateEnv', 'reinitGit', 'startContainers', 'pollHealth', 'verifyEndpoints']);
  });

  it('does not call console.error on the happy path', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    mockPollHealth.mockResolvedValue({ healthy: true, elapsedMs: 800, dbConnected: true });
    mockVerifyEndpoints.mockResolvedValue(undefined);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-CA-07: Health check times out
// ---------------------------------------------------------------------------

describe('TC-CA-07: Health check times out', () => {
  it('calls healthSpinner.fail and displays timeout error', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    // healthy:false triggers the timeout branch
    mockPollHealth.mockResolvedValue({ healthy: false, elapsedMs: 120000 });

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    expect(mockOraInstance.fail).toHaveBeenCalledWith('Health check timed out');

    const allErrorOutput = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    // BrewnetError.healthCheckTimeout → "Application health check timed out after Xs"
    expect(allErrorOutput).toMatch(/timed out/i);
  });
});

// ---------------------------------------------------------------------------
// TC-CA-08: Port-already-in-use in startContainers
// ---------------------------------------------------------------------------

describe('TC-CA-08: Port-already-in-use in container start', () => {
  it('displays a port conflict error mentioning the port number', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    // Simulate docker compose output that triggers port conflict branch
    mockStartContainers.mockRejectedValue(
      new Error('Error starting userland proxy: listen tcp :8080 bind: address already in use'),
    );

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    // BrewnetError.portConflict(port) → "Port X is already in use"
    const allErrorOutput = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrorOutput).toMatch(/port|Port/i);
    expect(allErrorOutput).toMatch(/8080/);
  });
});

// ---------------------------------------------------------------------------
// TC-CA-09: generateEnv throws
// ---------------------------------------------------------------------------

describe('TC-CA-09: generateEnv throws', () => {
  it('calls envSpinner.fail when generateEnv throws', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockImplementation(() => {
      throw new Error('.env.example not found');
    });

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    expect(mockOraInstance.fail).toHaveBeenCalledWith('.env generation failed');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-10: reinitGit throws
// ---------------------------------------------------------------------------

describe('TC-CA-10: reinitGit throws', () => {
  it('calls gitSpinner.fail when reinitGit rejects', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockRejectedValue(new Error('git not found'));

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    expect(mockOraInstance.fail).toHaveBeenCalledWith('Git initialization failed');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-11: verifyEndpoints throws
// ---------------------------------------------------------------------------

describe('TC-CA-11: verifyEndpoints throws', () => {
  it('calls verifySpinner.fail when verifyEndpoints rejects', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    mockPollHealth.mockResolvedValue({ healthy: true, elapsedMs: 500, dbConnected: true });
    mockVerifyEndpoints.mockRejectedValue(new Error('GET /api/hello returned 404'));

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    expect(mockOraInstance.fail).toHaveBeenCalledWith('Endpoint verification failed');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-12: registerCreateAppCommand wires up the subcommand
// ---------------------------------------------------------------------------

describe('TC-CA-12: registerCreateAppCommand', () => {
  it('registers a "create-app" subcommand on the given program', () => {
    const program = new Command();
    registerCreateAppCommand(program);

    const names = program.commands.map((c) => c.name());
    expect(names).toContain('create-app');
  });

  it('create-app command accepts --stack option', () => {
    const program = new Command();
    registerCreateAppCommand(program);

    const cmd = program.commands.find((c) => c.name() === 'create-app')!;
    expect(cmd).toBeDefined();
    const stackOpt = cmd.options.find((o) => o.long === '--stack');
    expect(stackOpt).toBeDefined();
  });

  it('create-app command accepts --database option with default "sqlite3"', () => {
    const program = new Command();
    registerCreateAppCommand(program);

    const cmd = program.commands.find((c) => c.name() === 'create-app')!;
    expect(cmd).toBeDefined();
    const dbOpt = cmd.options.find((o) => o.long === '--database');
    expect(dbOpt).toBeDefined();
    expect(dbOpt!.defaultValue).toBe('sqlite3');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-13: Interactive stack selection (no --stack flag)
// ---------------------------------------------------------------------------

describe('TC-CA-13: Interactive stack selection', () => {
  it('runs selectStackInteractively when --stack is not provided', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);

    // First select call returns language 'Node.js', second returns the full StackEntry
    (mockSelect as jest.Mock)
      .mockResolvedValueOnce('Node.js')                    // language selection
      .mockResolvedValueOnce({                              // framework selection
        id: 'nodejs-express',
        language: 'Node.js',
        framework: 'Express 5',
        version: '22',
        orm: 'Prisma 6',
        isUnified: false,
        buildSlow: false,
      });

    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    mockPollHealth.mockResolvedValue({ healthy: true, elapsedMs: 500 });
    mockVerifyEndpoints.mockResolvedValue(undefined);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    // No --stack flag → triggers interactive selection
    await parseCommand(program, ['create-app', 'my-app', '--database', 'sqlite3']);

    expect(mockSelect).toHaveBeenCalledTimes(2);
    const allLogOutput = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLogOutput).toContain('my-app');
  });
});

// ---------------------------------------------------------------------------
// TC-CA-14: Rust buildSlow warning
// ---------------------------------------------------------------------------

describe('TC-CA-14: Rust buildSlow warning', () => {
  it('shows Rust build warning for slow-build stacks', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    mockPollHealth.mockResolvedValue({ healthy: true, elapsedMs: 5000 });
    mockVerifyEndpoints.mockResolvedValue(undefined);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    // rust-actix-web has buildSlow: true
    await parseCommand(program, ['create-app', 'my-app', '--stack', 'rust-actix-web', '--database', 'sqlite3']);

    const allLogOutput = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLogOutput).toMatch(/Rust Warning/i);
  });
});

// ---------------------------------------------------------------------------
// TC-CA-15: startContainers generic error → buildFailed (not port conflict)
// ---------------------------------------------------------------------------

describe('TC-CA-15: startContainers generic failure', () => {
  it('throws buildFailed when startContainers fails with a generic error', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    // Generic error (not "address already in use") → BrewnetError.buildFailed
    mockStartContainers.mockRejectedValue(new Error('docker compose: image pull failed'));

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-express', '--database', 'sqlite3']);

    const allErrorOutput = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    // BrewnetError.buildFailed → "Build failed" or similar
    expect(allErrorOutput).toMatch(/build|Build/i);
  });
});

// ---------------------------------------------------------------------------
// TC-CA-16: Unified stack success path (isUnified=true, line 405)
// ---------------------------------------------------------------------------

describe('TC-CA-16: Unified stack success path', () => {
  it('shows unified app URL line when stack.isUnified is true (L405)', async () => {
    mockCheckDocker.mockResolvedValue({ status: 'pass' });
    mockExistsSync.mockReturnValue(false);
    mockCloneStack.mockResolvedValue(undefined);
    mockGenerateEnv.mockReturnValue(undefined);
    mockReinitGit.mockResolvedValue(undefined);
    mockStartContainers.mockResolvedValue(undefined);
    mockPollHealth.mockResolvedValue({ healthy: true, elapsedMs: 800, dbConnected: true });
    mockVerifyEndpoints.mockResolvedValue(undefined);

    const program = new Command().exitOverride();
    registerCreateAppCommand(program);

    // nodejs-nextjs has isUnified: true → line 405 branch
    await parseCommand(program, ['create-app', 'my-app', '--stack', 'nodejs-nextjs', '--database', 'sqlite3']);

    const allLogOutput = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLogOutput).toContain('my-app');
    // Unified: shows "App (UI + API)" line, NOT separate Frontend/Backend lines
    expect(allLogOutput).toContain('App (UI + API)');
  });
});
