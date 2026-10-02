import { NextRequest, NextResponse } from 'next/server';
import { isValidSecret } from '@/lib/telegram/api';
import { handleUpdate, TgUpdate } from '@/lib/telegram/bot';

// Voice notes go through Sarvam (speech-to-text + reading the numbers), which can take a while
export const maxDuration = 60;

/**
 * Telegram calls this for every message or button tap (set with setWebhook), and so does the
 * local poller (npm run telegram). Open without login: the shared secret header proves the
 * caller is Telegram / our poller.
 */
export async function POST(req: NextRequest) {
  if (!isValidSecret(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error('[telegram] update failed:', err instanceof Error ? err.message : err);
  }
  // Always 200, so Telegram doesn't keep re-sending an update that failed
  return NextResponse.json({ ok: true });
}
