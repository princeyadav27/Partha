import { canonicalEmployment, cleanText, fetchJson, keywordFilter, toIsoFromUnix } from './util.js';
import type { JobSource, NormalizedJob, SearchCriteria } from './types.js';

/**
 * Himalayas public jobs API (https://himalayas.app/jobs/api) — remote-focused, no auth.
 * All listings are remote; locationRestrictions narrows geography when present.
 */
interface HimalayasJob {
  guid?: string;
  title?: string;
  companyName?: string;
  description?: string;
  employmentType?: string;
  locationRestrictions?: string; // JSON-encoded string array
  pubDate?: string;
  expiryDate?: string;
  applicationLink?: string;
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
}

function parseRestrictions(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalize(raw: HimalayasJob): NormalizedJob | null {
  const title = cleanText(raw.title, 300);
  const description = cleanText(raw.description, 20000);
  const sourceUrl = raw.applicationLink ?? raw.guid ?? '';
  const sourceJobId = raw.guid ?? raw.applicationLink ?? '';
  if (!title || !sourceJobId) return null;
  const restrictions = parseRestrictions(raw.locationRestrictions);
  return {
    source: 'himalayas',
    source_job_id: sourceJobId,
    title,
    company: cleanText(raw.companyName, 200) || 'Unknown company',
    description,
    location: restrictions.length ? restrictions.join(', ') : 'Worldwide',
    country: null,
    remote_status: 'remote',
    employment_type: canonicalEmployment(raw.employmentType),
    posted_at: toIsoFromUnix(raw.pubDate),
    expires_at: toIsoFromUnix(raw.expiryDate),
    source_url: sourceUrl,
  };
}

export const himalayasProvider: JobSource = {
  name: 'himalayas',
  label: 'Himalayas',
  configured: () => true,
  async search(criteria: SearchCriteria) {
    const data = await fetchJson<HimalayasResponse>('https://himalayas.app/jobs/api?limit=100');
    const now = Date.now();
    const jobs: NormalizedJob[] = [];
    for (const raw of data.jobs ?? []) {
      const job = normalize(raw);
      if (!job) continue;
      // Drop listings the provider has marked as expired.
      if (job.expires_at && new Date(job.expires_at).getTime() < now) continue;
      jobs.push(job);
    }
    return keywordFilter(jobs, criteria.roles, (j) => `${j.title} ${j.description.slice(0, 600)}`);
  },
};
