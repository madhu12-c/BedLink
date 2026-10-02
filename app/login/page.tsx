import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { getSupabaseEnv } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Sign in · BedLink'
};

const ERROR_MESSAGES: Record<string, string> = {
  no_role: 'Your account has no BedLink role yet. Ask the admin to set it up, or sign in with another account.'
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : null;
  const initialError = typeof params.error === 'string' ? ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
      <LoginForm next={next} initialError={initialError} demoMode={getSupabaseEnv() === null} />
    </main>
  );
}
