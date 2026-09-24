import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { bannerTone } from '../api';
import type { Job, JobMatch, JobRequirements } from '../types';
import { postedAge, RemoteBadge, EMPLOYMENT_LABELS } from './FindJobs';

const CATEGORY_LABEL: Record<string, string> = {
  strong_match: 'Strong match',
  partial_match: 'Partial match',
  missing_or_unverified: 'Missing or unverified',
  not_applicable: 'Not assessable',
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [requirements, setRequirements] = useState<JobRequirements | null>(null);
  const [requirementsWarning, setRequirementsWarning] = useState<string | null>(null);
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMatch = useCallback(async (jobId: string) => {
    try {
      const { match: existing } = await api.get<{ match: JobMatch | null }>(`/api/jobs/${jobId}/match`);
      if (existing) setMatch(existing);
    } catch {
      /* no cached match */
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<{ job: Job; requirements: JobRequirements | null; requirements_warning: string | null }>(
        `/api/jobs/${id}`,
      )
      .then(({ job: j, requirements: r, requirements_warning }) => {
        setJob(j);
        setRequirements(r);
        setRequirementsWarning(requirements_warning);
        return loadMatch(j.id);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, loadMatch]);

  async function runMatch() {
    if (!job) return;
    setMatching(true);
    setError(null);
    try {
      const { match: result } = await api.post<{ match: JobMatch }>(`/api/jobs/${job.id}/match`);
      setMatch(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMatching(false);
    }
  }

  async function save() {
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/saved', { job_id: job.id });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading job…</p>;
  if (!job) return <p className="muted">{error ?? 'Job not found.'}</p>;

  const matchByCategory = (category: string) =>
    match?.match.requirements.filter((r) => r.category === category) ?? [];

  return (
    <div>
      <Link to="/jobs" className="back-link">
        ← Back to results
      </Link>

      <div className="page-heading">
        <div className="job-card-title-row">
          <h1>{job.title}</h1>
          <RemoteBadge status={job.remote_status} />
        </div>
        <p className="lede">
          {job.company}
          {job.location ? ` · ${job.location}` : ''} · {postedAge(job.posted_at)}
          {job.employment_type && EMPLOYMENT_LABELS[job.employment_type] ? ` · ${EMPLOYMENT_LABELS[job.employment_type]}` : ''}
          {' · '}
          <span className="muted">
            source: {job.source}
            {job.source_url && (
              <>
                {' '}
                <a href={job.source_url} target="_blank" rel="noreferrer">
                  open original ↗
                </a>
              </>
            )}
          </span>
        </p>
      </div>

      {error && <div className={`banner ${bannerTone(error)}`}>{error}</div>}
      {requirementsWarning && <div className="banner">{requirementsWarning}</div>}

      <div className="actions sticky-actions">
        <button className="btn btn-primary" onClick={save} disabled={saving || saved}>
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save this job'}
        </button>
        <button className="btn" onClick={runMatch} disabled={matching}>
          {matching ? 'Comparing your profile…' : match ? 'Re-check fit' : 'Check fit against my profile'}
        </button>
      </div>

      {match && (
        <section className="card">
          <h2>Why this job fits (or doesn't)</h2>
          <p className="match-summary">{match.summary ?? match.match.summary}</p>
          <div className="match-groups">
            {['strong_match', 'partial_match', 'missing_or_unverified', 'not_applicable'].map((cat) => {
              const items = matchByCategory(cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="match-group">
                  <h3>
                    <span className={`cat-dot cat-${cat}`} /> {CATEGORY_LABEL[cat]}{' '}
                    <span className="muted">({items.length})</span>
                  </h3>
                  {items.map((r, i) => (
                    <details key={i} className="match-item">
                      <summary>{r.requirement}</summary>
                      <div className="evidence-block">
                        {r.candidate_evidence.length > 0 && (
                          <>
                            <div className="evidence-label">Your evidence</div>
                            <ul>
                              {r.candidate_evidence.map((ev, j) => (
                                <li key={j}>{ev}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {r.job_evidence.length > 0 && (
                          <>
                            <div className="evidence-label">From the job</div>
                            <ul>
                              {r.job_evidence.map((ev, j) => (
                                <li key={j}>{ev}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              );
            })}
          </div>
          {match.match.transferable.length > 0 && (
            <div className="match-group">
              <h3>Possibly transferable</h3>
              {match.match.transferable.map((t, i) => (
                <div key={i} className="detail-item">
                  <strong>
                    {t.from} → {t.to}
                  </strong>
                  {t.rationale ? ` — ${t.rationale}` : ''}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {requirements && (
        <section className="card">
          <h2>What the job asks for</h2>
          <p className="muted">
            Parsed from the job description. Only requirements stated in the posting are listed.
          </p>
          {requirements.experience_requirements && (
            <p>
              <strong>Experience:</strong> {requirements.experience_requirements}
            </p>
          )}
          {requirements.education_requirements && (
            <p>
              <strong>Education:</strong> {requirements.education_requirements}
            </p>
          )}
          {requirements.seniority && (
            <p>
              <strong>Seniority:</strong> {requirements.seniority}
            </p>
          )}
          {requirements.required_skills.length > 0 && (
            <>
              <h3>Required skills</h3>
              <div className="chips">
                {requirements.required_skills.map((s, i) => (
                  <span key={i} className="chip chip-static" title={s.evidence ?? undefined}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          )}
          {requirements.technologies && requirements.technologies.length > 0 && (
            <>
              <h3>Technologies</h3>
              <div className="chips">
                {requirements.technologies.map((t, i) => (
                  <span key={i} className="chip chip-static">
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}
          {requirements.preferred_skills.length > 0 && (
            <>
              <h3>Nice to have</h3>
              <div className="chips">
                {requirements.preferred_skills.map((s, i) => (
                  <span key={i} className="chip chip-static" title={s.evidence ?? undefined}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          )}
          {requirements.responsibilities.length > 0 && (
            <>
              <h3>Responsibilities</h3>
              <ul className="plain-list">
                {requirements.responsibilities.map((r, i) => (
                  <li key={i}>{r.text}</li>
                ))}
              </ul>
            </>
          )}
          {requirements.location_requirements && (
            <p>
              <strong>Location:</strong> {requirements.location_requirements}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>Job description</h2>
        <p className="description-text">{job.description}</p>
      </section>
    </div>
  );
}
