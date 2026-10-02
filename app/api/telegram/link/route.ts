import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/session';
import { botUsername, isTelegramConfigured } from '@/lib/telegram/api';
import { LinkRole, makeLinkCode } from '@/lib/telegram/link';

/**
 * The "Connect Telegram" link for the hospital screen. Nurses and coordinators get one for
 * their own hospital and role; an admin picks both (query: hospitalId, role).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser(['nurse', 'coordinator', 'admin']);
  if (auth.response) return auth.response;

  const username = botUsername();
  if (!isTelegramConfigured() || !username) {
    return NextResponse.json(
      { success: false, error: 'The Telegram bot is not set up on the server yet (TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME).' },
      { status: 503 }
    );
  }

  const { user } = auth;
  const isStaff = user.role === 'nurse' || user.role === 'coordinator';
  const params = req.nextUrl.searchParams;
  const hospitalId = isStaff ? user.hospitalId : params.get('hospitalId');
  const role: LinkRole = isStaff
    ? (user.role as LinkRole)
    : params.get('role') === 'coordinator'
      ? 'coordinator'
      : 'nurse';

  const code = hospitalId ? makeLinkCode(hospitalId, role) : null;
  if (!code) {
    return NextResponse.json({ success: false, error: 'No hospital to connect.' }, { status: 400 });
  }
  return NextResponse.json({ success: true, url: `https://t.me/${username}?start=${code}`, role });
}
