import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { bannerTone } from '../api';
import type { SavedJob } from '../types';
import { STATUS_LABELS } from './Saved';

const PIPELINE = [
  'saved',
  'researching',
  'ready_to_apply',
  'applied',
  'outreach_sent',
  'response_received',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

const ACTIVE_STATUSES = new Set(['applied', 'outreach_sent', 'response_received', 'interview', 'offer']);

export default function Applications() {
  const [saved, setSaved] = useState<SavedJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    reload();
  }, []);

  function reload() {
    api
      .get<{ saved: SavedJob[] }>('/api/saved')
      .then(({ saved: s }) => setSaved(s))
      .catch((e) => setError((e as Error).message));
  }

  async function update(id: string, patch: Partial<SavedJob>) {
    setError(null);
    try {
      await api.patch(`/api/saved/${id}`, patch);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (saved === null) return <p className="muted">{error ?? 'Loading…'}</p>;

  const applied = saved.filter((s) => ACTIVE_STATUSES.has(s.status));
  const toApply = saved.filter((s) => !ACTIVE_STATUSES.has(s.status) && s.status !== 'rejected' && s.status !== 'withdrawn');
  const closed = saved.filter((s) => s.status === 'rejected' || s.status === 'withdrawn');

  function group(title: string, items: SavedJob[], hint: string) {
    if (items.length === 0) return null;
    return (
      <section className="app-group">
        <h2 className="section-title">
          {title} <span className="muted">({items.length})</span>
        </h2>
        <p className="muted group-hint">{hint}</p>
        <div className="job-list">
          {items.map((s) => (
            <div key={s.id} className="card app-card">
              <div className="app-card-head">
                <div>
                  {s.job ? (
                    <Link to={`/jobs/${s.job.id}`} className="job-title">
                      {s.job.title}
                    </Link>
                  ) : (
                    <span className="job-title">Job unavailable</span>
                  )}
                  <div className="job-meta">
                    {s.job?.company}
                    {s.job?.location ? ` · ${s.job.location}` : ''}
                  </div>
                </div>
                <div className="app-card-controls">
                  <select
                    className="input input-compact"
                    value={s.status}
                    onChange={(e) => update(s.id, { status: e.target.value })}
                  >
                    {PIPELINE.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                  <label className="followup-label">
                    Follow up
                    <input
                      type="date"
                      className="input input-compact"
                      value={s.follow_up_date ?? ''}
                      onChange={(e) => update(s.id, { follow_up_date: e.target.value })}
                    />
                  </label>
                </div>
              </div>
              <textarea
                className="textarea textarea-compact"
                rows={2}
                placeholder="Notes — who you contacted, what happened, next step…"
                value={editingNotes[s.id] ?? s.notes ?? ''}
                onChange={(e) => setEditingNotes({ ...editingNotes, [s.id]: e.target.value })}
                onBlur={() => {
                  if ((editingNotes[s.id] ?? s.notes ?? '') !== (s.notes ?? '')) {
                    update(s.id, { notes: editingNotes[s.id] ?? '' });
                  }
                }}
              />
              <div className="job-meta">
                {s.applied_at && <span className="tag">Applied {new Date(s.applied_at).toLocaleDateString()}</span>}
                {s.follow_up_date && (
                  <span className="tag">
                    Follow-up {new Date(s.follow_up_date).toLocaleDateString()}
                  </span>
                )}
                {s.status === 'applied' && !s.applied_at && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => update(s.id, { applied_at: new Date().toISOString() })}
                  >
                    Record applied date
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Applications</h1>
        <p className="lede">
          Everything you saved, in one pipeline. Change a status as things move — every change is
          logged.
        </p>
      </div>

      {error && <div className={`banner ${bannerTone(error)}`}>{error}</div>}

      {saved.length === 0 ? (
        <div className="card">
          <h2>No applications yet</h2>
          <p className="muted">Save jobs from your search results and they will appear here.</p>
          <Link to="/jobs" className="btn btn-primary">
            Find jobs →
          </Link>
        </div>
      ) : (
        <>
          {group('In progress', applied, 'Applied or in conversation. Keep notes on each step.')}
          {group('To apply', toApply, 'Saved jobs you have not applied to yet.')}
          {group('Closed', closed, 'Rejected or withdrawn. Kept for reference.')}
        </>
      )}
    </div>
  );
}
