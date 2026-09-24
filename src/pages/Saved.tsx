import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { bannerTone } from '../api';
import type { SavedJob } from '../types';
import { postedAge, RemoteBadge } from './FindJobs';

export const STATUS_LABELS: Record<string, string> = {
  saved: 'Saved',
  researching: 'Researching',
  ready_to_apply: 'Ready to apply',
  applied: 'Applied',
  outreach_sent: 'Outreach sent',
  response_received: 'Response received',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export default function Saved() {
  const [saved, setSaved] = useState<SavedJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ saved: SavedJob[] }>('/api/saved')
      .then(({ saved: s }) => setSaved(s))
      .catch((e) => setError((e as Error).message));
  }, []);

  async function remove(id: string) {
    setError(null);
    try {
      await api.del(`/api/saved/${id}`);
      setSaved((prev) => prev?.filter((s) => s.id !== id) ?? prev);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (saved === null) return <p className="muted">{error ?? 'Loading…'}</p>;

  return (
    <div>
      <div className="page-heading">
        <h1>Saved</h1>
        <p className="lede">Jobs you flagged to come back to. Track progress in Applications.</p>
      </div>

      {error && <div className={`banner ${bannerTone(error)}`}>{error}</div>}

      {saved.length === 0 ? (
        <div className="card">
          <h2>Nothing saved yet</h2>
          <p className="muted">When you find a role worth pursuing, save it from the job results.</p>
          <Link to="/jobs" className="btn btn-primary">
            Find jobs →
          </Link>
        </div>
      ) : (
        <div className="job-list">
          {saved.map((s) => {
            const job = s.job;
            return (
              <article key={s.id} className="job-card">
                <div className="job-card-main">
                  <div className="job-card-title-row">
                    {job ? (
                      <Link to={`/jobs/${job.id}`} className="job-title">
                        {job.title}
                      </Link>
                    ) : (
                      <span className="job-title">Job unavailable</span>
                    )}
                    {job && <RemoteBadge status={job.remote_status} />}
                  </div>
                  {job && (
                    <div className="job-meta">
                      <span>{job.company}</span>
                      {job.location && <span> · {job.location}</span>}
                      <span> · {postedAge(job.posted_at)}</span>
                    </div>
                  )}
                  <div className="job-meta">
                    <span className="tag">{STATUS_LABELS[s.status] ?? s.status}</span>
                    <span className="muted">Saved {postedAge(s.created_at)}</span>
                  </div>
                </div>
                <div className="job-card-actions">
                  {job?.source_url && (
                    <a className="btn btn-ghost" href={job.source_url} target="_blank" rel="noreferrer">
                      Apply ↗
                    </a>
                  )}
                  <button className="btn btn-ghost" onClick={() => remove(s.id)}>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
