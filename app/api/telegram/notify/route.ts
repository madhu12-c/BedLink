import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/session';
import { isTelegramConfigured } from '@/lib/telegram/api';
import { notifyNewHold } from '@/lib/telegram/bot';

const NotifySchema = z.object({ reservationId: z.string().uuid() });

/** Called by the dispatcher's screen right after a hold is saved: tells the hospital on Telegram. */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser(['dispatcher', 'admin']);
  if (auth.response) return auth.response;

  const parsed = NotifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'reservationId must be a UUID' }, { status: 400 });
  }
  if (!isTelegramConfigured()) return NextResponse.json({ success: true, sent: 0 });

  try {
    return NextResponse.json({ success: true, sent: await notifyNewHold(parsed.data.reservationId) });
  } catch (err) {
    console.error('[telegram] notify failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: 'Telegram notify failed' }, { status: 500 });
  }
}
