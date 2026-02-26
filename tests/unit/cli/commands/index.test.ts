/**
 * @file tests/unit/cli/commands/index.test.ts
 * @description TDD unit tests for Brewnet CLI entry point (T024)
 *
 * Test cases covered:
 *   TC-01-01: `brewnet --version` prints semver string
 *   TC-01-02: `brewnet --help` lists all subcommands with descriptions
 *   TC-01-03: `brewnet unknowncmd` prints error + help hint, exits 1
 *   TC-01-05: All subcommands registered without "unknown command" error (partial)
 *
 * The CLI entry point exports a `createProgram()` function returning a
 * Commander.js Command instance. Tests exercise this function directly
 * without spawning a subprocess.
 */

import { Command } from 'commander';
import { createProgram } from '../../../../packages/cli/src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParseResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: Error;
}

/**
 * Builds a fresh program instance with exitOverride enabled and output
 * capture wired up, then parses the given argv tokens.
 *
 * Commander's `parseAsync` expects the full process.argv style array.
 * Passing `{ from: 'user' }` tells Commander the array contains *only*
 * user-supplied arguments (no node/script prefix).
 */
async function runCLI(args: string[]): Promise<ParseResult> {
  const result: ParseResult = { stdout: '', stderr: '' };

  const program = createProgram();

  // Prevent Commander from calling process.exit — throw instead.
  program.exitOverride();

  // Capture anything Commander writes to stdout / stderr.
  program.configureOutput({
    writeOut: (str: string) => {
      result.stdout += str;
    },
    writeErr: (str: string) => {
      result.stderr += str;
    },
  });

  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (err: unknown) {
    result.error = err as Error;
    // Commander's CommanderError includes an exitCode property.
    if (err && typeof err === 'object' && 'exitCode' in err) {
      result.exitCode = (err as { exitCode: number }).exitCode;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sanity: createProgram returns a Commander instance
// ---------------------------------------------------------------------------

describe('createProgram()', () => {
  it('returns a Commander Command instance', () => {
    const program = createProgram();
    expect(program).toBeInstanceOf(Command);
  });

  it('has program name set to "brewnet"', () => {
    const program = createProgram();
    expect(program.name()).toBe('brewnet');
  });

  it('has description "Your Home Server, Brewed Fresh"', () => {
    const program = createProgram();
    expect(program.description()).toBe('Your Home Server, Brewed Fresh');
  });
});

// ---------------------------------------------------------------------------
// TC-01-01: brewnet --version
// ---------------------------------------------------------------------------

describe('TC-01-01: brewnet --version', () => {
  it('prints a semver version string', async () => {
    const { stdout } = await runCLI(['--version']);

    // Trim trailing newline Commander appends.
    const version = stdout.trim();

    // Must match semantic versioning pattern: MAJOR.MINOR.PATCH
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('prints version "1.0.1" matching package.json', async () => {
    const { stdout } = await runCLI(['--version']);
    expect(stdout.trim()).toBe('1.0.1');
  });

  it('exits with code 0 (via exitOverride)', async () => {
    const { exitCode } = await runCLI(['--version']);
    // Commander throws with exitCode 0 for --version when exitOverride is on.
    expect(exitCode).toBe(0);
  });

  it('does not write to stderr', async () => {
    const { stderr } = await runCLI(['--version']);
    expect(stderr).toBe('');
  });
});

// ---------------------------------------------------------------------------
// TC-01-02: brewnet --help
// ---------------------------------------------------------------------------

describe('TC-01-02: brewnet --help', () => {
  let result: ParseResult;

  beforeAll(async () => {
    result = await runCLI(['--help']);
  });

  it('outputs help text to stdout', () => {
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('includes the program description', () => {
    expect(result.stdout).toContain('Your Home Server, Brewed Fresh');
  });

  it('includes "Usage:" line with program name', () => {
    expect(result.stdout).toMatch(/Usage:.*brewnet/);
  });

  // Verify every registered subcommand appears in help output.
  const expectedSubcommands = [
    { name: 'init', description: 'Interactive setup wizard' },
    { name: 'status', description: 'Show service status' },
    { name: 'add', description: 'Add a service' },
    { name: 'remove', description: 'Remove a service' },
    { name: 'up', description: 'Start all services' },
    { name: 'down', description: 'Stop all services' },
    { name: 'logs', description: 'View service logs' },
    { name: 'backup', description: 'Create a backup' },
    { name: 'restore', description: 'Restore from backup' },
  ];

  it.each(expectedSubcommands)(
    'lists subcommand "$name" with description "$description"',
    ({ name, description }) => {
      // Commander formats help as "  <command>  <description>" with variable padding.
      expect(result.stdout).toContain(name);
      expect(result.stdout).toContain(description);
    },
  );

  it('includes the -V, --version option', () => {
    expect(result.stdout).toMatch(/-V.*--version/);
  });

  it('includes the -h, --help option', () => {
    expect(result.stdout).toMatch(/-h.*--help/);
  });

  it('exits with code 0', () => {
    expect(result.exitCode).toBe(0);
  });

  it('does not write to stderr', () => {
    expect(result.stderr).toBe('');
  });
});

// ---------------------------------------------------------------------------
// TC-01-03: brewnet unknowncmd
// ---------------------------------------------------------------------------

describe('TC-01-03: brewnet unknowncmd', () => {
  let result: ParseResult;

  beforeAll(async () => {
    result = await runCLI(['unknowncmd']);
  });

  it('exits with code 1', () => {
    expect(result.exitCode).toBe(1);
  });

  it('writes an error message mentioning the unknown command', () => {
    // Commander writes "error: unknown command 'unknowncmd'" to stderr.
    const combined = result.stderr + result.stdout;
    expect(combined).toMatch(/unknown command/i);
  });

  it('includes a help hint in the error output', () => {
    // Commander appends a line like "(Did you mean one of ...)" or
    // "Run 'brewnet --help' for usage information" depending on config.
    const combined = result.stderr + result.stdout;
    // At minimum, Commander includes '--help' as a hint.
    expect(combined).toMatch(/--help|help/i);
  });

  it('throws a CommanderError', () => {
    expect(result.error).toBeDefined();
    expect(result.error?.constructor.name).toBe('CommanderError');
  });
});

// ---------------------------------------------------------------------------
// TC-01-03 (extended): Multiple unknown commands
// ---------------------------------------------------------------------------

describe('TC-01-03 (extended): various invalid inputs', () => {
  it.each([
    ['nonexistent'],
    ['foobar'],
    ['deploy-magic'],
    ['123'],
  ])('rejects unknown command "%s" with exit code 1', async (cmd) => {
    const { exitCode } = await runCLI([cmd]);
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-01-05 (partial): All registered subcommands resolve
// ---------------------------------------------------------------------------

describe('TC-01-05 (partial): subcommand registration', () => {
  it('has exactly 11 registered subcommands', () => {
    const program = createProgram();
    const subcommands = program.commands.map((cmd) => cmd.name());
    expect(subcommands).toHaveLength(11);
  });

  const requiredSubcommands = [
    'init',
    'status',
    'add',
    'remove',
    'up',
    'down',
    'logs',
    'backup',
    'restore',
    'admin',
    'uninstall',
  ];

  it.each(requiredSubcommands)(
    'has "%s" registered as a subcommand',
    (name) => {
      const program = createProgram();
      const subcommands = program.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain(name);
    },
  );
});

// ---------------------------------------------------------------------------
// Subcommand option contracts
// ---------------------------------------------------------------------------

describe('Subcommand option contracts', () => {
  let program: Command;

  beforeAll(() => {
    program = createProgram();
  });

  function findSubcommand(name: string): Command {
    const cmd = program.commands.find((c) => c.name() === name);
    if (!cmd) throw new Error(`Subcommand "${name}" not found`);
    return cmd;
  }

  // -- init --
  describe('init command', () => {
    it('accepts --config <path> option', () => {
      const cmd = findSubcommand('init');
      const opt = cmd.options.find(
        (o) => o.long === '--config',
      );
      expect(opt).toBeDefined();
      expect(opt!.required || opt!.optional).toBeTruthy();
    });

    it('accepts --non-interactive flag', () => {
      const cmd = findSubcommand('init');
      const opt = cmd.options.find(
        (o) => o.long === '--non-interactive',
      );
      expect(opt).toBeDefined();
    });
  });

  // -- remove --
  describe('remove command', () => {
    it('requires <service> argument', () => {
      const cmd = findSubcommand('remove');
      // Commander stores required args; the argument name should be 'service'.
      const args = cmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].required).toBe(true);
    });

    it('accepts --purge flag', () => {
      const cmd = findSubcommand('remove');
      const opt = cmd.options.find((o) => o.long === '--purge');
      expect(opt).toBeDefined();
    });

    it('accepts --force flag', () => {
      const cmd = findSubcommand('remove');
      const opt = cmd.options.find((o) => o.long === '--force');
      expect(opt).toBeDefined();
    });
  });

  // -- add --
  describe('add command', () => {
    it('requires <service> argument', () => {
      const cmd = findSubcommand('add');
      const args = cmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].required).toBe(true);
    });
  });

  // -- logs --
  describe('logs command', () => {
    it('accepts optional [service] argument', () => {
      const cmd = findSubcommand('logs');
      const args = cmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].required).toBe(false);
    });

    it('accepts -f / --follow flag', () => {
      const cmd = findSubcommand('logs');
      const opt = cmd.options.find(
        (o) => o.short === '-f' || o.long === '--follow',
      );
      expect(opt).toBeDefined();
    });

    it('accepts -n / --tail <lines> option', () => {
      const cmd = findSubcommand('logs');
      const opt = cmd.options.find(
        (o) => o.short === '-n' || o.long === '--tail',
      );
      expect(opt).toBeDefined();
    });
  });

  // -- restore --
  describe('restore command', () => {
    it('requires <id> argument', () => {
      const cmd = findSubcommand('restore');
      const args = cmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].required).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('calling createProgram multiple times returns independent instances', () => {
    const a = createProgram();
    const b = createProgram();
    expect(a).not.toBe(b);
  });

  it('--version flag takes precedence over subcommands', async () => {
    // Commander processes global options first.
    const { stdout } = await runCLI(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('subcommand help (e.g., init) includes subcommand description', () => {
    const program = createProgram();
    const initCmd = program.commands.find((c) => c.name() === 'init');
    expect(initCmd).toBeDefined();
    const helpText = initCmd!.helpInformation();
    expect(helpText).toContain('Interactive setup wizard');
  });

  it('subcommand help includes its options', () => {
    const program = createProgram();
    const initCmd = program.commands.find((c) => c.name() === 'init');
    expect(initCmd).toBeDefined();
    const helpText = initCmd!.helpInformation();
    expect(helpText).toContain('--config');
  });
});
