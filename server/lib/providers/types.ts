export type WorkMode = 'any' | 'remote' | 'hybrid' | 'onsite';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship';

export interface NormalizedJob {
  source: string;
  source_job_id: string;
  title: string;
  company: string;
  description: string;
  location: string;
  country: string | null;
  remote_status: 'remote' | 'hybrid' | 'onsite';
  employment_type: EmploymentType | null;
  posted_at: string | null;
  expires_at: string | null;
  source_url: string;
}

export interface SearchCriteria {
  roles: string[];
  countries: string[];
  location?: string;
  workMode: WorkMode;
  employmentTypes: EmploymentType[];
  postedWithinDays: number;
}

export interface JobSource {
  name: string;
  label: string;
  configured(): boolean;
  search(criteria: SearchCriteria): Promise<NormalizedJob[]>;
}
