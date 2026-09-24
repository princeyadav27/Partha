import { canonicalEmployment, cleanText, fetchJson, keywordFilter, toIsoFromUnix } from './util.js';
import type { JobSource, NormalizedJob } from './types.js';

/**
 * Arbeitnow job board API (https://www.arbeitnow.com/api/job-board-api) — Europe/Germany
 * focused, no auth. Treat as replaceable: provider access may be revoked.
 * The API is Germany-scope, so country defaults to 'de'; location holds the provider's city.
 */
interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
}

function normalize(raw: ArbeitnowJob): NormalizedJob | null {
  const title = cleanText(raw.title, 300);
  if (!title || !raw.slug) return null;
  const jobTypes = raw.job_types ?? [];
  return {
    source: 'arbeitnow',
    source_job_id: raw.slug,
    title,
    company: cleanText(raw.company_name, 200) || 'Unknown company',
    description: cleanText(raw.description, 20000),
    location: cleanText(raw.location, 200) || 'Germany',
    country: 'de',
    remote_status: raw.remote ? 'remote' : 'onsite',
    employment_type: canonicalEmployment(jobTypes.find((t) => /^(full_time|part_time|contract|internship)$/i.test(t)) ?? null),
    posted_at: toIsoFromUnix(raw.created_at),
    expires_at: null,
    source_url: raw.url ?? `https://www.arbeitnow.com/jobs/${raw.slug}`,
  };
}

export const arbeitnowProvider: JobSource = {
  name: 'arbeitnow',
  label: 'Arbeitnow',
  configured: () => true,
  async search(criteria) {
    const data = await fetchJson<ArbeitnowResponse>('https://www.arbeitnow.com/api/job-board-api');
    const jobs: NormalizedJob[] = [];
    for (const raw of data.data ?? []) {
      const job = normalize(raw);
      if (job) jobs.push(job);
    }
    return keywordFilter(jobs, criteria.roles, (j) => `${j.title} ${j.description.slice(0, 600)}`);
  },
};
