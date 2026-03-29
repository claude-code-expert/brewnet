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
      color: 'var(--txt2)',
    }}>
      <span>&copy; {new Date().getFullYear()}</span>
      <a
        href="https://www.brewnet.dev"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--amber)', textDecoration: 'none', fontFamily: 'var(--mono)', fontWeight: 600 }}
      >
        brewnet.dev
      </a>
      <span>—</span>
      <span>Show your support with a Star.</span>
      <span>—</span>
      <a
        href="https://github.com/claude-code-expert/brewnet/issues"
        target="_blank"
        rel="noopener noreferrer"
        title="Bug Report"
        style={{ color: 'var(--red)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v1h-2v-1a1 1 0 0 0-1-1h-1v1a4 4 0 0 1-8 0v-1H7a1 1 0 0 0-1 1v1H4v-1a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/>
          <path d="M9 18v1a3 3 0 0 0 6 0v-1"/>
          <line x1="4" y1="14" x2="8" y2="14"/>
          <line x1="16" y1="14" x2="20" y2="14"/>
        </svg>
        Bug Report
      </a>
    </div>
  );
}
