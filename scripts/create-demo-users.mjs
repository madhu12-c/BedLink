// Creates (or updates) the BedLink login accounts listed in lib/auth/demo-users.json.
//
//   npm run seed:users
//
// Needs in .env.local (never commit these):
//   NEXT_PUBLIC_SUPABASE_URL     your project URL
//   SUPABASE_SERVICE_ROLE_KEY    Project Settings -> API keys -> service_role / secret key
//   DEMO_USER_PASSWORD           password every demo account gets (8+ characters)
//
// Each account gets its role and hospital in app_metadata (users cannot edit that),
// its display name in user_metadata, and a matching row in public.profiles.
// Safe to run again: existing accounts are updated, and their password is reset.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: fall back to variables already set in the shell.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_USER_PASSWORD;

const missing = [
  !url && 'NEXT_PUBLIC_SUPABASE_URL',
  !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  !password && 'DEMO_USER_PASSWORD'
].filter(Boolean);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}
if (password.length < 8) {
  console.error('DEMO_USER_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

const users = JSON.parse(readFileSync(new URL('../lib/auth/demo-users.json', import.meta.url), 'utf8'));

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function findUserIdsByEmail() {
  const ids = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    for (const u of data.users) if (u.email) ids.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) return ids;
  }
}

const existing = await findUserIdsByEmail();
let failures = 0;

for (const u of users) {
  const attributes = {
    password,
    email_confirm: true,
    app_metadata: { role: u.role, hospital_id: u.hospitalId },
    user_metadata: { name: u.name }
  };

  let id = existing.get(u.email.toLowerCase());
  let action;
  if (id) {
    const { error } = await supabase.auth.admin.updateUserById(id, attributes);
    if (error) {
      console.error(`✗ ${u.email}: ${error.message}`);
      failures++;
      continue;
    }
    action = 'updated';
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email: u.email, ...attributes });
    if (error || !data.user) {
      console.error(`✗ ${u.email}: ${error?.message ?? 'no user returned'}`);
      failures++;
      continue;
    }
    id = data.user.id;
    action = 'created';
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id, name: u.name, role: u.role, hospital_id: u.hospitalId }, { onConflict: 'id' });
  if (profileError) {
    console.error(`! ${u.email}: login ${action}, but profile row failed: ${profileError.message}`);
    failures++;
    continue;
  }

  console.log(`✓ ${action.padEnd(7)} ${u.email.padEnd(36)} ${u.role}${u.hospitalId ? `  (${u.name})` : ''}`);
}

console.log(
  failures
    ? `\nDone with ${failures} problem(s). Fix them and run again.`
    : `\nAll ${users.length} accounts ready. They all use the password in DEMO_USER_PASSWORD.`
);
process.exit(failures ? 1 : 0);
