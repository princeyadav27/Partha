import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Bookmark, Briefcase, ClipboardList, GitBranch, Mail, User } from 'lucide-react';
import { api } from '../api';
import GooglyEyesButton from './GooglyEyesButton';
import Logo from './Logo';

type Health = { ok: boolean; db: boolean; ai: boolean };

const PRODUCT_LINKS = [
  { to: '/jobs', label: 'Find Jobs', Icon: Briefcase },
  { to: '/saved', label: 'Saved', Icon: Bookmark },
  { to: '/applications', label: 'Applications', Icon: ClipboardList },
  { to: '/profile', label: 'Profile', Icon: User },
] as const;

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
});

export default function Footer() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<Health>('/api/health')
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth(null));
    return () => {
      alive = false;
    };
  }, []);

  const live = Boolean(health?.db);

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <motion.div className="footer-col footer-brand" {...rise(0)}>
          <span className="footer-wordmark">
            <Logo size={24} />
            Partha
          </span>
          <p className="footer-mission">
            Find work that fits — and act on it. Every board worth watching, one quiet board of
            record.
          </p>
          <span className={`status-chip ${health === null ? '' : live ? 'status-live' : 'status-demo'}`}>
            <Activity size={13} aria-hidden="true" />
            {health === null ? 'checking…' : live ? 'connected' : 'demo mode'}
          </span>
        </motion.div>

        <motion.nav className="footer-col footer-links" aria-label="Product" {...rise(0.06)}>
          <h3>Product</h3>
          {PRODUCT_LINKS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={15} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </motion.nav>

        <motion.div className="footer-col footer-contact" {...rise(0.12)}>
          <h3>Get in touch</h3>
          <GooglyEyesButton />
          <a
            className="footer-minor"
            href="https://github.com/princeyadav27/Partha"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={14} aria-hidden="true" />
            source
          </a>
          <a className="footer-minor" href="mailto:hello@partha.app">
            <Mail size={14} aria-hidden="true" />
            hello@partha.app
          </a>
        </motion.div>
      </div>

      <div className="container footer-bottom">
        <span>© 2026 Partha — find work that fits, and act on it.</span>
        <span className="footer-tag">many boards · one true aim</span>
      </div>
    </footer>
  );
}
