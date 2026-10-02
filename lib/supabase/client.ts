import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
    key &&
    !url.includes('your-project-id') &&
    url.startsWith('https://') &&
    key.length > 20
  );
}

export function createClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, key);
}

export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!isSupabaseConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient();
  }
  return cachedClient;
}
