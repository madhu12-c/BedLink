import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/session';
import { botUsername, isTelegramConfigured } from '@/lib/telegram/api';
import { LinkRole, makeCrewLinkCode, makeLinkCode } from '@/lib/telegram/link';

/**
 * The "Connect Telegram" link. Nurses and coordinators get one for their own hospital and
 * role; dispatchers get one for their own account (crew updates); an admin picks
 * (query: role = nurse | coordinator | crew, and hospitalId for staff roles).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser(['nurse', 'coordinator', 'dispatcher', 'admin']);
  if (auth.response) return auth.response;

  const username = botUsername();
  if (!isTelegramConfigured() || !username) {
    return NextResponse.json(
      { success: false, error: 'The Telegram bot is not set up on the server yet (TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME).' },
      { status: 503 }
    );
  }

  const { user } = auth;
  const params = req.nextUrl.searchParams;
  const link = (code: string | null, role: LinkRole | 'crew', missing: string) =>
    code
      ? NextResponse.json({ success: true, url: `https://t.me/${username}?start=${code}`, code, role })
      : NextResponse.json({ success: false, error: missing }, { status: 400 });

  if (user.role === 'dispatcher' || (user.role === 'admin' && params.get('role') === 'crew')) {
    return link(makeCrewLinkCode(user.id), 'crew', 'This account cannot be connected (sign in with a BedLink account).');
  }

  const isStaff = user.role === 'nurse' || user.role === 'coordinator';
  const hospitalId = isStaff ? user.hospitalId : params.get('hospitalId');
  const role: LinkRole = isStaff
    ? (user.role as LinkRole)
    : params.get('role') === 'coordinator'
      ? 'coordinator'
      : 'nurse';
  return link(hospitalId ? makeLinkCode(hospitalId, role) : null, role, 'No hospital to connect.');
}
