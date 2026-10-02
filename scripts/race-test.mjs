// Race test: 20 ambulances try to hold the same last bed at the same moment.
// Exactly one must win. Proves the hold is one atomic database step (hold_bed()).
//
//   npm run race-test            (ICU at Aditi Hospital)
//   npm run race-test -- <hospital-id> <bed-type> <ambulances>
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and the
// spec_features SQL installed. It briefly sets that bed count to 1 on the shared database,
// then cancels the winning hold and puts the count back. Screens that are open will see a
// short blip, so run it before or after a live demo, not during one.

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Use variables already set in the shell
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const [hospitalId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bedType = 'icu', countArg = '20'] = process.argv.slice(2);
const ambulances = Math.max(2, Math.min(100, Number(countArg) || 20));
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: bed, error: bedErr } = await db
  .from('bed_inventory')
  .select('available_beds, total_beds')
  .eq('hospital_id', hospitalId)
  .eq('bed_type', bedType)
  .single();
if (bedErr || !bed) {
  console.error(`No ${bedType} beds found for hospital ${hospitalId}: ${bedErr?.message ?? 'not found'}`);
  process.exit(1);
}
const { data: hospital } = await db.from('hospitals').select('name').eq('id', hospitalId).single();
const hospitalName = hospital?.name ?? hospitalId;
const original = bed.available_beds;

console.log(`\nRace test: ${ambulances} ambulances, 1 free ${bedType.toUpperCase()} bed at ${hospitalName}\n`);

// Leave exactly one bed free
await db.from('bed_inventory').update({ available_beds: 1 }).eq('hospital_id', hospitalId).eq('bed_type', bedType);

// One emergency request per ambulance (holds must point at a request)
const requests = Array.from({ length: ambulances }, (_, i) => ({
  id: randomUUID(),
  patient_latitude: 19.2158,
  patient_longitude: 72.8623,
  urgency: 'critical',
  required_bed_type: bedType,
  notes: `race-test ambulance ${i + 1}`,
  status: 'active'
}));
const { error: reqErr } = await db.from('emergency_requests').insert(requests);
if (reqErr) {
  console.error('Could not create test requests:', reqErr.message);
  await db.from('bed_inventory').update({ available_beds: original }).eq('hospital_id', hospitalId).eq('bed_type', bedType);
  process.exit(1);
}

// Everyone at once
const started = Date.now();
const results = await Promise.all(
  requests.map(async (req, i) => {
    const reservationId = randomUUID();
    const { data, error } = await db.rpc('hold_bed', {
      p_reservation_id: reservationId,
      p_request_id: req.id,
      p_hospital_id: hospitalId,
      p_bed_type: bedType,
      p_urgency: 'critical',
      p_eta_minutes: 8
    });
    return { ambulance: i + 1, reservationId, ok: !error && data?.success === true, error: error?.message ?? data?.error };
  })
);
const ms = Date.now() - started;

const winners = results.filter((r) => r.ok);
const missingFunction = results.some((r) => /could not find the function/i.test(r.error ?? ''));
for (const r of results) {
  console.log(`  Ambulance ${String(r.ambulance).padStart(2)}: ${r.ok ? 'GOT THE BED' : `refused (${r.error})`}`);
}

const { data: after } = await db
  .from('bed_inventory')
  .select('available_beds')
  .eq('hospital_id', hospitalId)
  .eq('bed_type', bedType)
  .single();

console.log(`\n${ambulances} holds in ${ms} ms → winners: ${winners.length}, beds left: ${after?.available_beds}`);
const passed = winners.length === 1 && after?.available_beds === 0;
console.log(passed ? 'PASS: only one ambulance got the last bed.' : 'FAIL: expected exactly one winner and 0 beds left.');
if (missingFunction) console.log('hold_bed() is not installed: run supabase/migrations/20261003000000_spec_features.sql first.');

// Clean up: free the winner's bed, close the test requests, restore the count
for (const w of winners) await db.rpc('cancel_hold', { p_reservation_id: w.reservationId });
await db.from('emergency_requests').update({ status: 'cancelled' }).in('id', requests.map((r) => r.id));
await db.from('bed_inventory').update({ available_beds: original }).eq('hospital_id', hospitalId).eq('bed_type', bedType);
console.log(`Cleaned up: ${hospitalName} ${bedType.toUpperCase()} back to ${original} free.\n`);

process.exit(passed ? 0 : 1);
