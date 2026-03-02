/**
 * T023 — Wizard Navigation State Machine
 *
 * Manages step progression, history stack, forward/backward navigation,
 * step skipping, and cancellation for the 9-step wizard flow.
 *
 * @module wizard/navigation
 */

// ---------------------------------------------------------------------------
// Step Enum
// ---------------------------------------------------------------------------

export enum WizardStep {
  AdminSetup = 0,
  SystemCheck = 1,
  ProjectSetup = 2,
  ServerComponents = 3,
  DevStack = 4,
  DomainNetwork = 5,
  Review = 6,
  Generate = 7,
  Complete = 8,
}

export const TOTAL_STEPS = 9;

export const STEP_NAMES: Record<WizardStep, string> = {
  [WizardStep.AdminSetup]: 'Admin Account',
  [WizardStep.SystemCheck]: 'System Check',
  [WizardStep.ProjectSetup]: 'Project Setup',
  [WizardStep.ServerComponents]: 'Server Components',
  [WizardStep.DevStack]: 'Dev Stack & Runtime',
  [WizardStep.DomainNetwork]: 'Domain & Network',
  [WizardStep.Review]: 'Review & Confirm',
  [WizardStep.Generate]: 'Generate & Start',
  [WizardStep.Complete]: 'Complete',
};

// ---------------------------------------------------------------------------
// Navigation State Machine
// ---------------------------------------------------------------------------

export class WizardNavigation {
  private _currentStep: WizardStep;
  private _history: WizardStep[];
  private _skippedSteps: Set<WizardStep>;
  private _cancelled: boolean;

  constructor(startStep: WizardStep = WizardStep.AdminSetup) {
    this._currentStep = startStep;
    this._history = [];
    this._skippedSteps = new Set();
    this._cancelled = false;
  }

  /** Current wizard step. */
  get currentStep(): WizardStep {
    return this._currentStep;
  }

  /** Whether the wizard has been cancelled. */
  get isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Move forward to the next step.
   * Automatically skips steps that are in the skipped set.
   * Returns the new current step.
   * No-op if already at the Complete step.
   */
  goForward(): WizardStep {
    if (this._currentStep >= WizardStep.Complete) {
      return this._currentStep;
    }

    this._history.push(this._currentStep);
    let next = this._currentStep + 1;

    // Skip over skipped steps
    while (
      next < WizardStep.Complete &&
      this._skippedSteps.has(next as WizardStep)
    ) {
      next++;
    }

    this._currentStep = next as WizardStep;
    return this._currentStep;
  }

  /**
   * Go back to the previous step from the history stack.
   * Returns the previous step, or null if at the start.
   */
  goBack(): WizardStep | null {
    if (this._history.length === 0) return null;

    this._currentStep = this._history.pop()!;
    return this._currentStep;
  }

  /** Whether there are previous steps in the history to go back to. */
  canGoBack(): boolean {
    return this._history.length > 0;
  }

  /**
   * Jump directly to a specific step (e.g., from Review "Modify" action).
   * Pushes the current step to history so the user can return.
   */
  goToStep(step: WizardStep): void {
    this._history.push(this._currentStep);
    this._currentStep = step;
  }

  /**
   * Mark a step as skipped. Skipped steps are bypassed during forward navigation.
   */
  skipStep(step: WizardStep): void {
    this._skippedSteps.add(step);
  }

  /**
   * Remove a step from the skipped set, making it visitable again.
   */
  unskipStep(step: WizardStep): void {
    this._skippedSteps.delete(step);
  }

  /** Whether a step is currently marked as skipped. */
  isStepSkipped(step: WizardStep): boolean {
    return this._skippedSteps.has(step);
  }

  /** Mark the wizard as cancelled. */
  cancel(): void {
    this._cancelled = true;
  }

  /**
   * Get progress information for display (e.g., "Step 3/7").
   */
  getProgress(): { current: number; total: number; percentage: number } {
    const total = TOTAL_STEPS - this._skippedSteps.size;
    const completedSteps = this._history.filter(
      (s) => !this._skippedSteps.has(s),
    ).length;
    return {
      current: completedSteps + 1,
      total,
      percentage: Math.round(((completedSteps + 1) / total) * 100),
    };
  }

  /** Get the human-readable name of the current or specified step. */
  getStepName(step?: WizardStep): string {
    return STEP_NAMES[step ?? this._currentStep] ?? 'Unknown';
  }

  /** Reset navigation to the initial state. */
  reset(): void {
    this._currentStep = WizardStep.AdminSetup;
    this._history = [];
    this._skippedSteps.clear();
    this._cancelled = false;
  }
}

// ---------------------------------------------------------------------------
// Ctrl+C Handler
// ---------------------------------------------------------------------------

/**
 * Set up a Ctrl+C (SIGINT) handler for the wizard.
 *
 * When the user presses Ctrl+C, the provided `onCancel` callback is invoked.
 * The callback should handle confirmation prompting and state saving.
 *
 * If Ctrl+C is pressed a second time while the first handler is running,
 * the process exits immediately (force quit).
 *
 * Returns a cleanup function to remove the handler.
 *
 * NOTE: When using @inquirer/prompts, Ctrl+C during a prompt throws
 * ExitPromptError. The wizard step runner should catch this and call
 * the cancel flow directly rather than relying solely on SIGINT.
 */
export function setupCancelHandler(
  onCancel: () => void | Promise<void>,
): () => void {
  let handling = false;

  const handler = () => {
    if (handling) {
      // Second Ctrl+C — force quit
      process.exit(1);
    }
    handling = true;

    const result = onCancel();
    if (result instanceof Promise) {
      result
        .catch(() => process.exit(1))
        .finally(() => {
          handling = false;
        });
    } else {
      handling = false;
    }
  };

  process.on('SIGINT', handler);

  return () => {
    process.removeListener('SIGINT', handler);
  };
}
