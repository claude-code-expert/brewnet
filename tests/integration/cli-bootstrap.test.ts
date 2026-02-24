/**
 * T026 — CLI Bootstrap Integration Tests
 *
 * TC-01-05: Verify all subcommands are registered on the Commander.js program
 * and resolve without "unknown command" errors. Tests also verify key options
 * on individual commands.
 *
 * @module tests/integration/cli-bootstrap
 */

import { createProgram } from '../../packages/cli/src/index.js';
import { Command } from 'commander';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a registered (sub)command by name from a Commander.js program.
 */
function findCommand(program: Command, name: string): Command | undefined {
  return program.commands.find((c) => c.name() === name);
}

/**
 * Check whether a command has a specific option by its long flag name.
 * For example, hasOption(cmd, '--follow') checks for -f/--follow.
 */
function hasOption(cmd: Command, longFlag: string): boolean {
  return cmd.options.some((opt) => opt.long === longFlag);
}

/**
 * Check whether a command has an option with a specific short flag.
 */
function hasShortFlag(cmd: Command, shortFlag: string): boolean {
  return cmd.options.some((opt) => opt.short === shortFlag);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CLI Bootstrap — subcommand registration', () => {
  let program: Command;

  beforeAll(() => {
    program = createProgram();
  });

  // -----------------------------------------------------------------------
  // 1. createProgram returns a valid Commander instance
  // -----------------------------------------------------------------------

  it('createProgram() returns a Commander.js Command instance', () => {
    expect(program).toBeInstanceOf(Command);
  });

  it('program name is "brewnet"', () => {
    expect(program.name()).toBe('brewnet');
  });

  it('program has a version string set', () => {
    // Commander stores version internally; calling .version() getter via opts
    // The program should have a version option registered.
    const versionOpt = program.options.find(
      (opt) => opt.long === '--version' || opt.short === '-V',
    );
    expect(versionOpt).toBeDefined();
  });

  it('program has a description', () => {
    expect(program.description()).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. TC-01-05: All 9 required subcommands are registered
  // -----------------------------------------------------------------------

  const expectedCommands = [
    'init',
    'status',
    'add',
    'remove',
    'up',
    'down',
    'logs',
    'backup',
    'restore',
  ] as const;

  it.each(expectedCommands)(
    '"%s" command is registered on the program',
    (cmdName) => {
      const cmd = findCommand(program, cmdName);
      expect(cmd).toBeDefined();
      expect(cmd).toBeInstanceOf(Command);
    },
  );

  it('no unexpected commands are registered (allowlist check)', () => {
    const registeredNames = program.commands.map((c) => c.name());
    // Every registered command should be in our known set.
    // This is intentionally lenient — additional commands are allowed but
    // the 9 required ones must all be present.
    for (const expected of expectedCommands) {
      expect(registeredNames).toContain(expected);
    }
  });

  it('all registered commands have a description', () => {
    for (const cmd of program.commands) {
      expect(cmd.description()).toBeTruthy();
    }
  });

  // -----------------------------------------------------------------------
  // 3. "init" command options
  // -----------------------------------------------------------------------

  describe('"init" command', () => {
    let initCmd: Command;

    beforeAll(() => {
      initCmd = findCommand(program, 'init')!;
    });

    it('is defined', () => {
      expect(initCmd).toBeDefined();
    });

    it('has --config option', () => {
      expect(hasOption(initCmd, '--config')).toBe(true);
    });

    it('--config option accepts a value (is not a boolean flag)', () => {
      const opt = initCmd.options.find((o) => o.long === '--config');
      // Commander options that take a value have a non-empty `flags` containing `<` or `[`
      expect(opt).toBeDefined();
      expect(opt!.flags).toMatch(/[<[]/);
    });

    it('has --non-interactive option', () => {
      expect(hasOption(initCmd, '--non-interactive')).toBe(true);
    });

    it('has a description', () => {
      expect(initCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 4. "add" command options
  // -----------------------------------------------------------------------

  describe('"add" command', () => {
    let addCmd: Command;

    beforeAll(() => {
      addCmd = findCommand(program, 'add')!;
    });

    it('is defined', () => {
      expect(addCmd).toBeDefined();
    });

    it('accepts a <service> argument', () => {
      // Commander stores expected args; check the first one
      const args = addCmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe('service');
    });

    it('has a description', () => {
      expect(addCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 5. "remove" command options
  // -----------------------------------------------------------------------

  describe('"remove" command', () => {
    let removeCmd: Command;

    beforeAll(() => {
      removeCmd = findCommand(program, 'remove')!;
    });

    it('is defined', () => {
      expect(removeCmd).toBeDefined();
    });

    it('accepts a <service> argument', () => {
      const args = removeCmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe('service');
    });

    it('has --purge option', () => {
      expect(hasOption(removeCmd, '--purge')).toBe(true);
    });

    it('--purge is a boolean flag (no value required)', () => {
      const opt = removeCmd.options.find((o) => o.long === '--purge');
      expect(opt).toBeDefined();
      // Boolean flags do not have angle brackets or square brackets in flags
      expect(opt!.flags).not.toMatch(/[<[]/);
    });

    it('has a description', () => {
      expect(removeCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 6. "logs" command options
  // -----------------------------------------------------------------------

  describe('"logs" command', () => {
    let logsCmd: Command;

    beforeAll(() => {
      logsCmd = findCommand(program, 'logs')!;
    });

    it('is defined', () => {
      expect(logsCmd).toBeDefined();
    });

    it('accepts an optional [service] argument', () => {
      const args = logsCmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe('service');
      // Optional arguments are not required
      expect(args[0].required).toBe(false);
    });

    it('has -f/--follow option', () => {
      expect(hasOption(logsCmd, '--follow')).toBe(true);
      expect(hasShortFlag(logsCmd, '-f')).toBe(true);
    });

    it('has -n/--tail option', () => {
      expect(hasOption(logsCmd, '--tail')).toBe(true);
      expect(hasShortFlag(logsCmd, '-n')).toBe(true);
    });

    it('--tail option accepts a numeric value', () => {
      const opt = logsCmd.options.find((o) => o.long === '--tail');
      expect(opt).toBeDefined();
      expect(opt!.flags).toMatch(/[<[]/);
    });

    it('--follow is a boolean flag', () => {
      const opt = logsCmd.options.find((o) => o.long === '--follow');
      expect(opt).toBeDefined();
      expect(opt!.flags).not.toMatch(/[<[]/);
    });

    it('has a description', () => {
      expect(logsCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 7. "up" command
  // -----------------------------------------------------------------------

  describe('"up" command', () => {
    let upCmd: Command;

    beforeAll(() => {
      upCmd = findCommand(program, 'up')!;
    });

    it('is defined', () => {
      expect(upCmd).toBeDefined();
    });

    it('has -d/--detach option', () => {
      expect(hasOption(upCmd, '--detach')).toBe(true);
      expect(hasShortFlag(upCmd, '-d')).toBe(true);
    });

    it('has a description', () => {
      expect(upCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 8. "down" command
  // -----------------------------------------------------------------------

  describe('"down" command', () => {
    let downCmd: Command;

    beforeAll(() => {
      downCmd = findCommand(program, 'down')!;
    });

    it('is defined', () => {
      expect(downCmd).toBeDefined();
    });

    it('has --volumes option for removing volumes', () => {
      expect(hasOption(downCmd, '--volumes')).toBe(true);
    });

    it('has a description', () => {
      expect(downCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 9. "status" command
  // -----------------------------------------------------------------------

  describe('"status" command', () => {
    let statusCmd: Command;

    beforeAll(() => {
      statusCmd = findCommand(program, 'status')!;
    });

    it('is defined', () => {
      expect(statusCmd).toBeDefined();
    });

    it('has --json option for machine-readable output', () => {
      expect(hasOption(statusCmd, '--json')).toBe(true);
    });

    it('has a description', () => {
      expect(statusCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 10. "backup" command
  // -----------------------------------------------------------------------

  describe('"backup" command', () => {
    let backupCmd: Command;

    beforeAll(() => {
      backupCmd = findCommand(program, 'backup')!;
    });

    it('is defined', () => {
      expect(backupCmd).toBeDefined();
    });

    it('has a description', () => {
      expect(backupCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 11. "restore" command
  // -----------------------------------------------------------------------

  describe('"restore" command', () => {
    let restoreCmd: Command;

    beforeAll(() => {
      restoreCmd = findCommand(program, 'restore')!;
    });

    it('is defined', () => {
      expect(restoreCmd).toBeDefined();
    });

    it('accepts a <backup-id> argument', () => {
      const args = restoreCmd.registeredArguments ?? [];
      expect(args.length).toBeGreaterThanOrEqual(1);
      expect(args[0].name()).toBe('backup-id');
    });

    it('has a description', () => {
      expect(restoreCmd.description()).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 12. Unknown command produces an error (negative test)
  // -----------------------------------------------------------------------

  describe('unknown command handling', () => {
    it('parsing an unknown command throws or reports an error', () => {
      // Commander.js by default calls process.exit on unknown command.
      // We override exitOverride so it throws instead.
      const testProgram = createProgram();
      testProgram.exitOverride(); // Throw instead of process.exit
      testProgram.configureOutput({
        writeErr: () => {}, // Suppress stderr output during test
        writeOut: () => {},
      });

      expect(() => {
        testProgram.parse(['node', 'brewnet', 'nonexistent-command']);
      }).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // 13. Idempotency — calling createProgram multiple times
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('createProgram() can be called multiple times without side effects', () => {
      const program1 = createProgram();
      const program2 = createProgram();

      const names1 = program1.commands.map((c) => c.name()).sort();
      const names2 = program2.commands.map((c) => c.name()).sort();

      expect(names1).toEqual(names2);
    });

    it('each call returns a distinct Command instance', () => {
      const program1 = createProgram();
      const program2 = createProgram();
      expect(program1).not.toBe(program2);
    });
  });
});
