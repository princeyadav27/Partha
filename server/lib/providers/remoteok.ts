import { canonicalEmployment, cleanText, fetchJson, keywordFilter } from './util.js';
import type { JobSource, NormalizedJob } from './types.js';

/**
 * Remote OK official API (https://remoteok.com/api) — remote-only listings, no auth.
 * The first array element is a legal notice; their terms require a follow link back to
 * the original posting URL, which we always preserve as source_url.
 */
interface RemoteOkJob {
  slug?: string;
  id?: string | number;
  position?: string;
  company?: string;
  location?: string;
  tags?: string[];
  description?: string;
  date?: string;
  url?: string;
  apply_url?: string;
  legal?: string;
}

function employmentFromTags(tags: string[] | undefined): NormalizedJob['employment_type'] {
  if (!tags?.length) return null;
  const lower = tags.map((t) => t.toLowerCase());
  return canonicalEmployment(
    lower.includes('full time') ? 'full_time'
    : lower.includes('part time') ? 'part_time'
    : lower.includes('contract') ? 'contract'
    : lower.includes('internship') ? 'internship'
    : null,
  );
}

function normalize(raw: RemoteOkJob): NormalizedJob | null {
  const title = cleanText(raw.position, 300);
  const sourceUrl = raw.url ?? raw.apply_url ?? '';
  const sourceJobId = raw.id != null ? String(raw.id) : raw.slug ?? '';
  if (!title || !sourceJobId) return null;
  return {
    source: 'remoteok',
    source_job_id: sourceJobId,
    title,
    company: cleanText(raw.company, 200) || 'Unknown company',
    description: cleanText(raw.description, 20000),
    location: cleanText(raw.location, 200) || 'Remote',
    country: null,
    remote_status: 'remote',
    employment_type: employmentFromTags(raw.tags),
    posted_at: raw.date ?? null,
    expires_at: null,
    source_url: sourceUrl,
  };
}

export const remoteOkProvider: JobSource = {
  name: 'remoteok',
  label: 'Remote OK',
  configured: () => true,
  async search(criteria) {
    const data = await fetchJson<RemoteOkJob[]>('https://remoteok.com/api');
    const jobs: NormalizedJob[] = [];
    for (const raw of Array.isArray(data) ? data : []) {
      if (raw.legal && !raw.position) continue; // legal notice element
      const job = normalize(raw);
      if (job) jobs.push(job);
    }
    return keywordFilter(jobs, criteria.roles, (j) => `${j.title} ${(j.description || '').slice(0, 600)}`);
  },
};
