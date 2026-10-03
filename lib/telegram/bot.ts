import 'server-only';
import { BedType } from '../types';
import { getAdminSupabase } from '../supabase/admin';
import {
  BED_COUNT_KEYTERMS,
  extractBedCounts,
  isVoiceConfigured,
  transcribeAudio
} from '../voice/sarvam';
import { answerCallback, downloadFile, editMessage, esc, sendMessage } from './api';
import { LinkRole, readLinkCode } from './link';
import { BED_LABELS, isYes, parseBedCounts } from './parse';

/**
 * BedLink on Telegram, so ward staff never have to open a web page:
 * - Nurse: send "ICU 3, O2 5" or a voice note (Hindi / Marathi / English) to update free beds.
 * - Every linked nurse gets a "still right?" reminder when the counts are 30+ minutes old.
 * - Coordinator: new ambulance requests arrive with Accept / Reject buttons (same 2-minute
 *   rule; the dispatcher's screen moves on to the next hospital on reject or timeout).
 * - Ambulance crew: hears which hospital is being asked, when it accepts (with a Maps link),
 *   and where BedLink goes next after a no, even with the phone's screen off.
 * A chat is linked by the signed link from the hospital screen (staff) or dispatch screen (crew).
 */

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
}

interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  voice?: { file_id: string; duration?: number };
  audio?: { file_id: string; duration?: number };
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  message?: { message_id: number; chat: { id: number }; text?: string };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

interface ChatLink {
  chat_id: number;
  hospital_id: string;
  role: LinkRole;
}

interface InventoryRow {
  bed_type: BedType;
  available_beds: number;
  total_beds: number;
  updated_at: string;
}

type BedCounts = Partial<Record<BedType, number>>;

const STALE_MINUTES = 30;
const MAX_VOICE_SECONDS = 30;
const BED_ORDER: BedType[] = ['icu', 'ventilator', 'oxygen', 'cardiac', 'burns', 'emergency', 'general'];
const EXAMPLE = '<code>ICU 3, O2 5, Vent 1</code>';

function db() {
  const client = getAdminSupabase();
  if (!client) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing: the Telegram bot needs it.');
  return client;
}

function displayName(user?: TgUser): string {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim().slice(0, 40);
  return name || 'Telegram user';
}

/** "an ICU bed", "a Cardiac bed" */
function aBed(label: string): string {
  return `${/^[AEIOU]/i.test(label) ? 'an' : 'a'} ${label} bed`;
}

function timeNow(): string {
  return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
}

// ── Database ──

/** The hospital roles this chat holds (one nurse and one coordinator link at most), nurse first. */
async function getLinks(chatId: number): Promise<ChatLink[]> {
  const { data } = await db().from('telegram_links').select('chat_id, hospital_id, role').eq('chat_id', chatId);
  return ((data ?? []) as ChatLink[]).sort((a, b) => Number(b.role === 'nurse') - Number(a.role === 'nurse'));
}

async function hospitalName(hospitalId: string): Promise<string> {
  const { data } = await db().from('hospitals').select('name').eq('id', hospitalId).maybeSingle();
  return typeof data?.name === 'string' ? data.name : 'your hospital';
}

async function getInventory(hospitalId: string): Promise<InventoryRow[]> {
  const { data } = await db()
    .from('bed_inventory')
    .select('bed_type, available_beds, total_beds, updated_at')
    .eq('hospital_id', hospitalId);
  return ((data ?? []) as InventoryRow[]).sort(
    (a, b) => BED_ORDER.indexOf(a.bed_type) - BED_ORDER.indexOf(b.bed_type)
  );
}

function countsText(rows: InventoryRow[]): string {
  return rows.map((r) => `${BED_LABELS[r.bed_type] ?? r.bed_type}: <b>${r.available_beds}</b> free of ${r.total_beds}`).join('\n');
}

/** Updates bed rows; retries without updated_by_name when that column isn't there yet. */
async function updateInventory(hospitalId: string, bedType: BedType | null, fields: Record<string, unknown>) {
  const run = (values: Record<string, unknown>) => {
    let query = db().from('bed_inventory').update(values).eq('hospital_id', hospitalId);
    if (bedType) query = query.eq('bed_type', bedType);
    return query;
  };
  const { error } = await run(fields);
  if (error && /updated_by_name/.test(error.message)) {
    const withoutName = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'updated_by_name'));
    await run(withoutName);
  } else if (error) {
    console.warn('[telegram] bed update failed:', error.message);
  }
}

/** Sets free-bed numbers (never above the total) and says what was saved. */
async function saveCounts(link: ChatLink, who: string, counts: BedCounts): Promise<string> {
  const rows = await getInventory(link.hospital_id);
  const now = new Date().toISOString();
  const saved: string[] = [];
  const unknown: string[] = [];

  for (const type of BED_ORDER) {
    const wanted = counts[type];
    if (wanted === undefined) continue;
    const row = rows.find((r) => r.bed_type === type);
    if (!row) {
      unknown.push(BED_LABELS[type]);
      continue;
    }
    const value = Math.max(0, Math.min(row.total_beds, wanted));
    await updateInventory(link.hospital_id, type, { available_beds: value, updated_at: now, updated_by_name: `${who} (Telegram)` });
    saved.push(`${BED_LABELS[type]}: <b>${value}</b> free${value !== wanted ? ` (only ${row.total_beds} beds in total)` : ''}`);
  }

  const lines: string[] = [];
  if (saved.length) lines.push(`✅ Saved at ${timeNow()}`, ...saved, '', 'Ambulances see this now.');
  if (unknown.length) lines.push(`No ${unknown.join(', ')} beds are set up for this hospital, so I skipped them.`);
  return lines.join('\n') || `I couldn't find bed numbers in that. Try ${EXAMPLE}`;
}

/** "Nothing changed": refresh the time on every count so dispatch sees fresh data. */
async function confirmCounts(link: ChatLink, who: string): Promise<string> {
  await updateInventory(link.hospital_id, null, { updated_at: new Date().toISOString(), updated_by_name: `${who} (Telegram)` });
  return `✅ Confirmed at ${timeNow()}: all counts still right.\n\n${countsText(await getInventory(link.hospital_id))}`;
}

/** Gives a held bed back (+1) after a reject. */
async function giveBedBack(hospitalId: string, bedType: BedType, who: string) {
  const { error } = await db().rpc('adjust_bed_count', {
    p_hospital_id: hospitalId,
    p_bed_type: bedType,
    p_delta: 1,
    p_actor_name: `${who} (Telegram)`
  });
  if (!error) return;
  // Database function not installed yet: read and write the number
  const row = (await getInventory(hospitalId)).find((r) => r.bed_type === bedType);
  if (row) {
    await updateInventory(hospitalId, bedType, {
      available_beds: Math.min(row.total_beds, row.available_beds + 1),
      updated_at: new Date().toISOString()
    });
  }
}

/**
 * Accept / reject a pending hold. Only succeeds while it is still pending and inside its
 * 2 minutes (one conditional update, so a late tap or a double tap can't win).
 */
async function respondToHold(link: ChatLink, who: string, reservationId: string, action: 'accept' | 'reject'): Promise<string> {
  if (link.role !== 'coordinator') return 'Only the hospital coordinator can accept or reject.';
  const supabase = db();
  const { data: hold } = await supabase
    .from('reservations')
    .select('id, hospital_id, bed_type, status, expires_at')
    .eq('id', reservationId)
    .maybeSingle();
  if (!hold || hold.hospital_id !== link.hospital_id) return 'This request is not for your hospital.';
  if (hold.status !== 'pending') return `Already answered (${hold.status}).`;

  const now = new Date().toISOString();
  const { data: changed } = await supabase
    .from('reservations')
    .update({
      status: action === 'accept' ? 'accepted' : 'rejected',
      responded_at: now,
      ...(action === 'reject' ? { rejection_reason: `Rejected on Telegram by ${who}` } : {})
    })
    .eq('id', reservationId)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .select('id');
  if (!changed?.length) return 'Too late: the 2 minutes are over, so the ambulance was sent to the next hospital.';

  const bed = BED_LABELS[hold.bed_type as BedType] ?? hold.bed_type;
  if (action === 'reject') await giveBedBack(hold.hospital_id, hold.bed_type as BedType, who);
  await supabase.from('reservation_events').insert({
    reservation_id: reservationId,
    event_type: action === 'accept' ? 'reservation_accepted' : 'reservation_rejected',
    metadata: { via: 'telegram', by: who }
  });
  return action === 'accept'
    ? `✅ Accepted by ${esc(who)} at ${timeNow()}. The ambulance is told. Get the ${bed} bed ready.`
    : `❌ Rejected by ${esc(who)}. BedLink is sending the ambulance to the next hospital.`;
}

// ── Messages from staff ──

const HELP = [
  '<b>BedLink bot</b>',
  '',
  `• Send free-bed numbers any time, e.g. ${EXAMPLE}`,
  '• Or send a voice note: "ICU mein do bed khaali hain"',
  '• Reply <b>1</b> if nothing changed',
  '• /status shows what this chat is connected as, and the bed counts',
  '• /stop disconnects this chat',
  '',
  'Coordinators also get ambulance requests here with Accept / Reject buttons.',
  'Ambulance crews get updates on the beds they hold (connect from the dispatch screen).',
  'Roles add up: open another Connect link and this chat keeps the roles it has.'
].join('\n');

const CREW_CONNECTED = [
  '✅ Connected as <b>ambulance crew</b>.',
  '',
  'For every bed you hold on BedLink I\'ll tell you here:',
  '🚑 which hospital is being asked',
  '✅ when it accepts, with a Google Maps link',
  '❌ when it says no or doesn\'t answer, and which hospital BedLink asks next',
  '',
  'Keep this chat unmuted. /stop disconnects.'
].join('\n');

const CREW_IDLE =
  'This chat gets ambulance updates. Hold a bed on the BedLink dispatch screen and I\'ll tell you here what the hospital says. /stop disconnects.';

async function isCrewChat(chatId: number): Promise<boolean> {
  const { data } = await db().from('telegram_crew_links').select('chat_id').eq('chat_id', chatId).maybeSingle();
  return Boolean(data);
}

/** "This chat is: • Nurse at … • Ambulance crew", or '' when it has no roles. */
async function rolesText(chatId: number, links: ChatLink[]): Promise<string> {
  const lines: string[] = [];
  for (const link of links) {
    lines.push(`• ${link.role === 'nurse' ? 'Nurse' : 'Coordinator'} at <b>${esc(await hospitalName(link.hospital_id))}</b>`);
  }
  if (await isCrewChat(chatId)) lines.push('• Ambulance crew (updates on your holds)');
  return lines.length ? `<b>This chat is</b>\n${lines.join('\n')}` : '';
}

/** After a new link: the role's intro, plus every role the chat now has when there is more than one. */
async function sendConnected(chatId: number, intro: string) {
  const links = await getLinks(chatId);
  const roles = links.length + Number(await isCrewChat(chatId));
  await sendMessage(chatId, roles > 1 ? `${intro}\n\n${await rolesText(chatId, links)}` : intro);
}

/** /stop: this chat gets nothing more, as staff or as crew. */
async function unlinkChat(chatId: number) {
  const supabase = db();
  await supabase.from('telegram_links').delete().eq('chat_id', chatId);
  await supabase.from('telegram_crew_links').delete().eq('chat_id', chatId);
  await sendMessage(chatId, 'Disconnected. You will get no more BedLink messages here.');
}

async function linkCrew(chatId: number, who: string, userId: string) {
  const { error } = await db().from('telegram_crew_links').upsert(
    { chat_id: chatId, user_id: userId, display_name: who, linked_at: new Date().toISOString() },
    { onConflict: 'chat_id' }
  );
  if (error) {
    console.warn('[telegram] crew link failed:', error.message);
    await sendMessage(chatId, 'Could not connect right now (has the Telegram crew SQL been run on Supabase?). Please try again.');
    return;
  }
  await sendConnected(chatId, CREW_CONNECTED);
}

/** Adds (or moves) this chat's nurse / coordinator role; other roles stay. */
async function linkStaff(chatId: number, who: string, hospitalId: string, role: LinkRole) {
  const row = { chat_id: chatId, hospital_id: hospitalId, role, display_name: who, linked_at: new Date().toISOString() };
  let { error } = await db().from('telegram_links').upsert(row, { onConflict: 'chat_id,role' });
  if (error?.code === '42P10') {
    // The roles-add-up SQL isn't run yet: one role per chat, so this one replaces the other
    ({ error } = await db().from('telegram_links').upsert(row, { onConflict: 'chat_id' }));
  }
  return error;
}

async function handleStart(chatId: number, who: string, code: string) {
  if (!code) {
    await sendMessage(chatId, 'Welcome to BedLink. To connect, open BedLink → hospital or dispatch screen → <b>Connect Telegram</b> and tap the link there.');
    return;
  }
  const target = readLinkCode(code);
  if (!target) {
    await sendMessage(chatId, 'This connect link is not valid. Get a new one from BedLink.');
    return;
  }
  if (target.role === 'crew') {
    await linkCrew(chatId, who, target.userId);
    return;
  }
  const error = await linkStaff(chatId, who, target.hospitalId, target.role);
  if (error) {
    console.warn('[telegram] link failed:', error.message);
    await sendMessage(chatId, 'Could not connect right now (has the Telegram SQL been run on Supabase?). Please try again.');
    return;
  }
  const name = esc(await hospitalName(target.hospitalId));
  const rows = await getInventory(target.hospitalId);
  const intro =
    target.role === 'coordinator'
      ? `✅ Connected as <b>coordinator</b> of <b>${name}</b>.\n\nAmbulance requests will arrive here with Accept / Reject buttons. You have 2 minutes to answer each one.`
      : `✅ Connected as <b>nurse</b> at <b>${name}</b>.\n\nSend free-bed numbers any time (${EXAMPLE}) or a voice note in Hindi, Marathi or English. I'll remind you when the counts are ${STALE_MINUTES}+ minutes old.`;
  await sendConnected(chatId, `${intro}\n\n<b>Right now</b>\n${countsText(rows)}`);
}

async function handleVoice(link: ChatLink, who: string, chatId: number, fileId: string, seconds: number) {
  if (!isVoiceConfigured()) {
    await sendMessage(chatId, `Voice notes need Sarvam set up on the server. Please type the numbers, e.g. ${EXAMPLE}`);
    return;
  }
  if (seconds > MAX_VOICE_SECONDS) {
    await sendMessage(chatId, `Please keep voice notes under ${MAX_VOICE_SECONDS} seconds.`);
    return;
  }
  const audio = await downloadFile(fileId);
  if (!audio) {
    await sendMessage(chatId, 'Could not download that voice note. Please try again.');
    return;
  }
  try {
    const { transcript, languageCode } = await transcribeAudio(
      new Blob([audio], { type: 'audio/ogg' }),
      BED_COUNT_KEYTERMS,
      'voice.ogg'
    );
    if (!transcript) {
      await sendMessage(chatId, `I couldn't hear anything. Try again, or type ${EXAMPLE}`);
      return;
    }
    const counts = await extractBedCounts(transcript, languageCode);
    const heard = `🎙 Heard: "${esc(transcript)}"`;
    if (!Object.keys(counts).length) {
      await sendMessage(chatId, `${heard}\n\nBut no bed numbers. Try "ICU mein do bed khaali hain" or type ${EXAMPLE}`);
      return;
    }
    await sendMessage(chatId, `${heard}\n\n${await saveCounts(link, who, counts)}`);
  } catch (err) {
    console.warn('[telegram] voice failed:', err instanceof Error ? err.message : err);
    await sendMessage(chatId, `Sorry, the voice service didn't answer. Please type the numbers, e.g. ${EXAMPLE}`);
  }
}

async function handleMessage(message: TgMessage) {
  const chatId = message.chat.id;
  if (message.chat.type !== 'private') {
    await sendMessage(chatId, 'Please message me directly, not in a group.');
    return;
  }
  const who = displayName(message.from);
  const text = message.text?.trim() ?? '';

  if (text.startsWith('/start')) {
    await handleStart(chatId, who, text.slice('/start'.length).trim());
    return;
  }
  if (text === '/help') {
    await sendMessage(chatId, HELP);
    return;
  }

  const links = await getLinks(chatId);
  if (text === '/stop') {
    await unlinkChat(chatId);
    return;
  }
  if (text === '/status') {
    const parts = [await rolesText(chatId, links)];
    for (const hospitalId of new Set(links.map((l) => l.hospital_id))) {
      parts.push(`<b>${esc(await hospitalName(hospitalId))}</b>\n${countsText(await getInventory(hospitalId))}`);
    }
    await sendMessage(chatId, parts.filter(Boolean).join('\n\n') || 'This chat is not connected yet.');
    return;
  }
  // Bed updates go to the nurse's hospital (else the coordinator's)
  const link = links[0];
  if (!link) {
    await sendMessage(
      chatId,
      (await isCrewChat(chatId))
        ? CREW_IDLE
        : 'This chat is not connected yet. Open BedLink → hospital or dispatch screen → <b>Connect Telegram</b>.'
    );
    return;
  }

  const voice = message.voice ?? message.audio;
  if (voice) {
    await handleVoice(link, who, chatId, voice.file_id, voice.duration ?? 0);
    return;
  }
  if (!text) {
    await sendMessage(chatId, `Send bed numbers like ${EXAMPLE}, or a voice note.`);
    return;
  }
  if (isYes(text)) {
    await sendMessage(chatId, await confirmCounts(link, who));
    return;
  }

  let counts: BedCounts = parseBedCounts(text);
  if (!Object.keys(counts).length && isVoiceConfigured()) {
    // Not the short format: let Sarvam read it ("ICU mein 2 khaali hai")
    counts = await extractBedCounts(text, null).catch(() => ({}));
  }
  if (!Object.keys(counts).length) {
    await sendMessage(chatId, `I couldn't find bed numbers in that. Try ${EXAMPLE}\nSend /help for more.`);
    return;
  }
  await sendMessage(chatId, await saveCounts(link, who, counts));
}

async function handleButton(query: TgCallbackQuery) {
  const chatId = query.message?.chat.id ?? query.from.id;
  const who = displayName(query.from);
  const [action, id] = (query.data ?? '').split(':');
  const links = await getLinks(chatId);
  if (!links.length || !id) {
    await answerCallback(query.id, 'This chat is not connected to a hospital.');
    return;
  }

  let result: string;
  if (action === 'ok') {
    const link = links.find((l) => l.hospital_id === id);
    result = link ? await confirmCounts(link, who) : 'Not your hospital.';
  } else if (action === 'acc' || action === 'rej') {
    const link = links.find((l) => l.role === 'coordinator');
    result = link
      ? await respondToHold(link, who, id, action === 'acc' ? 'accept' : 'reject')
      : 'Only the hospital coordinator can accept or reject.';
  } else {
    await answerCallback(query.id);
    return;
  }

  await answerCallback(query.id, result.replace(/<[^>]+>/g, '').split('\n')[0].slice(0, 190));
  if (query.message) {
    // Replace the buttons with the outcome so nobody taps them again
    const original = query.message.text ? `${esc(query.message.text)}\n\n` : '';
    await editMessage(chatId, query.message.message_id, `${original}<b>${result.split('\n')[0]}</b>`);
    if (action === 'ok') await sendMessage(chatId, result);
  }
}

/** Entry point for every Telegram update (webhook or the local poller). */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    await handleButton(update.callback_query);
  } else if (update.message) {
    await handleMessage(update.message);
  }
}

// ── Messages BedLink starts ──

/** A new hold: coordinators get Accept / Reject buttons, nurses a heads-up. Returns chats told. */
export async function notifyNewHold(reservationId: string): Promise<number> {
  const supabase = db();
  const { data: hold } = await supabase.from('reservations').select('*').eq('id', reservationId).maybeSingle();
  if (!hold || hold.status !== 'pending') return 0;
  const { data: links } = await supabase
    .from('telegram_links')
    .select('chat_id, role')
    .eq('hospital_id', hold.hospital_id);
  if (!links?.length) return 0;

  const bed = BED_LABELS[hold.bed_type as BedType] ?? hold.bed_type;
  const minutesLeft = Math.max(1, Math.ceil((new Date(hold.expires_at).getTime() - Date.now()) / 60_000));
  const details = [
    `🚑 <b>Ambulance needs ${aBed(bed)}</b>`,
    hold.patient_urgency ? `Patient: ${esc(String(hold.patient_urgency))}` : null,
    hold.eta_minutes ? `Arriving in about ${hold.eta_minutes} min` : null
  ]
    .filter(Boolean)
    .join('\n');

  // One message per chat: a chat that is both nurse and coordinator here gets the buttons
  const byChat = new Map<number, LinkRole>();
  for (const link of links as { chat_id: number; role: LinkRole }[]) {
    if (byChat.get(link.chat_id) !== 'coordinator') byChat.set(link.chat_id, link.role);
  }
  for (const [chatId, role] of byChat) {
    if (role === 'coordinator') {
      await sendMessage(
        chatId,
        `${details}\n\nOne bed is held for this patient. Answer within ${minutesLeft} min, or the ambulance goes to the next hospital.`,
        [[
          { text: '✅ Accept', callback_data: `acc:${hold.id}` },
          { text: '❌ Reject', callback_data: `rej:${hold.id}` }
        ]]
      );
    } else {
      await sendMessage(chatId, `${details}\n\nThe coordinator is deciding. Get the bed ready in case it is accepted.`);
    }
  }
  return byChat.size;
}

/** Reminds nurses whose counts are 30+ minutes old (at most once per 30 minutes each). */
export async function nudgeStaleHospitals(): Promise<number> {
  const supabase = db();
  const { data: links } = await supabase
    .from('telegram_links')
    .select('chat_id, hospital_id, last_nudged_at')
    .eq('role', 'nurse');
  const cutoff = Date.now() - STALE_MINUTES * 60_000;
  let sent = 0;

  for (const link of (links ?? []) as { chat_id: number; hospital_id: string; last_nudged_at: string | null }[]) {
    if (link.last_nudged_at && new Date(link.last_nudged_at).getTime() > cutoff) continue;
    const rows = await getInventory(link.hospital_id);
    if (!rows.length) continue;
    const oldest = Math.min(...rows.map((r) => new Date(r.updated_at).getTime()));
    if (oldest > cutoff) continue;

    const minutesOld = Math.round((Date.now() - oldest) / 60_000);
    const name = esc(await hospitalName(link.hospital_id));
    await sendMessage(
      link.chat_id,
      `⏰ Bed counts at <b>${name}</b> are ${minutesOld} min old. Still right?\n\n${countsText(rows)}\n\nTap ✅ if nothing changed, or send the new numbers (${EXAMPLE}).`,
      [[{ text: '✅ All still correct', callback_data: `ok:${link.hospital_id}` }]]
    );
    await supabase
      .from('telegram_links')
      .update({ last_nudged_at: new Date().toISOString() })
      .eq('chat_id', link.chat_id)
      .eq('role', 'nurse');
    sent++;
  }
  return sent;
}

// ── Updates for the ambulance crew ──

interface HoldRow {
  id: string;
  request_id: string;
  hospital_id: string;
  bed_type: BedType;
  status: string;
  eta_minutes: number | null;
  rejection_reason: string | null;
  requested_at: string;
  expires_at: string;
}

/** The steps the crew hears about. A no / timeout is told with the next hospital asked, so the order is always right. */
type CrewNotice = 'pending' | 'accepted' | 'none_left';

const HOLD_FIELDS = 'id, request_id, hospital_id, bed_type, status, eta_minutes, rejection_reason, requested_at, expires_at';

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** Holding a bed for this patient right now: accepted, or asked and still inside its 2 minutes. */
function isOpen(hold: HoldRow): boolean {
  return hold.status === 'accepted' || (hold.status === 'pending' && new Date(hold.expires_at).getTime() > Date.now());
}

/** Why a hold fell through, e.g. "❌ Aditi Hospital said no." (null if it didn't). */
async function failureLine(hold: HoldRow): Promise<string | null> {
  const name = `<b>${esc(await hospitalName(hold.hospital_id))}</b>`;
  if (hold.status === 'rejected') {
    const reason = hold.rejection_reason?.trim();
    // Telegram rejects store "Rejected on Telegram by …": not a reason worth repeating
    const shown = reason && !/^Rejected on Telegram/i.test(reason) ? `: <i>${esc(reason)}</i>` : '';
    return `❌ ${name} said no${shown}.`;
  }
  if (hold.status === 'expired' || (hold.status === 'pending' && !isOpen(hold))) {
    return `⏱ ${name} didn't answer in 2 minutes.`;
  }
  if (hold.status === 'bed_lost') return `⚠️ ${name} no longer has the bed.`;
  return null;
}

async function crewMessage(kind: CrewNotice, hold: HoldRow): Promise<string | null> {
  const bed = BED_LABELS[hold.bed_type] ?? hold.bed_type;
  const { data: tries } = await db()
    .from('reservations')
    .select(HOLD_FIELDS)
    .eq('request_id', hold.request_id)
    .order('requested_at', { ascending: true });
  // Every hospital asked for this patient, in order (shadow pre-holds were never asked)
  const asked = ((tries ?? []) as HoldRow[]).filter((r) => r.status !== 'shadow' && r.status !== 'auto_released');
  const index = asked.findIndex((r) => r.id === hold.id);

  if (kind === 'none_left') {
    if (asked.some(isOpen) || isOpen(hold)) return null;
    const why = await failureLine(hold);
    return [why, `⚠️ No other hospital has a free ${bed} bed right now. Pick one on the BedLink screen, or call 108.`]
      .filter(Boolean)
      .join('\n\n');
  }

  const { data: place } = await db()
    .from('hospitals')
    .select('name, phone, latitude, longitude')
    .eq('id', hold.hospital_id)
    .maybeSingle();
  const name = `<b>${esc(typeof place?.name === 'string' ? place.name : 'The hospital')}</b>`;
  const drive = hold.eta_minutes ? `Drive about ${hold.eta_minutes} min.` : null;

  if (kind === 'pending') {
    const previous = index > 0 ? asked[index - 1] : null;
    return [
      previous ? await failureLine(previous) : null,
      `🚑 Asking ${name} for ${aBed(bed)}${index > 0 ? ` (${ordinal(index + 1)} hospital)` : ''}.`,
      ['The bed is held while they decide (2 min).', drive].filter(Boolean).join(' ')
    ]
      .filter(Boolean)
      .join('\n');
  }

  const phone = typeof place?.phone === 'string' && place.phone.trim() ? place.phone.trim() : null;
  const maps =
    place?.latitude != null && place?.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${Number(place.latitude)},${Number(place.longitude)}&travelmode=driving`
      : null;
  return [
    `✅ ${name} accepted. Your ${bed} bed is held.`,
    [drive, phone ? `Call ${esc(phone)}` : null].filter(Boolean).join(' · ') || null,
    maps ? `<a href="${esc(maps)}">🗺 Open in Google Maps</a>` : null
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Tells the dispatcher's linked Telegram chats what happened to one of their holds: which
 * hospital is being asked (and why the one before fell through), that it accepted, or that
 * no hospital is left. The step is read from the database, and each one is sent once per chat
 * even if several screens report it. Returns the number of chats told.
 */
export async function notifyCrew(userId: string, reservationId: string, noHospitalLeft = false): Promise<number> {
  const supabase = db();
  const { data: chats } = await supabase.from('telegram_crew_links').select('chat_id').eq('user_id', userId);
  if (!chats?.length) return 0;
  const { data } = await supabase.from('reservations').select(HOLD_FIELDS).eq('id', reservationId).maybeSingle();
  const hold = data as HoldRow | null;
  if (!hold) return 0;

  const kind: CrewNotice | null = noHospitalLeft
    ? 'none_left'
    : hold.status === 'pending' || hold.status === 'accepted'
      ? hold.status
      : null;
  if (!kind) return 0;
  const text = await crewMessage(kind, hold);
  if (!text) return 0;

  // Claim the step first: only chats that weren't told yet come back
  const { data: claimed, error } = await supabase
    .from('telegram_notices')
    .upsert(
      (chats as { chat_id: number }[]).map((chat) => ({ reservation_id: hold.id, chat_id: chat.chat_id, kind })),
      { onConflict: 'reservation_id,chat_id,kind', ignoreDuplicates: true }
    )
    .select('chat_id');
  if (error) {
    console.warn('[telegram] crew update not sent:', error.message);
    return 0;
  }
  for (const { chat_id } of (claimed ?? []) as { chat_id: number }[]) await sendMessage(chat_id, text);
  return claimed?.length ?? 0;
}
