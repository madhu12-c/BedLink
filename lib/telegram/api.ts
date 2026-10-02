import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Small client for the Telegram Bot API (https://core.telegram.org/bots/api).
 * The bot token comes from @BotFather and lives in TELEGRAM_BOT_TOKEN (server only).
 */

function botToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? token : null;
}

export function isTelegramConfigured(): boolean {
  return botToken() !== null;
}

/** The bot's @username (without @), used to build t.me links. */
export function botUsername(): string | null {
  const name = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return name ? name : null;
}

/**
 * Shared secret for calls into the bot routes. Telegram sends it back in the
 * X-Telegram-Bot-Api-Secret-Token header (set with setWebhook), so nobody else can post fake
 * updates. Taken from TELEGRAM_WEBHOOK_SECRET, else derived from the bot token;
 * scripts/telegram.mjs derives it the same way.
 */
export function webhookSecret(): string | null {
  const explicit = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  const token = botToken();
  return token ? createHash('sha256').update(`bedlink-webhook:${token}`).digest('hex').slice(0, 48) : null;
}

/** True when the header value matches the shared secret (constant-time compare). */
export function isValidSecret(value: string | null): boolean {
  const secret = webhookSecret();
  if (!secret || !value || value.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(secret));
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

async function callApi<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store'
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      console.warn(`[telegram] ${method} failed: ${json.description ?? res.status}`);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.warn(`[telegram] ${method} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Sends an HTML-formatted message, optionally with tap buttons under it. */
export function sendMessage(chatId: number, text: string, buttons?: InlineButton[][]) {
  return callApi<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
  });
}

/** Replaces a message's text (and removes its buttons). */
export function editMessage(chatId: number, messageId: number, text: string) {
  return callApi('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' });
}

/** Stops the spinner on a tapped button, with an optional short toast. */
export function answerCallback(callbackId: string, text?: string) {
  return callApi('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) });
}

/** Downloads a file the user sent (a voice note). Bots can fetch files up to 20 MB. */
export async function downloadFile(fileId: string): Promise<ArrayBuffer | null> {
  const token = botToken();
  const file = await callApi<{ file_path?: string }>('getFile', { file_id: fileId });
  if (!token || !file?.file_path) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store'
    });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Escapes text for a parse_mode=HTML message. */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
