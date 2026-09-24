import type { SupabaseClient } from '@supabase/supabase-js';
import { sources, type EmploymentType, type NormalizedJob, type SearchCriteria, type WorkMode } from './providers/index.js';
import { dedupeKeyFor, locationMatchesCountries } from './providers/util.js';

export interface SearchResult {
  jobs: NormalizedJobRow[];
  warnings: string[];
  sources_used: string[];
  sources_failed: string[];
}

export interface NormalizedJobRow extends NormalizedJob {
  id: string;
  fetched_at: string | null;
}

const JOB_COLUMNS = 'id, source, source_job_id, title, company, description, location, country, remote_status, employment_type, posted_at, expires_at, source_url, fetched_at';

/**
 * Per-provider, per-criteria throttle: skip the external fetch only when this
 * exact search was already run recently. Keying on the provider alone would
 * make a changed role/country silently reuse the previous query's results.
 */
const THROTTLE_MS = 5 * 60 * 1000;
const MAX_THROTTLE_ENTRIES = 200;
const lastFetchAt = new Map<string, number>();

function criteriaKey(criteria: SearchCriteria): string {
  return JSON.stringify({
    roles: [...criteria.roles].map((r) => r.trim().toLowerCase()).sort(),
    countries: [...criteria.countries].sort(),
    location: (criteria.location ?? '').trim().toLowerCase(),
    workMode: criteria.workMode,
    employmentTypes: [...criteria.employmentTypes].sort(),
    postedWithinDays: criteria.postedWithinDays,
  });
}

function throttleKey(sourceName: string, criteria: SearchCriteria): string {
  return `${sourceName}::${criteriaKey(criteria)}`;
}

function markFetched(key: string): void {
  // Bound the map so a long-lived process cannot grow it without limit.
  if (lastFetchAt.size >= MAX_THROTTLE_ENTRIES) {
    const oldest = [...lastFetchAt.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) lastFetchAt.delete(oldest[0]);
  }
  lastFetchAt.set(key, Date.now());
}

interface SourceOutcome {
  name: string;
  label: string;
  ok: boolean;
  skipped?: 'not_configured' | 'throttled';
  jobs: NormalizedJob[];
  error?: string;
}

async function runSource(source: (typeof sources)[number], criteria: SearchCriteria): Promise<SourceOutcome> {
  const base = { name: source.name, label: source.label, jobs: [] as NormalizedJob[] };
  if (!source.configured()) {
    return { ...base, ok: true, skipped: 'not_configured' };
  }
  const key = throttleKey(source.name, criteria);
  const last = lastFetchAt.get(key) ?? 0;
  if (Date.now() - last < THROTTLE_MS) {
    return { ...base, ok: true, skipped: 'throttled' };
  }
  try {
    const jobs = await source.search(criteria);
    markFetched(key);
    return { ...base, ok: true, jobs };
  } catch (error) {
    return { ...base, ok: false, error: (error as Error).message };
  }
}

interface SourceRef {
  provider: string;
  source_job_id: string;
  url: string;
}

function mergeSourceRefs(existing: unknown, refs: SourceRef[]): SourceRef[] {
  const list = Array.isArray(existing) ? (existing as SourceRef[]) : [];
  const merged = [...list];
  for (const ref of refs) {
    if (!merged.some((r) => r.provider === ref.provider && r.source_job_id === ref.source_job_id)) {
      merged.push(ref);
    }
  }
  return merged;
}

/**
 * Ingests provider results into the normalized job store (dedupe across providers,
 * provenance preserved) and returns the rows ingested during this run.
 */
async function ingest(
  outcomes: SourceOutcome[],
  supabase: SupabaseClient | null,
): Promise<NormalizedJobRow[]> {
  const rows: NormalizedJobRow[] = [];
  const now = new Date().toISOString();
  if (!supabase) {
    // Demo mode: no database. Dedupe in process memory and hand the rows
    // straight back so live browsing still works end to end.
    const seen = new Set<string>();
    for (const outcome of outcomes) {
      for (const job of outcome.jobs) {
        const key = dedupeKeyFor(job);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ ...job, id: `demo-${key}`, dedupe_key: key, fetched_at: now } as NormalizedJobRow);
      }
    }
    return rows;
  }
  for (const outcome of outcomes) {
    for (const job of outcome.jobs) {
      const dedupeKey = dedupeKeyFor(job);
      const ref = { provider: job.source, source_job_id: job.source_job_id, url: job.source_url };
      let existing: Record<string, any> | null = null;
      const { data: byKey } = await supabase
        .from('jobs')
        .select(JOB_COLUMNS + ', source_refs')
        .eq('dedupe_key', dedupeKey)
        .maybeSingle();
      existing = (byKey as Record<string, any> | null) ?? null;
      if (!existing) {
        const { data: bySource } = await supabase
          .from('jobs')
          .select(JOB_COLUMNS + ', source_refs')
          .eq('source', job.source)
          .eq('source_job_id', job.source_job_id)
          .maybeSingle();
        existing = (bySource as Record<string, any> | null) ?? null;
      }
      if (existing) {
        const { data: updated, error } = await supabase
          .from('jobs')
          .update({
            fetched_at: now,
            dedupe_key: dedupeKey,
            source_refs: mergeSourceRefs(existing.source_refs, [ref]),
            employment_type: existing.employment_type ?? job.employment_type,
            posted_at: existing.posted_at ?? job.posted_at,
            description: ((existing.description as string | undefined)?.length ?? 0) >= job.description.length ? existing.description : job.description,
          })
          .eq('id', existing.id as string)
          .select(JOB_COLUMNS)
          .single();
        if (!error && updated) rows.push(updated as NormalizedJobRow);
      } else {
        const { data: inserted, error } = await supabase
          .from('jobs')
          .insert({ ...job, dedupe_key: dedupeKey, fetched_at: now, source_refs: [ref] })
          .select(JOB_COLUMNS)
          .single();
        if (!error && inserted) rows.push(inserted as NormalizedJobRow);
      }
    }
  }
  return rows;
}

/** Words too generic to identify a role on their own when matching stored jobs. */
const ROLE_STOPWORDS = new Set([
  'and', 'or', 'the', 'for', 'with', 'from', 'into', 'of', 'in', 'to', 'at', 'as',
  'on', 'by', 'an', 'junior', 'senior', 'lead', 'staff', 'principal', 'entry',
  'level', 'mid', 'associate', 'intern', 'graduate',
]);

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
}

/**
 * Whether a stored job title plausibly belongs to one of the requested roles:
 * the full phrase appears, or every significant word of the role appears in the
 * title. Requiring all words keeps "AI Engineer" from matching "Civil Engineer"
 * while still catching "Engineer, AI Platform".
 *
 * Words are matched whole (plus a plural "s") rather than as substrings, so the
 * two-letter "ai" cannot match "Airline" and "qa" cannot match "quality".
 * Note the 2-character minimum: "ai", "ml", "qa", "ui", "go" and "c++" are all
 * meaningful role words.
 */
export function matchesRoles(title: string, roles: string[]): boolean {
  if (roles.length === 0) return true;
  const titleLower = title.toLowerCase();
  const titleWords = new Set(words(title));
  const hasWord = (word: string) => titleWords.has(word) || titleWords.has(`${word}s`);

  return roles.some((role) => {
    const phrase = role.trim().toLowerCase();
    if (!phrase) return false;
    if (titleLower.includes(phrase)) return true;
    const significant = words(phrase).filter((word) => word.length >= 2 && !ROLE_STOPWORDS.has(word));
    return significant.length > 0 && significant.every(hasWord);
  });
}

/**
 * Fallback to previously ingested jobs when providers are throttled or returned
 * nothing. Restricted to rows matching the requested roles — without this, a
 * search for one role could return listings for a completely unrelated one.
 *
 * Matching happens in JS rather than as a PostgREST `or(...)` filter: the filter
 * syntax cannot be exercised without a live database, and a malformed filter
 * would silently make this fallback return nothing at all.
 */
async function storeFallback(
  supabase: SupabaseClient | null,
  needed: boolean,
  criteria: SearchCriteria,
): Promise<NormalizedJobRow[]> {
  if (!needed || !supabase) return [];
  const { data, error } = await supabase
    .from('jobs')
    .select(JOB_COLUMNS)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .limit(300);
  if (error) return [];
  return ((data ?? []) as NormalizedJobRow[]).filter((row) => matchesRoles(row.title, criteria.roles));
}

function applyHardFilters(rows: NormalizedJobRow[], criteria: SearchCriteria): { kept: NormalizedJobRow[]; warnings: string[] } {
  const warnings: string[] = [];
  let kept = rows;

  // Deduplicate by id (ingested rows may overlap with store fallback).
  const byId = new Map<string, NormalizedJobRow>();
  for (const row of kept) byId.set(row.id, row);
  kept = [...byId.values()];

  // Drop listings the provider told us have closed.
  const now = Date.now();
  kept = kept.filter((j) => !j.expires_at || new Date(j.expires_at).getTime() > now);

  if (criteria.workMode !== 'any') {
    kept = kept.filter((j) => j.remote_status === criteria.workMode);
  }

  if (criteria.employmentTypes.length > 0) {
    const before = kept.length;
    kept = kept.filter((j) => j.employment_type && criteria.employmentTypes.includes(j.employment_type));
    const excluded = before - kept.length;
    if (excluded > 0) {
      warnings.push(`${excluded} listing${excluded === 1 ? '' : 's'} excluded (employment type unknown or not selected).`);
    }
  }

  if (criteria.postedWithinDays > 0) {
    const cutoff = Date.now() - criteria.postedWithinDays * 86400000;
    const before = kept.length;
    kept = kept.filter((j) => j.posted_at && new Date(j.posted_at).getTime() >= cutoff);
    const excluded = before - kept.length;
    if (excluded > 0) {
      warnings.push(`${excluded} listing${excluded === 1 ? '' : 's'} excluded (posted date unknown or older than ${criteria.postedWithinDays} days).`);
    }
  }

  if (criteria.countries.length > 0) {
    kept = kept.filter((j) => {
      if (j.country) return criteria.countries.includes(j.country);
      // Providers without structured country (remote feeds): match via location text,
      // worldwide/unknown locations count as globally applicable.
      return locationMatchesCountries(j.location, criteria.countries);
    });
  }

  if (criteria.location) {
    const loc = criteria.location.toLowerCase();
    kept = kept.filter((j) => j.location.toLowerCase().includes(loc) || j.remote_status === 'remote');
  }

  return { kept, warnings };
}

export async function runSearch(
  criteria: SearchCriteria,
  supabase: SupabaseClient | null,
): Promise<SearchResult> {
  const outcomes = await Promise.all(sources.map((s) => runSource(s, criteria)));

  const warnings: string[] = [];
  const sources_used: string[] = [];
  const sources_failed: string[] = [];
  let anyThrottled = false;
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      sources_failed.push(outcome.label);
      warnings.push(`${outcome.label} is temporarily unavailable; results from other sources are shown.`);
      continue;
    }
    if (outcome.skipped === 'throttled') {
      anyThrottled = true;
      continue;
    }
    if (outcome.skipped === 'not_configured') continue;
    sources_used.push(outcome.label);
  }

  const ingested = await ingest(outcomes, supabase);
  const fallback = await storeFallback(supabase, anyThrottled || ingested.length === 0, criteria);
  const { kept, warnings: filterWarnings } = applyHardFilters([...ingested, ...fallback], criteria);
  warnings.push(...filterWarnings);

  kept.sort((a, b) => {
    const ta = a.posted_at ? new Date(a.posted_at).getTime() : 0;
    const tb = b.posted_at ? new Date(b.posted_at).getTime() : 0;
    return tb - ta;
  });

  return {
    jobs: kept.slice(0, 60),
    warnings,
    sources_used,
    sources_failed,
  };
}
