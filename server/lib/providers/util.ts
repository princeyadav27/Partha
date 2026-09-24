import crypto from 'node:crypto';
import type { EmploymentType, NormalizedJob } from './types.js';

export function stripHtml(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function cleanText(value: string | undefined | null, maxLength: number): string {
  return stripHtml(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .slice(0, maxLength)
    .trim();
}

export function canonicalName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function canonicalEmployment(...candidates: (string | null | undefined)[]): EmploymentType | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const v = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (v === 'full_time' || v === 'fulltime') return 'full_time';
    if (v === 'part_time' || v === 'parttime') return 'part_time';
    if (v === 'contract') return 'contract';
    if (v === 'internship' || v === 'intern') return 'internship';
    if (v === 'permanent') return 'full_time';
  }
  return null;
}

export function descriptionFingerprint(description: string): string {
  return crypto.createHash('sha1').update(description.slice(0, 300).toLowerCase()).digest('hex');
}

export function dedupeKeyFor(job: NormalizedJob): string {
  return crypto
    .createHash('sha1')
    .update(`${canonicalName(job.company)}|${canonicalName(job.title)}|${descriptionFingerprint(job.description)}`)
    .digest('hex');
}

const COUNTRY_NAMES: Record<string, string[]> = {
  in: ['india', 'bharat'],
  us: ['usa', 'united states', 'united states of america', 'america'],
  gb: ['uk', 'united kingdom', 'great britain', 'england'],
  ca: ['canada'],
  au: ['australia'],
  de: ['germany', 'deutschland'],
  sg: ['singapore'],
  ae: ['united arab emirates', 'uae', 'dubai', 'abu dhabi'],
  nl: ['netherlands', 'holland'],
  fr: ['france'],
};

const CONTINENT_MEMBERS: Record<string, string[]> = {
  europe: ['de', 'gb', 'fr', 'nl', 'es', 'it', 'pl', 'ie', 'at', 'ch', 'se', 'no', 'dk', 'fi', 'pt', 'be', 'cz', 'gr', 'hu', 'ro'],
  'north america': ['us', 'ca', 'mx'],
  'latin america': ['mx', 'br', 'ar', 'co', 'cl'],
  asia: ['in', 'sg', 'ae', 'jp', 'kr', 'cn', 'ph', 'id', 'th', 'vn', 'my', 'pk', 'bd'],
  africa: ['za', 'ng', 'ke', 'eg'],
  oceania: ['au', 'nz'],
};

/**
 * Decides whether a job with an unstructured location string (e.g. "United States",
 * "Europe", "Worldwide") is relevant to the user's selected countries.
 * Null/empty/worldwide locations match every selection.
 */
export function locationMatchesCountries(location: string, countries: string[]): boolean {
  if (countries.length === 0) return true;
  const loc = location.toLowerCase().trim();
  if (!loc || /worldwide|anywhere|global|remote\b|no location|earth/.test(loc)) return true;
  for (const country of countries) {
    const aliases = COUNTRY_NAMES[country] ?? [];
    if (aliases.some((alias) => loc.includes(alias))) return true;
    if (CONTINENT_MEMBERS[loc]?.includes(country)) return true;
    if (loc.includes(country)) return true;
  }
  return false;
}

const KEYWORD_STOPWORDS = new Set(['and', 'the', 'of', 'for']);

export function keywordFilter<T>(items: T[], terms: string[], text: (item: T) => string): T[] {
  const active = terms.map((t) => t.toLowerCase().trim()).filter((t) => t.length >= 2 && !KEYWORD_STOPWORDS.has(t));
  if (active.length === 0) return items;
  return items.filter((item) => {
    const haystack = text(item).toLowerCase();
    return active.some((term) => haystack.includes(term));
  });
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * GET with a 20s timeout and a single retry (1.5s backoff) on network errors and 5xx.
 * 4xx responses (including 429) are never retried.
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { headers = {}, timeoutMs = 20000 } = options;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'GorkhaJobBoard/1.0', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.startsWith('HTTP 4')) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

export function toIsoFromUnix(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // seconds vs milliseconds heuristics
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
