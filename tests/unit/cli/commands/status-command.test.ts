/**
 * Unit tests for commands/status registerStatusCommand action
 *
 * Covers:
 *   - Docker not available guard (lines 267-274)
 *   - docker compose ps call and JSON output mode (lines 276-292)
 *   - Table output mode with running count summary (lines 290-297)
 *   - Error handling: no config file, generic (lines 299-315)
 *   - parseDockerComposePsEntry: name derivation, state mapping, port filtering (lines 203-226)
 *   - parseDockerComposePsOutput: JSON array, NDJSON, empty, malformed (lines 228-253)
 *   - parseUptime edge cases: "About a minute" (line 105), fallback (line 126)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Mocks (must precede dynamic import)
// ---------------------------------------------------------------------------

const mockCheckDockerAvailability = jest.fn();
jest.unstable_mockModule('../../../../packages/cli/src/services/docker-manager.js', () => ({
  checkDockerAvailability: mockCheckDockerAvailability,
}));

const mockExeca = jest.fn();
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { registerStatusCommand } = await import('../../../../packages/cli/src/commands/status.js');
const { BrewnetError } = await import('../../../../packages/cli/src/utils/errors.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RunResult = { stdout: string; stderr: string; exitCode: number | undefined };

async function runStatusCommand(args: string[] = []): Promise<RunResult> {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  const origExitCode = process.exitCode;

  console.log = (...a: unknown[]) => logs.push(a.map(String).join(' '));
  console.error = (...a: unknown[]) => errors.push(a.map(String).join(' '));
  process.exitCode = undefined;

  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerStatusCommand(program);

  try {
    await program.parseAsync(['status', ...args], { from: 'user' });
  } catch {
    // commander exitOverride may throw — ignore
  }

  const result: RunResult = {
    stdout: logs.join('\n'),
    stderr: errors.join('\n'),
    exitCode: process.exitCode as number | undefined,
  };

  console.log = origLog;
  console.error = origError;
  process.exitCode = origExitCode;

  return result;
}

function makeExecaSuccess(stdout: string) {
  return Object.assign(Promise.resolve({ stdout, stderr: '', exitCode: 0 }), {
    kill: () => {},
  });
}

// ---------------------------------------------------------------------------
// Guard: Docker not available
// ---------------------------------------------------------------------------

describe('registerStatusCommand — Docker guard', () => {
  beforeEach(() => {
    mockCheckDockerAvailability.mockReset();
    mockExeca.mockReset();
  });

  it('prints BN001 error and sets exitCode=1 when Docker unavailable (BrewnetError)', async () => {
    mockCheckDockerAvailability.mockRejectedValue(BrewnetError.dockerNotRunning());

    const result = await runStatusCommand();

    expect(result.stderr).toContain('BN001');
    expect(result.exitCode).toBe(1);
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('prints error message and sets exitCode=1 when non-BrewnetError thrown', async () => {
    mockCheckDockerAvailability.mockRejectedValue(new Error('connection refused'));

    const result = await runStatusCommand();

    expect(result.stderr).toContain('connection refused');
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// JSON array output format
// ---------------------------------------------------------------------------

describe('registerStatusCommand — JSON array format', () => {
  beforeEach(() => {
    mockCheckDockerAvailability.mockReset().mockResolvedValue(undefined);
    mockExeca.mockReset();
  });

  it('outputs parsed containers as JSON when --json flag is set', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'traefik',
        State: 'running',
        Status: 'Up 2 hours',
        Image: 'traefik:v2.10',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand(['--json']);
    const parsed: unknown[] = JSON.parse(result.stdout);

    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed[0] as Record<string, unknown>).name).toBe('traefik');
    expect((parsed[0] as Record<string, unknown>).state).toBe('running');
  });

  it('outputs formatted table by default without --json', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'gitea',
        State: 'running',
        Status: 'Up 1 hour',
        Image: 'gitea/gitea:1.21',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand();

    expect(result.stdout).toContain('gitea');
    expect(result.stdout).toMatch(/Name|Status|Image/);
  });

  it('shows "N/M services running" summary when containers present', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'traefik',
        State: 'running',
        Status: 'Up 2h',
        Image: 'traefik:v2',
        Publishers: [],
        Created: 0,
      },
      {
        Service: 'gitea',
        State: 'exited',
        Status: 'Exited (0)',
        Image: 'gitea/gitea:1.21',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand();

    expect(result.stdout).toContain('1/2');
  });

  it('shows "No services running" message for empty JSON array', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess(JSON.stringify([])));

    const result = await runStatusCommand();

    expect(result.stdout).toContain('No services running');
  });

  it('shows "No services running" message for empty output string', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess(''));

    const result = await runStatusCommand();

    expect(result.stdout).toContain('No services running');
  });

  it('passes --path option as cwd to execa', async () => {
    mockExeca.mockReturnValue(makeExecaSuccess(JSON.stringify([])));

    await runStatusCommand(['--path', '/custom/path']);

    expect(mockExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['compose', 'ps']),
      expect.objectContaining({ cwd: '/custom/path' }),
    );
  });
});

// ---------------------------------------------------------------------------
// NDJSON format
// ---------------------------------------------------------------------------

describe('registerStatusCommand — NDJSON format', () => {
  beforeEach(() => {
    mockCheckDockerAvailability.mockReset().mockResolvedValue(undefined);
    mockExeca.mockReset();
  });

  it('parses NDJSON (one JSON object per line)', async () => {
    const ndjson = [
      JSON.stringify({
        Service: 'traefik',
        State: 'running',
        Status: 'Up 2h',
        Image: 'traefik:v2',
        Publishers: [],
        Created: 0,
      }),
      JSON.stringify({
        Service: 'postgres',
        State: 'running',
        Status: 'Up 1h',
        Image: 'postgres:16',
        Publishers: [],
        Created: 0,
      }),
    ].join('\n');
    mockExeca.mockReturnValue(makeExecaSuccess(ndjson));

    const result = await runStatusCommand(['--json']);
    const parsed: unknown[] = JSON.parse(result.stdout);

    expect(parsed).toHaveLength(2);
    expect((parsed[0] as Record<string, unknown>).name).toBe('traefik');
    expect((parsed[1] as Record<string, unknown>).name).toBe('postgres');
  });

  it('skips malformed NDJSON lines silently', async () => {
    const ndjson = [
      JSON.stringify({
        Service: 'traefik',
        State: 'running',
        Status: 'Up 2h',
        Image: 'traefik:v2',
        Publishers: [],
        Created: 0,
      }),
      'this is not json',
      '{also broken',
    ].join('\n');
    mockExeca.mockReturnValue(makeExecaSuccess(ndjson));

    const result = await runStatusCommand(['--json']);
    const parsed: unknown[] = JSON.parse(result.stdout);

    expect(parsed).toHaveLength(1);
    expect((parsed[0] as Record<string, unknown>).name).toBe('traefik');
  });
});

// ---------------------------------------------------------------------------
// parseDockerComposePsEntry — name, state, ports
// ---------------------------------------------------------------------------

describe('registerStatusCommand — parseDockerComposePsEntry', () => {
  beforeEach(() => {
    mockCheckDockerAvailability.mockReset().mockResolvedValue(undefined);
    mockExeca.mockReset();
  });

  it('uses Service field as name when available', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'my-service',
        Name: 'project-my-service-1',
        State: 'running',
        Status: 'Up',
        Image: 'img:latest',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand(['--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];

    expect(parsed[0].name).toBe('my-service');
  });

  it('strips project prefix and replica suffix from Name when Service absent', async () => {
    const psJson = JSON.stringify([
      {
        Name: 'myproject-traefik-1',
        State: 'running',
        Status: 'Up',
        Image: 'traefik:v2',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand(['--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];

    expect(parsed[0].name).toBe('traefik');
  });

  it('maps unrecognized state to "dead"', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'svc',
        State: 'weird-state',
        Status: 'Unknown',
        Image: 'img',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand(['--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];

    expect(parsed[0].state).toBe('dead');
  });

  it('formats publishers as PublishedPort→TargetPort/Protocol', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'traefik',
        State: 'running',
        Status: 'Up',
        Image: 'traefik:v2',
        Publishers: [
          { PublishedPort: 80, TargetPort: 80, Protocol: 'tcp' },
          { PublishedPort: 443, TargetPort: 443, Protocol: 'tcp' },
          { PublishedPort: 0, TargetPort: 8080, Protocol: 'tcp' }, // filtered: no published port
        ],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand(['--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, string[]>[];

    expect(parsed[0].ports).toContain('80→80/tcp');
    expect(parsed[0].ports).toContain('443→443/tcp');
    expect(parsed[0].ports.every((p) => !p.startsWith('0→'))).toBe(true);
  });

  it('handles missing Publishers field (defaults to no ports)', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'redis',
        State: 'running',
        Status: 'Up',
        Image: 'redis:7',
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand(['--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];

    expect((parsed[0].ports as string[]).length).toBe(0);
  });

  it('handles all recognized Docker states correctly', async () => {
    const states = ['running', 'exited', 'created', 'restarting', 'removing', 'paused', 'dead'];
    const containers = states.map((state) => ({
      Service: `svc-${state}`,
      State: state,
      Status: state,
      Image: 'img',
      Publishers: [],
      Created: 0,
    }));
    mockExeca.mockReturnValue(makeExecaSuccess(JSON.stringify(containers)));

    const result = await runStatusCommand(['--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];

    for (let i = 0; i < states.length; i++) {
      expect(parsed[i].state).toBe(states[i]);
    }
  });

  it('uses Status field as container status text and Created timestamp', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'web',
        State: 'running',
        Status: 'Up 3 days',
        Image: 'nginx:1',
        Publishers: [],
        Created: 1000,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand(['--json']);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];

    expect(parsed[0].status).toBe('Up 3 days');
    expect(parsed[0].created).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('registerStatusCommand — error handling', () => {
  beforeEach(() => {
    mockCheckDockerAvailability.mockReset().mockResolvedValue(undefined);
    mockExeca.mockReset();
  });

  it('shows friendly message when no configuration file found', async () => {
    mockExeca.mockRejectedValue(
      Object.assign(new Error('no configuration file provided: not found'), {
        exitCode: 1,
        stdout: '',
        stderr: 'no configuration file provided: not found',
      }),
    );

    const result = await runStatusCommand();

    expect(result.stdout).toContain('No brewnet project found');
    expect(result.stdout).toContain('brewnet init');
    expect(result.exitCode).toBeUndefined();
  });

  it('shows friendly message when docker-compose.yml does not exist', async () => {
    mockExeca.mockRejectedValue(
      Object.assign(new Error('No such file or directory'), {
        exitCode: 1,
        stdout: '',
        stderr: 'No such file or directory',
      }),
    );

    const result = await runStatusCommand();

    expect(result.stdout).toContain('No brewnet project found');
    expect(result.exitCode).toBeUndefined();
  });

  it('shows friendly message for "not found" error', async () => {
    mockExeca.mockRejectedValue(
      Object.assign(new Error('command not found'), {
        exitCode: 127,
        stdout: '',
        stderr: 'command not found',
      }),
    );

    const result = await runStatusCommand();

    expect(result.stdout).toContain('No brewnet project found');
  });

  it('shows generic error message and sets exitCode=1 for unknown errors', async () => {
    mockExeca.mockRejectedValue(
      Object.assign(new Error('unexpected network error'), {
        exitCode: 1,
        stdout: '',
        stderr: 'unexpected network error',
      }),
    );

    const result = await runStatusCommand();

    expect(result.stderr).toContain('unexpected network error');
    expect(result.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseUptime edge cases (via formatServiceStatus invoked through command)
// ---------------------------------------------------------------------------

describe('registerStatusCommand — parseUptime edge cases', () => {
  beforeEach(() => {
    mockCheckDockerAvailability.mockReset().mockResolvedValue(undefined);
    mockExeca.mockReset();
  });

  it('returns "1m" for "Up About a minute" status (line 105)', async () => {
    const psJson = JSON.stringify([
      {
        Service: 'web',
        State: 'running',
        Status: 'Up About a minute',
        Image: 'nginx:1',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand();

    // Table output should show 1m for uptime
    expect(result.stdout).toContain('1m');
  });

  it('returns "-" for unrecognized "Up ..." status (fallback, line 126)', async () => {
    // The raw JSON output preserves status, so we check the table output
    // for the uptime column showing "-" from the fallback
    const psJson = JSON.stringify([
      {
        Service: 'web',
        State: 'running',
        Status: 'Up some weird unrecognized string',
        Image: 'nginx:1',
        Publishers: [],
        Created: 0,
      },
    ]);
    mockExeca.mockReturnValue(makeExecaSuccess(psJson));

    const result = await runStatusCommand();

    // Table output exists (no empty services message)
    expect(result.stdout).toContain('web');
    // Uptime should fall back to '-'
    expect(result.stdout).toContain('-');
  });
});
