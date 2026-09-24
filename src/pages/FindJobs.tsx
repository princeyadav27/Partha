import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Job, Profile } from '../types';

export function postedAge(postedAt: string | null): string {
  if (!postedAt) return 'Date unknown';
  const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

export function RemoteBadge({ status }: { status: string }) {
  if (status === 'remote') return <span className="tag tag-remote">Remote</span>;
  if (status === 'hybrid') return <span className="tag tag-hybrid">Hybrid</span>;
  if (status === 'onsite') return <span className="tag">On-site</span>;
  return null;
}

const COUNTRIES = [
  { code: 'in', label: 'India' },
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
  { code: 'de', label: 'Germany' },
  { code: 'sg', label: 'Singapore' },
  { code: 'ae', label: 'UAE' },
  { code: 'nl', label: 'Netherlands' },
  { code: 'fr', label: 'France' },
];

const SOURCE_LABELS: Record<string, string> = {
  adzuna: 'Adzuna',
  himalayas: 'Himalayas',
  remoteok: 'Remote OK',
  arbeitnow: 'Arbeitnow',
};

export const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
};

interface SearchResponse {
  jobs: Job[];
  warnings: string[];
  sources_used: string[];
  sources_failed: string[];
}

export default function FindJobs() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState('any');
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [postedWithinDays, setPostedWithinDays] = useState(30);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sourcesUsed, setSourcesUsed] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Seed which jobs are already saved so the Save button reflects real state,
  // including jobs saved in an earlier session.
  useEffect(() => {
    api
      .get<{ saved: { job_id: string }[] }>('/api/saved')
      .then(({ saved }) => setSavedIds(new Set((saved ?? []).map((s) => s.job_id))))
      .catch(() => {
        /* non-fatal: saving still works, the button just cannot show prior state */
      });
  }, []);

  useEffect(() => {
    api
      .get<{ profile: Profile | null }>('/api/profile')
      .then(({ profile: p }) => {
        setProfile(p);
        if (p) {
          setRoles((p.target_roles ?? []).slice(0, 5));
          setCountries(p.country ? [p.country] : ['in']);
          setWorkMode(p.remote_preference === 'remote' ? 'remote' : 'any');
          setLocation((p.locations ?? [])[0] ?? '');
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  }, []);

  async function search() {
    setSearching(true);
    setError(null);
    setJobs(null);
    setWarnings([]);
    setSourcesUsed([]);
    try {
      const result = await api.post<SearchResponse>('/api/jobs/search', {
        target_roles: roles,
        countries,
        location: location || undefined,
        work_mode: workMode,
        employment_types: employmentTypes,
        posted_within_days: postedWithinDays,
      });
      setJobs(result.jobs);
      setWarnings(result.warnings ?? []);
      setSourcesUsed(result.sources_used ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function save(jobId: string) {
    setSavingId(jobId);
    setError(null);
    try {
      await api.post('/api/saved', { job_id: jobId });
      setSavedIds((prev) => new Set(prev).add(jobId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : prev.length >= 5 ? prev : [...prev, role],
    );
  }

  function toggleCountry(code: string) {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : prev.length >= 5 ? prev : [...prev, code],
    );
  }

  function toggleEmployment(type: string) {
    setEmploymentTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  if (!profile) {
    return (
      <div>
        <div className="page-heading">
          <h1>Find Jobs</h1>
        </div>
        <div className="card">
          <h2>Build your profile first</h2>
          <p className="muted">
            Gorkha searches based on your resume and target roles. Upload your resume and review
            your profile, then come back here.
          </p>
          <Link to="/profile" className="btn btn-primary">
            Set up my profile →
          </Link>
        </div>
      </div>
    );
  }

  const allRoles = Array.from(new Set([...(profile.target_roles ?? []), ...roles]));

  return (
    <div>
      <div className="page-heading">
        <h1>Find Jobs</h1>
        <p className="lede">
          Search multiple legitimate job sources at once. Results are normalized, deduplicated, and
          keep their original source link.
        </p>
      </div>

      <section className="card">
        <label className="field-label">Target roles (up to 5)</label>
        <div className="chips">
          {allRoles.map((role) => (
            <button
              key={role}
              className={`chip chip-toggle ${roles.includes(role) ? 'chip-on' : ''}`}
              onClick={() => toggleRole(role)}
            >
              {role}
            </button>
          ))}
        </div>

        <label className="field-label">Countries (up to 5)</label>
        <div className="chips">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              className={`chip chip-toggle ${countries.includes(c.code) ? 'chip-on' : ''}`}
              onClick={() => toggleCountry(c.code)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid-3">
          <div>
            <label className="field-label">Work mode</label>
            <select className="input" value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
              <option value="any">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </div>
          <div>
            <label className="field-label">Posted within</label>
            <select
              className="input"
              value={postedWithinDays}
              onChange={(e) => setPostedWithinDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={0}>Any time</option>
            </select>
          </div>
          <div>
            <label className="field-label">Location (optional)</label>
            <input
              className="input"
              placeholder="e.g. Bengaluru"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>

        <label className="field-label">Employment type (optional)</label>
        <div className="chips">
          {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
            <button
              key={value}
              className={`chip chip-toggle ${employmentTypes.includes(value) ? 'chip-on' : ''}`}
              onClick={() => toggleEmployment(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick={search} disabled={searching || roles.length === 0 || countries.length === 0}>
            {searching ? 'Searching…' : 'Search jobs'}
          </button>
          {roles.length === 0 && <span className="muted">Select at least one target role.</span>}
          {countries.length === 0 && <span className="muted">Select at least one country.</span>}
        </div>
      </section>

      {error && <div className="banner banner-error">{error}</div>}
      {warnings.length > 0 && (
        <div className="banner">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {jobs !== null && (
        <section>
          <h2 className="section-title">
            {jobs.length} job{jobs.length === 1 ? '' : 's'} found
            {sourcesUsed.length > 0 && (
              <span className="muted"> · from {sourcesUsed.join(', ')}</span>
            )}
          </h2>
          {jobs.length === 0 && (
            <p className="muted">
              No jobs matched. Try removing the location filter, widening the date range, or adding
              another target role.
            </p>
          )}
          <div className="job-list">
            {jobs.map((job) => (
              <article key={job.id} className="job-card">
                <div className="job-card-main">
                  <div className="job-card-title-row">
                    <Link to={`/jobs/${job.id}`} className="job-title">
                      {job.title}
                    </Link>
                    <RemoteBadge status={job.remote_status} />
                  </div>
                  <div className="job-meta">
                    <span>{job.company}</span>
                    {job.location && <span> · {job.location}</span>}
                    <span> · {postedAge(job.posted_at)}</span>
                    {job.employment_type && EMPLOYMENT_LABELS[job.employment_type] && (
                      <span> · {EMPLOYMENT_LABELS[job.employment_type]}</span>
                    )}
                  </div>
                  <div className="job-meta">
                    <span className="tag tag-source">via {SOURCE_LABELS[job.source] ?? job.source}</span>
                  </div>
                  {job.match_summary && (
                    <p className="match-summary">{job.match_summary}</p>
                  )}
                </div>
                <div className="job-card-actions">
                  <button
                    className="btn"
                    onClick={() => save(job.id)}
                    disabled={savingId === job.id || savedIds.has(job.id)}
                  >
                    {savedIds.has(job.id) ? 'Saved' : savingId === job.id ? 'Saving…' : 'Save'}
                  </button>
                  <Link className="btn btn-ghost" to={`/jobs/${job.id}`}>
                    Why it fits
                  </Link>
                  {job.source_url && (
                    <a className="btn btn-ghost" href={job.source_url} target="_blank" rel="noreferrer">
                      Original ↗
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
