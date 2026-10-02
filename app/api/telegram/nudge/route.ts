import { NextRequest, NextResponse } from 'next/server';
import { isTelegramConfigured, isValidSecret } from '@/lib/telegram/api';
import { nudgeStaleHospitals } from '@/lib/telegram/bot';

/**
 * Sends "are the counts still right?" reminders for counts 30+ minutes old. Call it about once
 * a minute: the local poller does; when deployed, any cron service can POST here with the
 * X-BedLink-Cron header set to the webhook secret.
 */
export async function POST(req: NextRequest) {
  if (!isValidSecret(req.headers.get('x-bedlink-cron'))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!isTelegramConfigured()) return NextResponse.json({ ok: true, sent: 0 });
  try {
    return NextResponse.json({ ok: true, sent: await nudgeStaleHospitals() });
  } catch (err) {
    console.error('[telegram] nudge failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
