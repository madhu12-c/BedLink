import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/session';
import { isTelegramConfigured } from '@/lib/telegram/api';
import { notifyCrew } from '@/lib/telegram/bot';

const CrewSchema = z.object({
  reservationId: z.string().uuid(),
  /** The dispatcher's screen found no other hospital after this hold fell through. */
  noHospitalLeft: z.boolean().optional()
});

/**
 * Called by the dispatcher's screen when one of its holds changes. Tells that dispatcher's
 * own Telegram chats (if linked); what to say is read from the database, not from the request.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser(['dispatcher', 'admin']);
  if (auth.response) return auth.response;

  const parsed = CrewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'reservationId must be a UUID' }, { status: 400 });
  }
  if (!isTelegramConfigured()) return NextResponse.json({ success: true, sent: 0 });

  try {
    const { reservationId, noHospitalLeft } = parsed.data;
    return NextResponse.json({ success: true, sent: await notifyCrew(auth.user.id, reservationId, noHospitalLeft) });
  } catch (err) {
    console.error('[telegram] crew update failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: 'Telegram crew update failed' }, { status: 500 });
  }
}
