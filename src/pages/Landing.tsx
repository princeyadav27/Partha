import { Link } from 'react-router-dom';
import { useReveal } from '../hooks/useReveal';

const STEPS = [
  {
    n: '01',
    title: 'Bring your story',
    body: 'Upload a résumé once. Everything downstream is tuned to your experience — no forms, no templates.',
  },
  {
    n: '02',
    title: 'Search with intent',
    body: 'Pick your target regions and roles. Listings arrive clean, de-duplicated, and ranked by fit, not ad spend.',
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

export default function Landing() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-inner">
          <Reveal>
            <p className="hero-eyebrow">Gorkha · the job hunt, quietly done</p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="hero-title">
              The right role,
              <br />
              <em>found with patience.</em>
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="hero-sub">
              A calm workspace for serious job hunts — tailored search, honest matching,
              and a single board that remembers everything you did.
            </p>
          </Reveal>
          <Reveal delay={360}>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" to="/resume">
                Start with your résumé
              </Link>
              <Link className="btn btn-ghost btn-lg" to="/jobs">
                Browse listings first
              </Link>
            </div>
            <div className="hero-hint">Three steps. No signup theatre.</div>
          </Reveal>
        </div>
        <div className="hero-rule" aria-hidden="true" />
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
        <div className="principles-inner">
          <Reveal>
            <h2>Principles</h2>
          </Reveal>
          <ul>
            {PRINCIPLES.map((p, i) => (
              <PrincipleRow key={p.k} p={p} index={i} />
            ))}
          </ul>
        </div>
      </section>

      <section className="closing">
        <Reveal>
          <h2>Begin the search.</h2>
          <Link className="btn btn-primary btn-lg" to="/resume">
            Upload résumé
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
