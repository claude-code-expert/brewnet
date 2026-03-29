import { NavLink } from 'react-router-dom';
import { useI18n } from '../i18n/useI18n.js';

export function NavHeader() {
  const { locale, setLocale } = useI18n();
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
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: '1px solid var(--bdr2)', borderRadius: 14,
          overflow: 'hidden', position: 'relative',
        }}>
          <button
            onClick={() => setLocale('ko')}
            style={{
              background: locale === 'ko' ? 'var(--amber)' : 'transparent',
              border: 'none', cursor: 'pointer',
              padding: '3px 10px',
              color: locale === 'ko' ? '#0a1020' : 'var(--txt3)',
              fontWeight: 600,
              fontFamily: 'var(--mono)', fontSize: 11,
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            KO
          </button>
          <button
            onClick={() => setLocale('en')}
            style={{
              background: locale === 'en' ? 'var(--amber)' : 'transparent',
              border: 'none', cursor: 'pointer',
              padding: '3px 10px',
              color: locale === 'en' ? '#0a1020' : 'var(--txt3)',
              fontWeight: 600,
              fontFamily: 'var(--mono)', fontSize: 11,
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            EN
          </button>
        </div>
      </div>
    </div>
  );
}
