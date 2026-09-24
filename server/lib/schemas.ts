import { z } from 'zod';

export const IdentitySchema = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  location: z.string().nullish(),
  linkedin_url: z.string().nullish(),
  github_url: z.string().nullish(),
  portfolio_url: z.string().nullish(),
});

export const SkillSchema = z.object({
  name: z.string(),
  category: z.string().nullish(),
  evidence: z.string().nullish(),
});

export const TargetRoleSchema = z.object({
  title: z.string(),
  evidence: z.string().nullish(),
});

function normalizeEntries(value: unknown, nameKeys: string[], evidenceKeys: string[]): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { [nameKeys[0]]: item };
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const hasName = nameKeys.some((k) => typeof obj[k] === 'string');
        if (hasName) {
          // Drop non-string values under name keys (e.g. numeric ids, nested
          // objects the model sometimes returns) so only one clean string
          // remains. Other fields (category, etc.) are preserved.
          const cleaned: Record<string, unknown> = { ...obj };
          let kept: string | null = null;
          for (const k of nameKeys) {
            if (typeof cleaned[k] === 'string') {
              if (kept === null) kept = cleaned[k] as string;
              delete cleaned[k];
            }
          }
          if (kept !== null) cleaned[nameKeys[0]] = kept;
          return cleaned;
        }
        const renamed: Record<string, unknown> = {};
        let firstString: string | null = null;
        for (const [k, v] of Object.entries(obj)) {
          if (nameKeys.includes(k)) {
            // Non-string values under name keys are dropped entirely.
            if (typeof v === 'string') renamed[nameKeys[0]] = v;
          } else if (evidenceKeys.includes(k)) {
            if (typeof v === 'string') renamed.evidence = v;
          } else {
            if (firstString === null && typeof v === 'string' && v.trim()) firstString = k;
            renamed[k] = v;
          }
        }
        if (!(nameKeys[0] in renamed) && firstString !== null) {
          renamed[nameKeys[0]] = renamed[firstString];
          delete renamed[firstString];
        }
        // Skip entries we could not normalize to a string name (e.g. numeric
        // ids or empty shapes) instead of failing the whole analysis.
        if (typeof renamed[nameKeys[0]] !== 'string') return null;
        return renamed;
      }
      return item;
    })
    .filter((item) => item !== null);
}

function normalizeSkillList(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const nested = Object.values(obj).find((v) => Array.isArray(v));
    if (nested) return normalizeSkillList(nested);
    return Object.entries(obj).flatMap(([category, v]) => {
      const names = typeof v === 'string' ? v.split(/[,;]+/) : Array.isArray(v) ? v : [];
      return names
        .map((n) => (typeof n === 'string' ? n.trim() : ''))
        .filter(Boolean)
        .map((name) => ({ name, category }));
    });
  }
  return normalizeEntries(value, ['name', 'skill'], ['evidence', 'quote']);
}

const skillList = z.preprocess(
  (v) => {
    const normalized = normalizeSkillList(v);
    return Array.isArray(normalized) ? normalized.slice(0, 40) : normalized;
  },
  z.array(SkillSchema).max(40).default([]),
);

const targetRoleList = z.preprocess(
  (v) => {
    const normalized = normalizeEntries(v, ['title', 'role', 'job_title'], ['evidence', 'reason']);
    return Array.isArray(normalized) ? normalized.slice(0, 8) : normalized;
  },
  z.array(TargetRoleSchema).max(8).default([]),
);

function normalizeTextEntries(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.slice(0, 30).map((item) => {
    if (typeof item === 'string') return { text: item };
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (typeof obj.text === 'string') return item;
      const textKey = Object.keys(obj).find(
        (k) => typeof obj[k] === 'string' && /^(text|description|task|item|responsibility|detail)$/i.test(k),
      );
      if (textKey) return { text: obj[textKey], evidence: obj.evidence };
    }
    return item;
  });
}

const responsibilityList = z.preprocess(
  normalizeTextEntries,
  z
    .array(z.object({ text: z.string(), evidence: z.string().nullish() }))
    .max(30)
    .default([]),
);

export const ResumeAnalysisSchema = z.object({
  professional_summary: z.string(),
  experience_level: z.string(),
  identity: IdentitySchema,
  target_roles: targetRoleList,
  skills: skillList,
  experiences: z
    .array(
      z.object({
        company: z.string().nullish(),
        role: z.string().nullish(),
        start_date: z.string().nullish(),
        end_date: z.string().nullish(),
        summary: z.string().nullish(),
        achievements: z.array(z.string()).nullish(),
        evidence: z.string().nullish(),
      }),
    )
    .max(15)
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().nullish(),
        technologies: z.array(z.string()).nullish(),
        url: z.string().nullish(),
        evidence: z.string().nullish(),
      }),
    )
    .max(15)
    .default([]),
  education: z
    .array(
      z.object({
        institution: z.string().nullish(),
        degree: z.string().nullish(),
        field: z.string().nullish(),
        start_date: z.string().nullish(),
        end_date: z.string().nullish(),
      }),
    )
    .max(10)
    .default([]),
  certifications: z
    .array(z.object({ name: z.string(), issuer: z.string().nullish() }))
    .max(15)
    .default([]),
});
export type ResumeAnalysis = z.infer<typeof ResumeAnalysisSchema>;

/* ------------------------- job requirements schema ------------------------- */

export const JobRequirementsSchema = z.object({
  job_title: z.string().nullish(),
  required_skills: skillList,
  preferred_skills: skillList,
  responsibilities: responsibilityList,
  experience_requirements: z.string().nullish(),
  education_requirements: z.string().nullish(),
  location_requirements: z.string().nullish(),
  employment_type: z.string().nullish(),
  seniority: z.string().nullish(),
  // The parser prompt asks for technologies; without this key zod stripped them
  // and the parsed values never reached the database or the UI.
  technologies: z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value
              .map((item) =>
                typeof item === 'string'
                  ? item.trim()
                  : item && typeof (item as { name?: unknown }).name === 'string'
                    ? (item as { name: string }).name.trim()
                    : '',
              )
              .filter(Boolean)
              .slice(0, 30)
          : [],
      z.array(z.string()).default([]),
    )
    .default([]),
});
export type JobRequirements = z.infer<typeof JobRequirementsSchema>;

/* ----------------------------- match schema ------------------------------- */

export const MatchCategorySchema = z.enum([
  'strong_match',
  'partial_match',
  'missing_or_unverified',
  'not_applicable',
]);

export const JobMatchSchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    let obj = { ...(v as Record<string, unknown>) };
    // Dig out the content: unwrap one or more "match" wrapper layers.
    let summaryFallback: unknown = obj.summary;
    for (let depth = 0; depth < 3; depth++) {
      const inner = obj.match;
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        if (summaryFallback == null && obj.summary != null) summaryFallback = obj.summary;
        obj = { ...(inner as Record<string, unknown>) };
      } else {
        break;
      }
    }
    // Normalize category aliases (strong -> strong_match, etc.)
    const aliasMap: Record<string, string> = {
      strong: 'strong_match',
      match: 'strong_match',
      partial: 'partial_match',
      partial_match: 'partial_match',
      missing: 'missing_or_unverified',
      unverified: 'missing_or_unverified',
      not_applicable: 'not_applicable',
      na: 'not_applicable',
    };
    const coerceEvidence = (x: unknown): string[] => {
      if (typeof x === 'string') return x.trim() ? [x.trim()] : [];
      if (Array.isArray(x)) return x.filter((s) => typeof s === 'string') as string[];
      return [];
    };
    if (Array.isArray(obj.requirements)) {
      const reqs = obj.requirements as unknown[];
      obj.requirements = reqs.map((r) => {
        if (!(r && typeof r === 'object') || Array.isArray(r)) return r;
        const item = { ...(r as Record<string, unknown>) };
        const nameKey = ['requirement', 'skill', 'name'].find((k) => typeof item[k] === 'string');
        if (nameKey && nameKey !== 'requirement') {
          item.requirement = item[nameKey];
          delete item[nameKey];
        }
        const cat = typeof item.category === 'string' ? item.category.trim().toLowerCase() : '';
        if (cat && aliasMap[cat]) item.category = aliasMap[cat];
        item.candidate_evidence = coerceEvidence(
          item.candidate_evidence ?? item.candidate_evidences ?? item.evidence,
        );
        delete item.candidate_evidences;
        delete item.evidence;
        item.job_evidence = coerceEvidence(item.job_evidence ?? item.job_evidences ?? item.job_evidence);
        delete item.job_evidences;
        return item;
      }).slice(0, 20);
    }
    if (Array.isArray(obj.transferable)) {
      const fromKeys = ['from', 'from_skill', 'candidate_skill', 'source', 'skill', 'existing_skill'];
      const toKeys = ['to', 'to_skill', 'job_skill', 'target', 'transfer_to', 'new_skill'];
      obj.transferable = obj.transferable
        .map((r) => {
          if (!(r && typeof r === 'object') || Array.isArray(r)) return null;
          const t = { ...(r as Record<string, unknown>) };
          const from = fromKeys.map((k) => t[k]).find((v) => typeof v === 'string');
          const to = toKeys.map((k) => t[k]).find((v) => typeof v === 'string');
          const rationale = [t.rationale, t.reason, t.why].find((v) => typeof v === 'string');
          if (!from && !to) return null;
          return { from: from ?? '', to: to ?? '', rationale: rationale ?? '' };
        })
        .filter(Boolean)
        .slice(0, 8);
    }
    if (obj.summary == null && summaryFallback != null) obj.summary = summaryFallback;
    return obj;
  },
  z.object({
    job_id: z.string().nullish(),
    summary: z.string().nullish(),
    requirements: z
      .array(
        z.object({
          requirement: z.string(),
          category: MatchCategorySchema,
          candidate_evidence: z.array(z.string()).default([]),
          job_evidence: z.array(z.string()).default([]),
        }),
      )
      .default([]),
    transferable: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          rationale: z.string(),
        }),
      )
      .default([]),
  }),
);
export type JobMatch = z.infer<typeof JobMatchSchema>;

/* ---------------------------- candidate profile --------------------------- */

export const ProfileSchema = z.object({
  identity: IdentitySchema.nullish(),
  summary: z.string().nullish(),
  experience_level: z.string().nullish(),
  target_roles: z.array(z.string()).default([]),
  skills: z.array(SkillSchema).nullish(),
  experiences: z
    .array(
      z.object({
        company: z.string().nullish(),
        role: z.string().nullish(),
        start_date: z.string().nullish(),
        end_date: z.string().nullish(),
        summary: z.string().nullish(),
        achievements: z.array(z.string()).nullish(),
        evidence: z.string().nullish(),
      }),
    )
    .nullish(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().nullish(),
        technologies: z.array(z.string()).nullish(),
        url: z.string().nullish(),
        evidence: z.string().nullish(),
      }),
    )
    .nullish(),
  education: z
    .array(
      z.object({
        institution: z.string().nullish(),
        degree: z.string().nullish(),
        field: z.string().nullish(),
        start_date: z.string().nullish(),
        end_date: z.string().nullish(),
      }),
    )
    .nullish(),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string().nullish() })).nullish(),
  locations: z.array(z.string()).default([]),
  remote_preference: z.string().default('any'),
  country: z.string().default('in'),
});
export type Profile = z.infer<typeof ProfileSchema>;
