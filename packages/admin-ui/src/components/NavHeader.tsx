import { NavLink } from 'react-router-dom';

function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.931.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.562 21.8 24 17.303 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

export function NavHeader() {
  return (
    <div id="header">
      <NavLink to="/" className="logo">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="4 6 38 38" fill="none" stroke="#f5a623" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" strokeWidth="3.5" fill="none"/>
          <path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" strokeWidth="3.5" fill="none"/>
          <circle cx="20" cy="30" r="2.2" fill="#f5a623" stroke="none"/>
          <path d="M16.5 20a5 5 0 0 1 7 0" strokeWidth="3.5" fill="none"/>
          <path d="M13.5 15.5a10 10 0 0 1 13 0" strokeWidth="3.5" fill="none"/>
          <path d="M10.5 11a15 15 0 0 1 19 0" strokeWidth="3.5" fill="none"/>
        </svg>
        <span className="logo-text">
          <span className="logo-name">Brewnet</span>
          <span className="logo-tag">Home Server</span>
        </span>
      </NavLink>
      <div className="nav-links">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/apps"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          Apps
        </NavLink>
        <NavLink
          to="/catalog"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          Catalog
        </NavLink>
        <NavLink
          to="/debug/db"
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          style={{ fontSize: 12, opacity: 0.6 }}
        >
          DB
        </NavLink>
      </div>
      <a
        href="https://github.com/claude-code-expert/brewnet"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--txt2)', textDecoration: 'none', fontFamily: 'var(--mono)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
      >
        <GithubIcon size={14} />
        GitHub
      </a>
    </div>
  );
}
