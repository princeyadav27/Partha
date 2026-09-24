import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatJSON, aiConfigured } from './lib/ai.js';
import { runSearch } from './lib/ingest.js';
import { expandTargetRoles } from './lib/planner.js';
import { adzunaConfigured, type EmploymentType } from './lib/providers/index.js';
import { extractResumeText } from './lib/extract.js';
import { RESUME_ANALYST_SYSTEM, JOB_PARSER_SYSTEM, MATCHER_SYSTEM } from './lib/prompts.js';
import {
  JobMatchSchema,
  JobRequirementsSchema,
  ProfileSchema,
  ResumeAnalysisSchema,
  type JobRequirements,
} from './lib/schemas.js';
import { dbConfigured, getSupabase } from './lib/supabase.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * Nothing client-bound may carry a credential. Provider error bodies are
 * forwarded into `error`/`warning` messages and some providers echo request
 * details back, so known secret values are stripped before responding.
 * Full, unredacted detail still reaches the server log.
 */
const REDACT_VALUES = [
  process.env.OPENROUTER_API_KEY,
  process.env.NVIDIA_API_KEY,
  process.env.ADZUNA_APP_KEY,
  process.env.ADZUNA_APP_ID,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  process.env.SUPABASE_URL,
].filter((value): value is string => Boolean(value && value.length >= 6));

function redact(text: string): string {
  let out = text;
  for (const value of REDACT_VALUES) out = out.split(value).join('[redacted]');
  // Supabase keys are JWTs; provider keys are long prefixed opaque strings.
  out = out.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted]');
  out = out.replace(/\b(?:sk|pk|rk|ghp)-[A-Za-z0-9_-]{16,}\b/g, '[redacted]');
  return out;
}

function requireDb(res: express.Response): boolean {
  if (!dbConfigured() || !getSupabase()) {
    res.status(503).json({ error: 'Database is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.' });
    return false;
  }
  return true;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: dbConfigured(),
    ai: aiConfigured(),
    adzuna: adzunaConfigured(),
  });
});

/* ---------------------------------- resume --------------------------------- */

app.post('/api/resume', upload.single('file'), async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const text = await extractResumeText(file.buffer, file.mimetype, file.originalname);
    if (!text) {
      return res.status(422).json({ error: 'Could not extract any text from this file. If it is a scanned PDF, upload a text-based PDF or DOCX instead.' });
    }
    const { data, error } = await supabase
      .from('resumes')
      .insert({
        file_name: file.originalname,
        file_type: file.mimetype,
        extracted_text: text,
        analysis_status: 'uploaded',
        file_data: file.buffer,
      })
      .select('id, file_name, file_type, extracted_text, analysis_status, created_at')
      .single();
    if (error) throw new Error(error.message);
    res.json({ resume: data });
  } catch (error) {
    res.status(400).json({ error: redact((error as Error).message) });
  }
});

app.get('/api/resume/latest', async (_req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from('resumes')
    .select('id, file_name, file_type, extracted_text, analysis_status, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ resume: data });
});

app.patch('/api/resume/:id', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const text = typeof req.body?.extracted_text === 'string' ? req.body.extracted_text.trim() : '';
  if (!text) return res.status(400).json({ error: 'extracted_text is required.' });
  const { error } = await supabase
    .from('resumes')
    .update({ extracted_text: text })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ ok: true });
});

app.post('/api/resume/:id/analyze', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data: resume, error } = await supabase
    .from('resumes')
    .select('id, extracted_text')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: redact(error.message) });
  if (!resume) return res.status(404).json({ error: 'Resume not found.' });
  if (!aiConfigured()) {
    return res.status(503).json({ error: 'AI analysis is not configured. Add OPENROUTER_API_KEY or NVIDIA_API_KEY in project Secrets.' });
  }
  await supabase.from('resumes').update({ analysis_status: 'analyzing' }).eq('id', resume.id);
  try {
    const { data: analysis, provider } = await chatJSON({
      system: RESUME_ANALYST_SYSTEM,
      user: `Resume text:\n\n${resume.extracted_text.slice(0, 24000)}`,
      schema: ResumeAnalysisSchema,
      maxTokens: 8192,
    });
    await supabase.from('resumes').update({ analysis_status: 'analyzed' }).eq('id', resume.id);
    res.json({ analysis, provider });
  } catch (error) {
    await supabase.from('resumes').update({ analysis_status: 'failed' }).eq('id', resume.id);
    console.error('[resume-analysis] failed:', (error as Error).message);
    res.status(502).json({ error: redact(`Resume analysis failed: ${(error as Error).message}`) });
  }
});

/* ---------------------------------- profile -------------------------------- */

app.get('/api/profile', async (_req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from('candidate_profile')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ profile: data });
});

app.put('/api/profile', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const parsed = ProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: `Invalid profile: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}` });
  }
  const p = parsed.data;
  const row = {
    profile: {
      identity: p.identity,
      skills: p.skills,
      experiences: p.experiences,
      projects: p.projects,
      education: p.education,
      certifications: p.certifications,
    },
    summary: p.summary,
    experience_level: p.experience_level,
    target_roles: p.target_roles,
    locations: p.locations,
    remote_preference: p.remote_preference,
    country: p.country,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from('candidate_profile').select('id').limit(1).maybeSingle();
  const { data, error } = existing
    ? await supabase.from('candidate_profile').update(row).eq('id', existing.id).select().single()
    : await supabase.from('candidate_profile').insert(row).select().single();
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ profile: data });
});

/* ----------------------------------- jobs ---------------------------------- */

const jobColumns = 'id, source, source_job_id, title, company, description, location, country, remote_status, employment_type, posted_at, expires_at, source_url, created_at';

const WORK_MODES = new Set(['any', 'remote', 'hybrid', 'onsite']);
const EMPLOYMENT_TYPES = new Set(['full_time', 'part_time', 'contract', 'internship']);

app.post('/api/jobs/search', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const body = req.body ?? {};
  const roles: string[] = Array.isArray(body.target_roles)
    ? body.target_roles.map((r: unknown) => String(r).trim()).filter(Boolean).slice(0, 5)
    : [];
  if (roles.length === 0) return res.status(400).json({ error: 'Provide at least one target role.' });

  let countries: string[] = Array.isArray(body.countries)
    ? body.countries.map((c: unknown) => String(c).trim().toLowerCase()).filter(Boolean).slice(0, 5)
    : [];
  if (countries.length === 0 && typeof body.country === 'string' && body.country.trim()) {
    countries = [body.country.trim().toLowerCase()];
  }

  const workMode = WORK_MODES.has(body.work_mode) ? body.work_mode : (body.remote_only ? 'remote' : 'any');
  const employmentTypes = (Array.isArray(body.employment_types)
    ? body.employment_types.map((t: unknown) => String(t).trim()).filter((t: string) => EMPLOYMENT_TYPES.has(t))
    : []) as EmploymentType[];
  const postedWithinDays = Number.isFinite(Number(body.posted_within_days)) ? Math.max(0, Number(body.posted_within_days)) : 0;
  const location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : undefined;

  try {
    const terms = await expandTargetRoles(roles);
    const result = await runSearch({ roles: terms, countries, location, workMode, employmentTypes, postedWithinDays }, supabase);

    let jobs = result.jobs;
    if (jobs.length > 0) {
      const ids = jobs.map((j) => j.id);
      const { data: matches } = await supabase
        .from('job_matches')
        .select('job_id, summary')
        .in('job_id', ids);
      const summaryById = new Map((matches ?? []).map((m) => [m.job_id, m.summary as string | null]));
      jobs = jobs.map((j) => ({ ...j, match_summary: summaryById.get(j.id) ?? null }));
    }

    res.json({
      jobs,
      warnings: result.warnings,
      sources_used: result.sources_used,
      sources_failed: result.sources_failed,
    });
  } catch (error) {
    res.status(502).json({ error: redact((error as Error).message) });
  }
});

/**
 * Failed parses are remembered so a posting the model cannot parse is not
 * re-billed on every page view. Successful results live in the database; only
 * failures need this in-process cache.
 */
const PARSE_FAILURE_TTL_MS = 10 * 60 * 1000;
const parseFailures = new Map<string, { at: number; error: string }>();

async function ensureRequirements(jobId: string): Promise<JobRequirements | null | 'unconfigured' | { error: string }> {
  const supabase = getSupabase()!;
  const { data: cached } = await supabase
    .from('job_requirements')
    .select('requirements')
    .eq('job_id', jobId)
    .maybeSingle();
  if (cached && !isEmptyRequirements(cached.requirements)) {
    parseFailures.delete(jobId);
    return cached.requirements as JobRequirements;
  }
  const recentFailure = parseFailures.get(jobId);
  if (recentFailure && Date.now() - recentFailure.at < PARSE_FAILURE_TTL_MS) {
    return { error: recentFailure.error };
  }
  if (!aiConfigured()) return 'unconfigured';
  const { data: job } = await supabase.from('jobs').select('title, description').eq('id', jobId).maybeSingle();
  if (!job) return null;
  const { data: parsed, error } = await chatJSON({
    system: JOB_PARSER_SYSTEM,
    user: `Job title: ${job.title}\n\nJob description:\n${(job.description ?? '').slice(0, 16000)}`,
    schema: JobRequirementsSchema,
    maxTokens: 8192,
  }).then(
    (r) => ({ data: r.data, error: null as string | null }),
    (e) => ({ data: null, error: (e as Error).message }),
  );
  if (error || !parsed) {
    const message = error ?? 'Unknown parse failure';
    console.error(`[job-requirements] parse failed for job ${jobId}: ${message}`);
    parseFailures.set(jobId, { at: Date.now(), error: message });
    return { error: message };
  }
  if (isEmptyRequirements(parsed)) {
    const message = 'Parsed requirements were empty — try again';
    parseFailures.set(jobId, { at: Date.now(), error: message });
    return { error: message };
  }
  parseFailures.delete(jobId);
  await supabase.from('job_requirements').upsert({ job_id: jobId, requirements: parsed }, { onConflict: 'job_id' });
  return parsed;
}

function isEmptyRequirements(req: unknown): boolean {
  if (!req || typeof req !== 'object' || Array.isArray(req)) return true;
  const r = req as Record<string, unknown>;
  const skillsEmpty = !Array.isArray(r.required_skills) || r.required_skills.length === 0;
  const preferredEmpty = !Array.isArray(r.preferred_skills) || r.preferred_skills.length === 0;
  const respEmpty = !Array.isArray(r.responsibilities) || r.responsibilities.length === 0;
  const textEmpty = !r.experience_requirements && !r.education_requirements;
  return skillsEmpty && preferredEmpty && respEmpty && textEmpty;
}

app.get('/api/jobs/:id', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data: job, error } = await supabase.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: redact(error.message) });
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  let requirements = null;
  let requirements_warning: string | null = null;
  try {
    const result = await ensureRequirements(job.id);
    if (typeof result === 'object' && result !== null && 'error' in result) {
      requirements_warning = redact(
        `Automatic parsing failed for this posting (${result.error.slice(0, 160)}). You can still read the original description.`,
      );
    } else if (result === 'unconfigured') {
      requirements_warning = 'AI parsing is not configured. Add an AI provider key in project Secrets.';
    } else if (result === null) {
      requirements_warning = 'This job description could not be parsed automatically.';
    } else {
      requirements = result;
    }
  } catch (error) {
    requirements_warning = (error as Error).message;
  }
  res.json({ job, requirements, requirements_warning });
});

app.post('/api/jobs/:id/match', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  if (!aiConfigured()) {
    return res.status(503).json({ error: 'AI matching is not configured. Add OPENROUTER_API_KEY or NVIDIA_API_KEY in project Secrets.' });
  }
  const { data: job } = await supabase.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  const { data: profile } = await supabase.from('candidate_profile').select('*').limit(1).maybeSingle();
  if (!profile) return res.status(400).json({ error: 'Create your candidate profile first.' });
  const requirements = await ensureRequirements(job.id);
  if (typeof requirements === 'object' && requirements !== null && 'error' in requirements) {
    return res.status(422).json({ error: `This job description could not be parsed into requirements (${requirements.error.slice(0, 160)}).` });
  }
  if (requirements === 'unconfigured') return res.status(503).json({ error: 'AI parsing is not configured.' });
  if (!requirements) return res.status(422).json({ error: 'This job description could not be parsed into requirements.' });

  const candidate = {
    summary: profile.summary,
    experience_level: profile.experience_level,
    target_roles: profile.target_roles,
    ...(profile.profile ?? {}),
    locations: profile.locations,
    remote_preference: profile.remote_preference,
  };
  const { data: match, error } = await chatJSON({
    system: MATCHER_SYSTEM,
    user: `Candidate profile:\n${JSON.stringify(candidate, null, 2).slice(0, 14000)}\n\nParsed job requirements:\n${JSON.stringify(requirements, null, 2).slice(0, 10000)}`,
    schema: JobMatchSchema,
    maxTokens: 8192,
  }).then(
    (r) => ({ data: r.data, error: null as string | null }),
    (e) => ({ data: null, error: (e as Error).message }),
  );
  if (error || !match) {
    console.error(`[match] failed for job ${job.id}: ${error}`);
    return res.status(502).json({ error: redact(`Matching failed: ${error}`) });
  }
  const { data: saved, error: saveError } = await supabase
    .from('job_matches')
    .upsert({ job_id: job.id, match, summary: match.summary }, { onConflict: 'job_id' })
    .select()
    .single();
  if (saveError) return res.status(500).json({ error: redact(saveError.message) });
  res.json({ match: saved });
});

app.get('/api/jobs/:id/match', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from('job_matches')
    .select('*')
    .eq('job_id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ match: data });
});

/* ------------------------------- applications ------------------------------ */

const savedColumns = 'id, job_id, status, notes, applied_at, follow_up_date, created_at, updated_at, job:jobs(*)';

app.get('/api/saved', async (_req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from('saved_jobs')
    .select(savedColumns)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ saved: data ?? [] });
});

app.post('/api/saved', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const jobId = String(req.body?.job_id ?? '');
  if (!jobId) return res.status(400).json({ error: 'job_id is required.' });
  const { data: existing } = await supabase.from('saved_jobs').select('id').eq('job_id', jobId).maybeSingle();
  if (existing) return res.json({ saved: existing, already_saved: true });
  const { data, error } = await supabase.from('saved_jobs').insert({ job_id: jobId }).select().single();
  if (error) return res.status(500).json({ error: redact(error.message) });
  await supabase.from('application_events').insert({ saved_job_id: data.id, event_type: 'saved', detail: {} });
  res.json({ saved: data });
});

const STATUSES = new Set([
  'saved', 'researching', 'ready_to_apply', 'applied', 'outreach_sent',
  'response_received', 'interview', 'offer', 'rejected', 'withdrawn',
]);

app.patch('/api/saved/:id', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data: current, error: fetchError } = await supabase
    .from('saved_jobs')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchError) return res.status(500).json({ error: redact(fetchError.message) });
  if (!current) return res.status(404).json({ error: 'Saved job not found.' });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const events: { event_type: string; detail: Record<string, unknown> }[] = [];
  if (typeof req.body?.status === 'string') {
    if (!STATUSES.has(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
    if (req.body.status !== current.status) {
      updates.status = req.body.status;
      events.push({ event_type: 'status_changed', detail: { from: current.status, to: req.body.status } });
    }
  }
  if (typeof req.body?.notes === 'string') updates.notes = req.body.notes;
  if ('applied_at' in (req.body ?? {})) {
    updates.applied_at = req.body.applied_at ? new Date(req.body.applied_at).toISOString() : null;
  }
  if ('follow_up_date' in (req.body ?? {})) {
    updates.follow_up_date = req.body.follow_up_date || null;
  }
  const { data, error } = await supabase
    .from('saved_jobs')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, job_id, status, notes, applied_at, follow_up_date, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ error: redact(error.message) });
  if (events.length) {
    await supabase.from('application_events').insert(events.map((e) => ({ saved_job_id: data.id, ...e })));
  }
  res.json({ saved: data });
});

app.delete('/api/saved/:id', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { error } = await supabase.from('saved_jobs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ ok: true });
});

app.get('/api/saved/:id/events', async (req, res) => {
  if (!requireDb(res)) return;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from('application_events')
    .select('*')
    .eq('saved_job_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: redact(error.message) });
  res.json({ events: data ?? [] });
});

/* ------------------------------ static frontend ---------------------------- */

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

app.use(express.static(distDir));

let cachedIndexHtml: Buffer | null = null;

/**
 * Read lazily rather than at module scope: a missing `dist/` must not prevent
 * the API from booting (`npm run dev:api` before a first `npm run build`).
 */
function indexHtml(): Buffer | null {
  if (cachedIndexHtml) return cachedIndexHtml;
  try {
    cachedIndexHtml = fs.readFileSync(path.join(distDir, 'index.html'));
    return cachedIndexHtml;
  } catch {
    return null;
  }
}

// Unknown /api routes must answer with JSON, not the SPA fallback HTML.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API route.' });
});

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  const html = indexHtml();
  if (!html) {
    return res
      .status(503)
      .type('html')
      .send(
        '<h1>Frontend is not built yet</h1><p>Run <code>npm run build</code> (or <code>npm run dev</code> for the Vite dev server), then reload.</p>',
      );
  }
  res.type('html').send(html);
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Partha listening on port ${PORT}`);
});
