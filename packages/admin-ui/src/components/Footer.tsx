function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.931.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.562 21.8 24 17.303 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

export function Footer() {
  return (
    <div style={{
      height: 50,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      position: 'relative',
      background: '#0c1525',
      borderTop: '1px solid var(--bdr)',
      fontSize: 12.5,
      color: 'var(--txt2)',
    }}>
      {/* Center group */}
      <div style={{ position: 'absolute', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none' }}>
        <span style={{ pointerEvents: 'auto' }}>&copy; {new Date().getFullYear()}</span>
      <a
        href="https://www.brewnet.dev"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--amber)', textDecoration: 'none', fontFamily: 'var(--mono)', fontWeight: 600, pointerEvents: 'auto' }}
      >
        brewnet.dev
      </a>
      <span>-</span>
      <span>Show your support with a Star.</span>
      <a
        href="https://github.com/claude-code-expert/brewnet"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--txt2)', textDecoration: 'none', fontFamily: 'var(--mono)', display: 'inline-flex', alignItems: 'center', gap: 4, pointerEvents: 'auto' }}
      >
        <GithubIcon size={14} />
        GitHub
      </a>
      </div>
      {/* Right-aligned Bug Report */}
      <a
        href="https://github.com/claude-code-expert/brewnet/issues"
        target="_blank"
        rel="noopener noreferrer"
        title="Bug Report"
        style={{ marginLeft: 'auto', marginRight: 20, color: 'var(--red)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}
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
