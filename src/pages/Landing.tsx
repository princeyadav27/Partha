import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import { useReveal } from '../hooks/useReveal';

const STEPS = [
  {
    n: '01',
    title: 'Bring your story',
    body: 'Upload a résumé once. Everything downstream is tuned to your experience — no forms, no templates, no re-typing your life.',
  },
  {
    n: '02',
    title: 'Search with intent',
    body: 'Pick your target regions and roles. Listings arrive clean, de-duplicated, and ranked by fit — not by ad spend.',
  },
  {
    n: '03',
    title: 'Track every move',
    body: 'One board for the whole campaign — saved roles, applications, follow-ups, and outcomes in plain sight.',
  },
];

const PRINCIPLES = [
  { k: 'Evidence, not vibes', v: 'Match reasons are spelled out — which line of your experience met which requirement.' },
  { k: 'Quiet by design', v: 'No badges, streaks, or confetti. Just work that moves forward.' },
  { k: 'Yours to keep', v: 'Your data stays in your workspace. Delete it and it is gone.' },
];

const SOURCES = ['himalayas', 'RemoteOK', 'ArbeitNow', 'adzuna'];

export default function Landing() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-inner">
          <Reveal>
            <Link className="hero-badge" to="/profile">
              <span className="badge-new">New</span>
              <span>Partha now reads your résumé for you</span>
              <span className="badge-arrow" aria-hidden="true">
                ›
              </span>
            </Link>
          </Reveal>

          <Reveal delay={110}>
            <h1 className="hero-title">
              Search less.
              <br />
              Match more. <span className="hero-mark">Aim true.</span>
            </h1>
          </Reveal>

          <Reveal delay={220}>
            <p className="hero-sub">
              One résumé in. Every board out. Only the roles worth your aim.
            </p>
          </Reveal>

          <Reveal delay={330}>
            <div className="hero-actions">
              <Link className="btn btn-hero" to="/profile">
                Start with your résumé
              </Link>
              <Link className="btn btn-hero-quiet" to="/jobs">
                Browse live jobs
              </Link>
            </div>
          </Reveal>

          <Reveal delay={460}>
            <div className="hero-proofs">
              <span className="proofs-label">Live roles pulled from</span>
              <ul className="proofs-row">
                {SOURCES.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="steps">
        <Reveal>
          <div className="section-head">
            <h2>How the hunt runs</h2>
            <p>Linear by design. Each step feeds the next.</p>
          </div>
        </Reveal>
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <StepCard key={s.n} step={s} index={i} />
          ))}
        </div>
      </section>

      <section className="principles">
        <div className="container">
          <Reveal>
            <div className="principles-card">
              <h2>Principles</h2>
              <ul>
                {PRINCIPLES.map((p, i) => (
                  <PrincipleRow key={p.k} p={p} index={i} />
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="closing">
        <Reveal>
          <span className="closing-mark">
            <Logo size={30} />
          </span>
          <h2>Begin the search.</h2>
          <p className="closing-sub">
            Upload once — Partha keeps every application on target from there.
          </p>
          <Link className="btn btn-hero" to="/profile">
            Upload your résumé
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useReveal<HTMLDivElement>(delay);
  return (
    <div className="reveal" ref={ref}>
      {children}
    </div>
  );
}

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const ref = useReveal<HTMLDivElement>(index * 110);
  return (
    <div className="step-card reveal" ref={ref}>
      <span className="step-n">{step.n}</span>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
    </div>
  );
}

function PrincipleRow({ p, index }: { p: (typeof PRINCIPLES)[number]; index: number }) {
  const ref = useReveal<HTMLLIElement>(index * 90);
  return (
    <li className="reveal" ref={ref}>
      <span className="p-k">{p.k}</span>
      <span className="p-v">{p.v}</span>
    </li>
  );
}
