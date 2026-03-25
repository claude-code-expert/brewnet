/**
 * Unit tests for wizard/navigation — WizardNavigation and setupCancelHandler
 *
 * Covers:
 *   - unskipStep(): removes a step from skipped set (L129)
 *   - isStepSkipped(): returns true/false for skipped steps (L134)
 *   - setupCancelHandler(): second SIGINT force-quits (L198)
 *   - setupCancelHandler(): async onCancel that rejects triggers process.exit (L205)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Import SUT (no mocks needed — pure logic + process.exit spy)
// ---------------------------------------------------------------------------

const { WizardNavigation, WizardStep, setupCancelHandler } = await import(
  '../../../../packages/cli/src/wizard/navigation.js'
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WizardNavigation.unskipStep and isStepSkipped', () => {
  it('isStepSkipped returns false for non-skipped step', () => {
    const nav = new WizardNavigation();
    expect(nav.isStepSkipped(WizardStep.DevStack)).toBe(false);
  });

  it('isStepSkipped returns true after skipStep', () => {
    const nav = new WizardNavigation();
    nav.skipStep(WizardStep.DevStack);
    expect(nav.isStepSkipped(WizardStep.DevStack)).toBe(true);
  });

  it('unskipStep makes step visitable again', () => {
    const nav = new WizardNavigation();
    nav.skipStep(WizardStep.DevStack);
    nav.unskipStep(WizardStep.DevStack);
    expect(nav.isStepSkipped(WizardStep.DevStack)).toBe(false);
  });

  it('unskipStep is a no-op when step is not skipped', () => {
    const nav = new WizardNavigation();
    // Should not throw
    nav.unskipStep(WizardStep.Review);
    expect(nav.isStepSkipped(WizardStep.Review)).toBe(false);
  });
});

describe('setupCancelHandler', () => {
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  // ── Second SIGINT force-quits ────────────────────────────────────────────

  it('calls process.exit(1) when SIGINT is emitted while handler is already running', async () => {
    // onCancel starts an async operation that never resolves — keeps `handling = true`
    let resolvePending!: () => void;
    const onCancel = () => new Promise<void>((r) => { resolvePending = r; });

    const cleanup = setupCancelHandler(onCancel);

    // First SIGINT: enters handler, sets handling = true, starts pending Promise
    process.emit('SIGINT');

    // Second SIGINT while handling = true → force process.exit(1)
    process.emit('SIGINT');

    expect(exitSpy).toHaveBeenCalledWith(1);

    // Cleanup: resolve pending Promise and remove handler
    resolvePending();
    cleanup();
  });

  // ── Async onCancel that rejects → process.exit(1) ────────────────────────

  it('calls process.exit(1) when async onCancel rejects', async () => {
    const onCancel = () => Promise.reject(new Error('cancel failed'));

    const cleanup = setupCancelHandler(onCancel);

    // Emit SIGINT to trigger the handler
    process.emit('SIGINT');

    // Allow the rejected Promise's .catch to fire
    await Promise.resolve();
    await Promise.resolve();

    expect(exitSpy).toHaveBeenCalledWith(1);

    cleanup();
  });

  // ── Cleanup removes SIGINT listener ──────────────────────────────────────

  it('cleanup function removes the SIGINT handler', () => {
    const onCancel = jest.fn<() => void>();
    const cleanup = setupCancelHandler(onCancel);

    cleanup();

    // After cleanup, SIGINT should not call onCancel
    process.emit('SIGINT');
    expect(onCancel).not.toHaveBeenCalled();
  });

  // ── Sync onCancel — resets handling flag ────────────────────────────────

  it('resets handling flag when onCancel is synchronous', () => {
    let callCount = 0;
    const onCancel = () => { callCount++; };

    const cleanup = setupCancelHandler(onCancel);

    // First SIGINT: sync handler runs and resets handling
    process.emit('SIGINT');
    // Second SIGINT: since handling was reset, onCancel runs again (not force-exit)
    process.emit('SIGINT');

    expect(callCount).toBe(2);
    expect(exitSpy).not.toHaveBeenCalled();

    cleanup();
  });
});
