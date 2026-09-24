import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Analysis, Profile as ProfileType, Resume } from '../types';

type Phase = 'loading' | 'upload' | 'review_text' | 'draft' | 'view' | 'edit';

const COUNTRIES = [
  { code: 'in', label: 'India' },
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
  { code: 'de', label: 'Germany' },
  { code: 'sg', label: 'Singapore' },
  { code: 'ae', label: 'United Arab Emirates' },
  { code: 'nl', label: 'Netherlands' },
  { code: 'fr', label: 'France' },
];

export default function Profile() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [resume, setResume] = useState<Resume | null>(null);
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // editable extracted text
  const [extractedText, setExtractedText] = useState('');
  // draft analysis
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // editable form fields
  const [form, setForm] = useState({
    summary: '',
    experience_level: '',
    target_roles: [] as string[],
    skills: [] as { name: string; evidence?: string | null }[],
    locations: [] as string[],
    country: 'in',
    remote_preference: 'any',
    roleInput: '',
    skillInput: '',
    locationInput: '',
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ resume: latest }, { profile: existing }] = await Promise.all([
        api.get<{ resume: Resume | null }>('/api/resume/latest'),
        api.get<{ profile: ProfileType | null }>('/api/profile'),
      ]);
      setResume(latest);
      setProfile(existing);
      if (existing) {
        setPhase('view');
      } else if (latest) {
        setExtractedText(latest.extracted_text);
        setPhase('review_text');
      } else {
        setPhase('upload');
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase('upload');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { resume: saved } = await api.post<{ resume: Resume }>('/api/resume', fd);
      setResume(saved);
      setExtractedText(saved.extracted_text);
      setPhase('review_text');
      setNotice('Resume uploaded. Check the extracted text below — it is what the AI will read.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function saveExtractedText() {
    if (!resume) return;
    setError(null);
    try {
      await api.patch(`/api/resume/${resume.id}`, { extracted_text: extractedText });
      setResume({ ...resume, extracted_text: extractedText });
      setNotice('Extracted text saved.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runAnalysis() {
    if (!resume) return;
    setAnalyzing(true);
    setError(null);
    setNotice(null);
    try {
      const { analysis: result } = await api.post<{ analysis: Analysis }>(
        `/api/resume/${resume.id}/analyze`,
      );
      setAnalysis(result);
      setForm({
        summary: result.professional_summary,
        experience_level: result.experience_level,
        target_roles: result.target_roles.map((r) => r.title),
        skills: result.skills,
        locations: result.identity.location ? [result.identity.location] : [],
        country: 'in',
        remote_preference: 'any',
        roleInput: '',
        skillInput: '',
        locationInput: '',
      });
      setPhase('draft');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  function startEdit() {
    if (!profile) return;
    const p = profile;
    setForm({
      summary: p.summary ?? '',
      experience_level: p.experience_level ?? '',
      target_roles: p.target_roles ?? [],
      skills: p.profile?.skills ?? [],
      locations: p.locations ?? [],
      country: p.country ?? 'in',
      remote_preference: p.remote_preference ?? 'any',
      roleInput: '',
      skillInput: '',
      locationInput: '',
    });
    setPhase('edit');
  }

  async function saveProfile() {
    if (!analysis && phase === 'draft') return;
    setSaving(true);
    setError(null);
    try {
      const payload = phase === 'draft' && analysis
        ? {
            identity: analysis.identity,
            summary: form.summary,
            experience_level: form.experience_level,
            target_roles: form.target_roles,
            skills: form.skills,
            experiences: analysis.experiences,
            projects: analysis.projects,
            education: analysis.education,
            certifications: analysis.certifications,
            locations: form.locations,
            country: form.country,
            remote_preference: form.remote_preference,
          }
        : profile
          ? {
              identity: profile.profile?.identity ?? {},
              summary: form.summary,
              experience_level: form.experience_level,
              target_roles: form.target_roles,
              skills: form.skills,
              experiences: profile.profile?.experiences ?? [],
              projects: profile.profile?.projects ?? [],
              education: profile.profile?.education ?? [],
              certifications: profile.profile?.certifications ?? [],
              locations: form.locations,
              country: form.country,
              remote_preference: form.remote_preference,
            }
          : null;
      if (!payload) return;
      const { profile: saved } = await api.put<{ profile: ProfileType }>('/api/profile', payload);
      setProfile(saved);
      setPhase('view');
      setNotice('Profile saved. You can now search for jobs.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addTo(list: string[], value: string): string[] {
    const v = value.trim();
    return v && !list.includes(v) ? [...list, v] : list;
  }

  if (phase === 'loading') {
    return <p className="muted">Loading your profile…</p>;
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Profile</h1>
        <p className="lede">
          A structured picture of your background. Gorkha uses it to find relevant jobs and explain
          why they fit — every AI suggestion is editable.
        </p>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-ok">{notice}</div>}

      {phase === 'upload' && (
        <section className="card">
          <h2>Start with your resume</h2>
          <p className="muted">
            Upload a PDF or DOCX resume (max 10&nbsp;MB). Your file stays private and is used only
            to build your profile.
          </p>
          <div
            className="dropzone"
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
          >
            {uploading ? 'Uploading…' : 'Click to choose a resume file'}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </section>
      )}

      {phase === 'review_text' && (
        <section className="card">
          <div className="card-head">
            <h2>Check the extracted text</h2>
            {resume?.file_name && <span className="muted">{resume.file_name}</span>}
          </div>
          <p className="muted">
            This is the text Gorkha read from your file. Fix anything that looks wrong before
            analyzing — the analysis can only use what is written here.
          </p>
          <textarea
            className="textarea"
            rows={14}
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
          />
          <div className="actions">
            <button className="btn" onClick={saveExtractedText}>
              Save text
            </button>
            <button className="btn btn-primary" onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? 'Analyzing… this can take up to a minute' : 'Analyze resume'}
            </button>
          </div>
        </section>
      )}

      {(phase === 'draft' || phase === 'edit') && (
        <section className="card">
          <div className="card-head">
            <h2>{phase === 'draft' ? 'Review your profile draft' : 'Edit profile'}</h2>
            <span className="muted">
              {phase === 'draft'
                ? 'Generated from your resume — edit anything before saving.'
                : ''}
            </span>
          </div>

          <label className="field-label">Professional summary</label>
          <textarea
            className="textarea"
            rows={4}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />

          <label className="field-label">Experience level</label>
          <input
            className="input"
            value={form.experience_level}
            onChange={(e) => setForm({ ...form, experience_level: e.target.value })}
          />

          <label className="field-label">Target roles</label>
          <div className="chips">
            {form.target_roles.map((role) => (
              <span key={role} className="chip">
                {role}
                <button
                  className="chip-x"
                  onClick={() =>
                    setForm({ ...form, target_roles: form.target_roles.filter((r) => r !== role) })
                  }
                  aria-label={`Remove ${role}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="add-row">
            <input
              className="input"
              placeholder="Add a role and press Enter"
              value={form.roleInput}
              onChange={(e) => setForm({ ...form, roleInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setForm({ ...form, target_roles: addTo(form.target_roles, form.roleInput), roleInput: '' });
                }
              }}
            />
          </div>

          <label className="field-label">Skills</label>
          <div className="chips">
            {form.skills.map((s, i) => (
              <span key={`${s.name}-${i}`} className="chip" title={s.evidence ?? undefined}>
                {s.name}
                <button
                  className="chip-x"
                  onClick={() =>
                    setForm({ ...form, skills: form.skills.filter((_, j) => j !== i) })
                  }
                  aria-label={`Remove ${s.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="add-row">
            <input
              className="input"
              placeholder="Add a skill and press Enter"
              value={form.skillInput}
              onChange={(e) => setForm({ ...form, skillInput: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const name = form.skillInput.trim();
                  if (name && !form.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
                    setForm({ ...form, skills: [...form.skills, { name }], skillInput: '' });
                  }
                }
              }}
            />
          </div>

          <div className="grid-3">
            <div>
              <label className="field-label">Preferred locations</label>
              <div className="chips">
                {form.locations.map((loc) => (
                  <span key={loc} className="chip">
                    {loc}
                    <button
                      className="chip-x"
                      onClick={() =>
                        setForm({ ...form, locations: form.locations.filter((l) => l !== loc) })
                      }
                      aria-label={`Remove ${loc}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                className="input"
                placeholder="Add a city or region"
                value={form.locationInput}
                onChange={(e) => setForm({ ...form, locationInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setForm({ ...form, locations: addTo(form.locations, form.locationInput), locationInput: '' });
                  }
                }}
              />
            </div>
            <div>
              <label className="field-label">Country</label>
              <select
                className="input"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Remote preference</label>
              <select
                className="input"
                value={form.remote_preference}
                onChange={(e) => setForm({ ...form, remote_preference: e.target.value })}
              >
                <option value="any">Any</option>
                <option value="remote">Remote only</option>
                <option value="onsite">On-site only</option>
              </select>
            </div>
          </div>

          {phase === 'draft' && analysis && (
            <details className="evidence-details">
              <summary>Experience, projects and education from your resume</summary>
              <ProfileDetails analysis={analysis} />
            </details>
          )}

          <div className="actions">
            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            <Link to="/jobs" className="btn btn-ghost">
              Save and go to jobs →
            </Link>
          </div>
        </section>
      )}

      {phase === 'view' && profile && (
        <ProfileView profile={profile} onEdit={startEdit} />
      )}
    </div>
  );
}

function ProfileDetails({ analysis }: { analysis: Analysis }) {
  return (
    <div className="detail-blocks">
      {analysis.experiences.length > 0 && (
        <div>
          <h3>Experience</h3>
          {analysis.experiences.map((x, i) => (
            <div key={i} className="detail-item">
              <strong>{x.role ?? 'Role'}</strong>
              {x.company ? ` — ${x.company}` : ''}
              {x.start_date || x.end_date ? ` (${x.start_date ?? '?'} – ${x.end_date ?? 'present'})` : ''}
              {x.evidence && <div className="evidence">Evidence: “{x.evidence}”</div>}
            </div>
          ))}
        </div>
      )}
      {analysis.projects.length > 0 && (
        <div>
          <h3>Projects</h3>
          {analysis.projects.map((p, i) => (
            <div key={i} className="detail-item">
              <strong>{p.name}</strong>
              {p.description ? ` — ${p.description}` : ''}
              {p.technologies?.length ? ` (${p.technologies.join(', ')})` : ''}
              {p.evidence && <div className="evidence">Evidence: “{p.evidence}”</div>}
            </div>
          ))}
        </div>
      )}
      {analysis.education.length > 0 && (
        <div>
          <h3>Education</h3>
          {analysis.education.map((ed, i) => (
            <div key={i} className="detail-item">
              <strong>{ed.degree ?? 'Degree'}</strong>
              {ed.field ? `, ${ed.field}` : ''}
              {ed.institution ? ` — ${ed.institution}` : ''}
            </div>
          ))}
        </div>
      )}
      {analysis.certifications.length > 0 && (
        <div>
          <h3>Certifications</h3>
          <div className="detail-item">{analysis.certifications.map((c) => c.name).join(' · ')}</div>
        </div>
      )}
    </div>
  );
}

function ProfileView({ profile, onEdit }: { profile: ProfileType; onEdit: () => void }) {
  const p = profile;
  const skills = p.profile?.skills ?? [];
  return (
    <div>
      <section className="card">
        <div className="card-head">
          <h2>{p.profile?.identity?.name ?? 'Your profile'}</h2>
          <button className="btn" onClick={onEdit}>
            Edit
          </button>
        </div>
        {p.profile?.identity?.email && <p className="muted">{p.profile.identity.email}</p>}
        {p.summary && <p className="summary-text">{p.summary}</p>}
        <div className="meta-row">
          {p.experience_level && <span className="tag">{p.experience_level}</span>}
          {p.country && (
            <span className="tag">{COUNTRIES.find((c) => c.code === p.country)?.label ?? p.country}</span>
          )}
          {p.remote_preference && p.remote_preference !== 'any' && (
            <span className="tag">{p.remote_preference === 'remote' ? 'Remote only' : 'On-site'}</span>
          )}
        </div>
        {p.target_roles.length > 0 && (
          <>
            <h3>Target roles</h3>
            <div className="chips">
              {p.target_roles.map((r) => (
                <span key={r} className="chip chip-static">
                  {r}
                </span>
              ))}
            </div>
          </>
        )}
        {skills.length > 0 && (
          <>
            <h3>Skills</h3>
            <div className="chips">
              {skills.map((s, i) => (
                <span key={`${s.name}-${i}`} className="chip chip-static" title={s.evidence ?? undefined}>
                  {s.name}
                </span>
              ))}
            </div>
          </>
        )}
        {p.profile?.experiences && p.profile.experiences.length > 0 && (
          <>
            <h3>Experience</h3>
            {p.profile.experiences.map((x, i) => (
              <div key={i} className="detail-item">
                <strong>{x.role ?? 'Role'}</strong>
                {x.company ? ` — ${x.company}` : ''}
              </div>
            ))}
          </>
        )}
        <div className="actions">
          <Link to="/jobs" className="btn btn-primary">
            Find jobs →
          </Link>
        </div>
      </section>
    </div>
  );
}
