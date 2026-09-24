export interface Resume {
  id: string;
  file_name: string | null;
  file_type: string | null;
  extracted_text: string;
  analysis_status: string;
  created_at: string;
}

export interface Skill {
  name: string;
  category?: string | null;
  evidence?: string | null;
}

export interface Analysis {
  professional_summary: string;
  experience_level: string;
  identity: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedin_url?: string | null;
    github_url?: string | null;
    portfolio_url?: string | null;
  };
  target_roles: { title: string; evidence?: string | null }[];
  skills: Skill[];
  experiences: {
    company?: string | null;
    role?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    summary?: string | null;
    achievements?: string[] | null;
    evidence?: string | null;
  }[];
  projects: {
    name: string;
    description?: string | null;
    technologies?: string[] | null;
    url?: string | null;
    evidence?: string | null;
  }[];
  education: {
    institution?: string | null;
    degree?: string | null;
    field?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  }[];
  certifications: { name: string; issuer?: string | null }[];
}

export interface Profile {
  id?: string;
  profile: {
    identity?: Analysis['identity'];
    skills?: Skill[];
    experiences?: Analysis['experiences'];
    projects?: Analysis['projects'];
    education?: Analysis['education'];
    certifications?: Analysis['certifications'];
  };
  summary: string | null;
  experience_level: string | null;
  target_roles: string[];
  locations: string[];
  remote_preference: string;
  country?: string;
  updated_at?: string;
}

export interface Job {
  id: string;
  source: string;
  source_job_id: string;
  title: string;
  company: string | null;
  description: string;
  location: string | null;
  country: string | null;
  remote_status: string;
  employment_type: string | null;
  posted_at: string | null;
  expires_at?: string | null;
  source_url: string;
  created_at: string;
  match_summary?: string | null;
}

/**
 * Mirrors JobRequirementsSchema in server/lib/schemas.ts exactly — the server is
 * the source of truth for this shape, and zod strips any key not listed there.
 * Keep the two in sync: a field the server does not emit will always be
 * undefined here, which silently hides UI rather than failing loudly.
 */
export interface JobRequirements {
  job_title?: string | null;
  required_skills: Skill[];
  preferred_skills: Skill[];
  responsibilities: { text: string; evidence?: string | null }[];
  experience_requirements?: string | null;
  education_requirements?: string | null;
  location_requirements?: string | null;
  employment_type?: string | null;
  seniority?: string | null;
  technologies?: string[];
}

export interface JobMatch {
  job_id: string;
  summary: string | null;
  match: {
    requirements: {
      requirement: string;
      category: 'strong_match' | 'partial_match' | 'missing_or_unverified' | 'not_applicable';
      candidate_evidence: string[];
      job_evidence: string[];
    }[];
    transferable: { from: string; to: string; rationale: string }[];
    summary: string;
  };
}

export interface SavedJob {
  id: string;
  job_id: string;
  status: string;
  notes: string | null;
  applied_at: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  job?: Job;
}
