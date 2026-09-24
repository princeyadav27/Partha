import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from './Logo';

export default function Layout() {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';

  return (
    <div className="frame">
      <div className="panel">
        <header className="site-header">
          <div className="container site-header-inner">
            <NavLink to="/" className="wordmark" aria-label="Partha — home">
              <Logo />
              <span>Partha</span>
            </NavLink>
            <nav className="site-nav" aria-label="Primary">
              <NavLink to="/jobs">Find Jobs</NavLink>
              <NavLink to="/saved">Saved</NavLink>
              <NavLink to="/applications">Applications</NavLink>
              <NavLink to="/profile">Profile</NavLink>
            </nav>
            <NavLink to="/profile" className="btn btn-primary btn-pill header-cta">
              Start your hunt
            </NavLink>
          </div>
        </header>

        <main className="page">
          {isLanding ? (
            <Outlet />
          ) : (
            <div className="container">
              <Outlet />
            </div>
          )}
        </main>

        <footer className="site-footer">
          <div className="container site-footer-inner">
            <span>Partha — find work that fits, and act on it.</span>
            <span className="footer-tag">many boards · one true aim</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
