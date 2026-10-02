import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client with the service role key: it skips row-level security.
 * Only for trusted server code that does its own checks (the Telegram bot).
 */
let adminClient: SupabaseClient | null | undefined;

export function getAdminSupabase(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  adminClient =
    url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return adminClient;
}
