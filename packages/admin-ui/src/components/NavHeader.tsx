import { NavLink } from 'react-router-dom';

export function NavHeader() {
  return (
    <div id="header">
      <NavLink to="/" className="logo">
        <span style={{ fontSize: 24 }}>☕</span>
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
      </div>
    </div>
  );
}
