export function Footer() {
  return (
    <div style={{
      height: 50,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      background: '#0c1525',
      borderTop: '1px solid var(--bdr)',
      fontSize: 12.5,
      color: 'var(--txt3)',
    }}>
      <a
        href="https://github.com/claude-code-expert/brewnet"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--txt2)', textDecoration: 'none', fontFamily: 'var(--mono)', fontWeight: 600 }}
      >
        https://github.com/claude-code-expert/brewnet
      </a>
      <span>—</span>
      <span>Clicking the star helps the developer.</span>
    </div>
  );
}
