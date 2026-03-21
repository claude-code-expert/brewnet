// features/domain/components/HelpTooltip.tsx — Clickable help button (opens HelpDrawer)

interface HelpTooltipProps {
  helpKey: string;
  onHelp: (key: string) => void;
}

export function HelpTooltip({ helpKey, onHelp }: HelpTooltipProps) {
  return (
    <button
      type="button"
      onClick={() => onHelp(helpKey)}
      title="Show help"
      style={{
        cursor: 'pointer',
        verticalAlign: 'middle',
        fontSize: 11,
        color: 'var(--txt3)',
        fontWeight: 700,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 15,
        height: 15,
        border: '1.5px solid currentColor',
        borderRadius: '50%',
        background: 'none',
        padding: 0,
        transition: 'color 0.14s, border-color 0.14s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--teal)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt3)';
      }}
    >
      ?
    </button>
  );
}
