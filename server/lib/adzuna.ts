/**
 * Superseded: the Adzuna integration now lives at server/lib/providers/adzuna.ts
 * behind the common JobSource interface (server/lib/providers/types.ts).
 * This shim remains only so any stale import keeps resolving to the current implementation.
 */
export { adzunaProvider, adzunaConfigured, ADZUNA_SUPPORTED_COUNTRIES as SUPPORTED_COUNTRIES } from './providers/adzuna.js';
export type { NormalizedJob, SearchCriteria, JobSource } from './providers/types.js';
