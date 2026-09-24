import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app">
      <header className="site-header">
        <div className="container site-header-inner">
          <NavLink to="/jobs" className="wordmark">
            Gorkha
          </NavLink>
          <nav className="site-nav">
            <NavLink to="/jobs">Find Jobs</NavLink>
            <NavLink to="/saved">Saved</NavLink>
            <NavLink to="/applications">Applications</NavLink>
            <NavLink to="/profile">Profile</NavLink>
          </nav>
        </div>
      </header>
      <main className="container page">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">Gorkha — find work that fits, and act on it.</div>
      </footer>
    </div>
  );
}
