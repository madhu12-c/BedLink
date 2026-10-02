import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { webhookSecret } from './api';

export type LinkRole = 'nurse' | 'coordinator';

/**
 * The /start code inside a "Connect Telegram" link: which hospital and role this chat is for,
 * signed so nobody can make one up. Format: role letter + hospital id as 32 hex characters +
 * a 16-character signature (49 characters; Telegram allows up to 64).
 */

function sign(payload: string): string | null {
  const secret = webhookSecret();
  return secret
    ? createHmac('sha256', `bedlink-link:${secret}`).update(payload).digest('base64url').slice(0, 16)
    : null;
}

export function makeLinkCode(hospitalId: string, role: LinkRole): string | null {
  const hex = hospitalId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  const payload = `${role === 'nurse' ? 'n' : 'c'}${hex}`;
  const signature = sign(payload);
  return signature ? payload + signature : null;
}

export function readLinkCode(code: string): { hospitalId: string; role: LinkRole } | null {
  const match = /^([nc])([0-9a-f]{32})([A-Za-z0-9_-]{16})$/.exec(code.trim());
  if (!match) return null;
  const expected = sign(match[1] + match[2]);
  if (!expected || !timingSafeEqual(Buffer.from(expected), Buffer.from(match[3]))) return null;
  const h = match[2];
  return {
    hospitalId: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`,
    role: match[1] === 'n' ? 'nurse' : 'coordinator'
  };
}
