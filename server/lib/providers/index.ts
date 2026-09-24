import { adzunaProvider, adzunaConfigured } from './adzuna.js';
import { arbeitnowProvider } from './arbeitnow.js';
import { himalayasProvider } from './himalayas.js';
import { remoteOkProvider } from './remoteok.js';
import type { JobSource } from './types.js';

export const sources: JobSource[] = [adzunaProvider, himalayasProvider, remoteOkProvider, arbeitnowProvider];

export { adzunaConfigured };
export type { JobSource, NormalizedJob, SearchCriteria, WorkMode, EmploymentType } from './types.js';
