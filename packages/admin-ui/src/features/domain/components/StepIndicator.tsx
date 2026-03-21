// features/domain/components/StepIndicator.tsx — Horizontal 1-2-3 step progress indicator


interface StepIndicatorProps {
  steps: Array<{ id: string; label: string }>;
  currentStep: string;
  completedSteps: string[];
}

export function StepIndicator({ steps, currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {steps.map((step, idx) => {
        const isCompleted = completedSteps.includes(step.id);
        const isActive = step.id === currentStep;
        const _isPending = !isCompleted && !isActive; void _isPending;

        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? '1' : 'none' }}>
            {/* Step circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: `2px solid ${isCompleted || isActive ? 'var(--teal)' : 'var(--bdr)'}`,
                  background: isCompleted ? 'var(--teal)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isCompleted ? (
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>
                ) : (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isActive ? 'var(--teal)' : 'var(--txt3)',
                    }}
                  >
                    {idx + 1}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  color: isCompleted || isActive ? 'var(--teal)' : 'var(--txt3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (between steps) */}
            {idx < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: isCompleted ? 'var(--teal)' : 'var(--bdr)',
                  margin: '0 4px',
                  marginBottom: 18, // align with circle center
                  alignSelf: 'flex-start',
                  marginTop: 14,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
