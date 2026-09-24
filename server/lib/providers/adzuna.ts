import { canonicalEmployment, cleanText, keywordFilter } from './util.js';
import type { JobSource, NormalizedJob, SearchCriteria } from './types.js';

const SUPPORTED_COUNTRIES = new Set([
  'in', 'us', 'gb', 'ca', 'au', 'de', 'fr', 'nl', 'es', 'it', 'sg', 'ae', 'nz', 'br', 'mx', 'za', 'pl', 'at', 'ch', 'se', 'no', 'dk', 'fi', 'ie',
]);

export function adzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim());
}

interface AdzunaJob {
  id?: string | number;
  title?: string;
  company?: { display_name?: string };
  description?: string;
  location?: { display_name?: string };
  contract_time?: string;
  contract_type?: string;
  created?: string;
  redirect_url?: string;
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

function normalize(raw: AdzunaJob, country: string): NormalizedJob {
  const title = cleanText(raw.title, 300) || 'Untitled role';
  const description = cleanText(raw.description, 20000);
  const haystack = `${title} ${description}`.toLowerCase();
  const remote = /\b(remote|work from home|wfh|fully distributed|work remotely)\b/.test(haystack);
  const hybrid = /\bhybrid\b/.test(haystack);
  return {
    source: 'adzuna',
    source_job_id: String(raw.id ?? ''),
    title,
    company: cleanText(raw.company?.display_name, 200) || 'Unknown company',
    description,
    location: cleanText(raw.location?.display_name, 200),
    country,
    remote_status: remote ? 'remote' : hybrid ? 'hybrid' : 'onsite',
    employment_type: canonicalEmployment(raw.contract_time, raw.contract_type),
    posted_at: raw.created ?? null,
    expires_at: null,
    source_url: raw.redirect_url ?? '',
  };
}

async function searchCountry(criteria: SearchCriteria, country: string): Promise<NormalizedJob[]> {
  const appId = process.env.ADZUNA_APP_ID!.trim();
  const appKey = process.env.ADZUNA_APP_KEY!.trim();
  const jobs: NormalizedJob[] = [];
  for (const role of criteria.roles.slice(0, 5)) {
    for (const page of [1, 2]) {
      const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
      url.searchParams.set('app_id', appId);
      url.searchParams.set('app_key', appKey);
      url.searchParams.set('results_per_page', '20');
      url.searchParams.set('what', role);
      if (criteria.location) url.searchParams.set('where', criteria.location);
      if (criteria.postedWithinDays > 0) url.searchParams.set('max_days_old', String(criteria.postedWithinDays));
      url.searchParams.set('content-type', 'application/json');
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        throw new Error(`Adzuna ${country} HTTP ${res.status}`);
      }
      const data = (await res.json()) as AdzunaResponse;
      for (const raw of data.results ?? []) {
        const job = normalize(raw, country);
        if (!job.source_job_id) continue;
        jobs.push(job);
      }
    }
  }
  return keywordFilter(jobs, criteria.roles, (j) => `${j.title} ${j.description.slice(0, 600)}`);
}

export const adzunaProvider: JobSource = {
  name: 'adzuna',
  label: 'Adzuna',
  configured: adzunaConfigured,
  async search(criteria) {
    if (!adzunaConfigured()) return [];
    const results: NormalizedJob[] = [];
    for (const country of criteria.countries) {
      if (!SUPPORTED_COUNTRIES.has(country.toLowerCase())) continue;
      results.push(...(await searchCountry(criteria, country.toLowerCase())));
    }
    return results;
  },
};

export { SUPPORTED_COUNTRIES as ADZUNA_SUPPORTED_COUNTRIES };
