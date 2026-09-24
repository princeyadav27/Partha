import { chatJSON, aiConfigured } from './ai.js';
import { z } from 'zod';

const ExpansionSchema = z.object({
  terms: z.array(z.string().min(1).max(80)).min(1).max(10),
});

const PLANNER_SYSTEM = `You expand job-search queries for a job board aggregator.

Given a list of job titles the user is targeting, return closely related search terms that job boards would match.
Rules:
- Include the original titles plus 2-5 close variants (e.g. "LLM Engineer" -> "Machine Learning Engineer", "Applied AI Engineer").
- Only job-title-level terminology. Never include countries, cities, companies, seniority inflation, or unrelated roles.
- Return JSON: {"terms": ["...", "..."]}. No commentary.`;

/**
 * Best-effort role expansion. Always resolves (with the original roles on any failure
 * or timeout) so search never blocks on the planner.
 */
export async function expandTargetRoles(roles: string[]): Promise<string[]> {
  const originals = roles.map((r) => r.trim()).filter(Boolean).slice(0, 5);
  if (originals.length === 0 || !aiConfigured()) return originals;
  const timeout = new Promise<string[]>((resolve) => setTimeout(() => resolve(originals), 45000));
  const expansion = (async () => {
    try {
      const { data } = await chatJSON({
        system: PLANNER_SYSTEM,
        user: `Target roles: ${originals.join(', ')}`,
        schema: ExpansionSchema,
        temperature: 0.2,
        maxTokens: 300,
      });
      const merged = new Set<string>();
      for (const term of [...originals, ...data.terms]) {
        const key = term.toLowerCase().trim();
        if (!key) continue;
        const existing = [...merged].find((m) => m.toLowerCase() === key);
        if (existing) continue;
        merged.add(term.trim());
        if (merged.size >= 8) break;
      }
      return [...merged];
    } catch {
      return originals;
    }
  })();
  return Promise.race([expansion, timeout]);
}
