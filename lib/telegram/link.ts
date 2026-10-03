import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { webhookSecret } from './api';

export type LinkRole = 'nurse' | 'coordinator';

/** What a /start code connects: hospital staff to their hospital, or a crew phone to its dispatcher account. */
export type LinkTarget = { role: LinkRole; hospitalId: string } | { role: 'crew'; userId: string };

/**
 * The /start code inside a "Connect Telegram" link: who this chat is for, signed so nobody
 * can make one up. Format: a letter (n nurse, c coordinator, d dispatcher / crew) + the
 * hospital or user id as 32 hex characters + a 16-character signature (49 characters;
 * Telegram allows up to 64).
 */

function sign(payload: string): string | null {
  const secret = webhookSecret();
  return secret
    ? createHmac('sha256', `bedlink-link:${secret}`).update(payload).digest('base64url').slice(0, 16)
    : null;
}

function makeCode(letter: string, id: string): string | null {
  const hex = id.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  const signature = sign(letter + hex);
  return signature ? letter + hex + signature : null;
}

export function makeLinkCode(hospitalId: string, role: LinkRole): string | null {
  return makeCode(role === 'nurse' ? 'n' : 'c', hospitalId);
}

/** For the dispatch screen: this chat gets the updates on the signed-in dispatcher's holds. */
export function makeCrewLinkCode(userId: string): string | null {
  return makeCode('d', userId);
}

export function readLinkCode(code: string): LinkTarget | null {
  const match = /^([ncd])([0-9a-f]{32})([A-Za-z0-9_-]{16})$/.exec(code.trim());
  if (!match) return null;
  const expected = sign(match[1] + match[2]);
  if (!expected || !timingSafeEqual(Buffer.from(expected), Buffer.from(match[3]))) return null;
  const h = match[2];
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  if (match[1] === 'd') return { role: 'crew', userId: id };
  return { role: match[1] === 'n' ? 'nurse' : 'coordinator', hospitalId: id };
}
