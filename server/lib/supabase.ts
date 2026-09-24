import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase credentials only.
 *
 * These values are read from `process.env` at runtime inside the Node server, so
 * they are never part of the client bundle. Do NOT rename them with a `VITE_`
 * prefix: Vite statically inlines every `VITE_*` variable it can see into the
 * public JavaScript served to browsers, which would publish the key.
 * (Verified: a `VITE_` value referenced from src/ appears verbatim in dist/assets/*.js.)
 */
const url = process.env.SUPABASE_URL?.trim() ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function dbConfigured(): boolean {
  return Boolean(url && key);
}
