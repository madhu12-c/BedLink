import 'server-only';
import { z } from 'zod';
import { VoiceErrorCode, VoiceIntakeFields, VoiceIntakeFieldsSchema } from './intake';
import { VoiceLanguageCode } from './languages';

/**
 * Server-only client for Sarvam AI (https://docs.sarvam.ai).
 * The API key is read from SARVAM_API_KEY and never sent to the browser.
 */

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const STT_MODEL = process.env.SARVAM_STT_MODEL || 'saaras:v4';
const TTS_MODEL = process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
// The voice-agent variant answers in ~0.2 s; plain sarvam-105b spends its whole token
// budget reasoning and often returns no answer at all, which is too slow for voice.
const CHAT_MODEL = process.env.SARVAM_CHAT_MODEL || 'sarvam-105b-conversations';
const TRANSLATE_MODEL = process.env.SARVAM_TRANSLATE_MODEL || 'sarvam-translate:v1';
const TTS_SPEAKER = process.env.SARVAM_TTS_SPEAKER;

// Bias speech recognition toward words dispatchers actually say.
export const INTAKE_KEYTERMS = [
  'ICU',
  'ventilator',
  'oxygen',
  'cardiac',
  'burns',
  'trauma',
  'stroke',
  'STEMI',
  'critical',
  'urgent',
  'emergency',
  'general ward'
];

export class VoiceServiceError extends Error {
  constructor(
    public readonly code: VoiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'VoiceServiceError';
  }
}

function getApiKey(): string | null {
  const key = process.env.SARVAM_API_KEY?.trim();
  return key ? key : null;
}

export function isVoiceConfigured(): boolean {
  return getApiKey() !== null;
}

interface SarvamRequest {
  method: 'POST';
  body: BodyInit;
  headers?: Record<string, string>;
}

async function sarvamFetch(path: string, init: SarvamRequest, timeoutMs: number): Promise<Response> {
  const key = getApiKey();
  if (!key) {
    throw new VoiceServiceError('NOT_CONFIGURED', 'Voice is not set up: SARVAM_API_KEY is missing.');
  }

  let res: Response;
  try {
    res = await fetch(`${SARVAM_BASE_URL}${path}`, {
      method: init.method,
      body: init.body,
      headers: { ...init.headers, 'api-subscription-key': key },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store'
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new VoiceServiceError('TIMEOUT', 'Sarvam took too long to respond.');
    }
    throw new VoiceServiceError('UPSTREAM', 'Could not reach Sarvam.');
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn(`[voice] Sarvam ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
    throw new VoiceServiceError('UPSTREAM', `Sarvam returned an error (${res.status}).`);
  }
  return res;
}

// ── Speech to text (Saaras) ──

const SttResponseSchema = z.object({
  transcript: z.string(),
  language_code: z.string().nullish()
});

// Short yes / no answers. Without these hints, one-word Marathi answers such as
// "नको" or "होय" tend to come back as English look-alikes ("NCO", "Hoy").
export const ANSWER_KEYTERMS = [
  'हाँ',
  'हां',
  'नहीं',
  'होय',
  'हो',
  'नको',
  'नाही',
  'ठीक है',
  'ठीक आहे',
  'होल्ड',
  'पाठवा',
  'yes',
  'no',
  'hold',
  'cancel'
];

export async function transcribeAudio(
  audio: Blob,
  keyterms: readonly string[]
): Promise<{ transcript: string; languageCode: string | null }> {
  const form = new FormData();
  form.append('file', audio, 'speech.wav');
  form.append('model', STT_MODEL);
  form.append('mode', 'transcribe');
  form.append('keyterms', JSON.stringify(keyterms));

  const res = await sarvamFetch('/speech-to-text', { method: 'POST', body: form }, 30_000);
  const parsed = SttResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new VoiceServiceError('UPSTREAM', 'Unexpected speech-to-text response.');
  }
  return {
    transcript: parsed.data.transcript.trim(),
    languageCode: parsed.data.language_code ?? null
  };
}

// ── Chat model (Sarvam-105B Conversations): field extraction ──

const ChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() })
      })
    )
    .min(1)
});

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

async function chatJsonCompletion(
  messages: ChatMessage[],
  options: { maxTokens: number; timeoutMs: number }
): Promise<string> {
  const res = await sarvamFetch(
    '/v1/chat/completions',
    {
      method: 'POST',
      // The chat endpoint accepts the key as a bearer token as well as the usual header.
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getApiKey() ?? ''}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        temperature: 0,
        max_tokens: options.maxTokens,
        response_format: { type: 'json_object' }
      })
    },
    options.timeoutMs
  );
  const parsed = ChatResponseSchema.safeParse(await res.json());
  const content = parsed.success ? parsed.data.choices[0].message.content : null;
  if (!content) {
    throw new VoiceServiceError('UPSTREAM', 'Empty response from the Sarvam chat model.');
  }
  // Some reasoning models prefix their answer with a <think> block.
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

const INTAKE_SYSTEM_PROMPT = `You extract emergency bed requirements from an ambulance crew's spoken request for BedLink, a hospital bed finder in India. The speech may be in any Indian language, or mixed with English.

Return ONLY a JSON object with exactly these keys:
- "bedType": one of "icu", "ventilator", "oxygen", "emergency", "general", or null if not mentioned
- "requiresVentilator": true if a ventilator or breathing machine is needed, false if explicitly not needed, null if not mentioned
- "specialty": one of "cardiac", "burns", "trauma", "neuro", "pediatric", "none", or null if not mentioned
- "urgency": one of "critical", "urgent", "normal", or null if not mentioned
- "notes": a short English clinical note (at most 25 words) with symptoms and vitals only, or null

Rules:
- Never put patient names, ages tied to a name, phone numbers or addresses in "notes".
- Use null when the speech does not say something. Do not invent values.
- Only set "bedType" when a bed type is actually named. A specialty such as a burns unit or cardiac care is not a bed type.
- Only set "requiresVentilator" when a ventilator or breathing support is mentioned.
- Heart attack, chest pain or STEMI means "cardiac". Accident, fall or fracture means "trauma". Stroke, seizure or head injury means "neuro". A child or infant means "pediatric". Burns or fire injury means "burns".
- Unconscious, not breathing or heavy bleeding means "critical".`;

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new VoiceServiceError('UPSTREAM', 'The AI reply did not contain JSON.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function extractIntakeFields(
  transcript: string,
  languageCode: string | null
): Promise<VoiceIntakeFields> {
  const content = await chatJsonCompletion(
    [
      { role: 'system', content: INTAKE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Detected language: ${languageCode ?? 'unknown'}\nTranscript: """${transcript}"""`
      }
    ],
    { maxTokens: 400, timeoutMs: 10_000 }
  );

  let raw: unknown;
  try {
    raw = extractJsonObject(content);
  } catch (err) {
    if (err instanceof VoiceServiceError) throw err;
    throw new VoiceServiceError('UPSTREAM', 'The AI reply was not valid JSON.');
  }

  const parsed = VoiceIntakeFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VoiceServiceError('UPSTREAM', 'The AI reply had unexpected fields.');
  }
  return parsed.data;
}

// ── Translation (Sarvam Translate) ──

const TranslateResponseSchema = z.object({ translated_text: z.string().min(1) });

export async function translateForSpeech(
  text: string,
  from: VoiceLanguageCode,
  to: VoiceLanguageCode
): Promise<string> {
  const res = await sarvamFetch(
    '/translate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        source_language_code: from,
        target_language_code: to,
        model: TRANSLATE_MODEL
      })
    },
    10_000
  );
  const parsed = TranslateResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new VoiceServiceError('UPSTREAM', 'Unexpected translation response.');
  }
  return parsed.data.translated_text.trim();
}

// ── Text to speech (Bulbul) ──

const TtsResponseSchema = z.object({ audios: z.array(z.string()).min(1) });

function detectAudioMime(bytes: Uint8Array): string {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === 'RIFF') return 'audio/wav';
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  return 'audio/wav';
}

export async function synthesizeSpeech(
  text: string,
  languageCode: VoiceLanguageCode
): Promise<{ audio: ArrayBuffer; mimeType: string }> {
  const res = await sarvamFetch(
    '/text-to-speech',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        model: TTS_MODEL,
        speech_sample_rate: 16000,
        ...(TTS_SPEAKER ? { speaker: TTS_SPEAKER } : {})
      })
    },
    20_000
  );
  const parsed = TtsResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new VoiceServiceError('UPSTREAM', 'Unexpected text-to-speech response.');
  }
  const bytes = Buffer.from(parsed.data.audios[0], 'base64');
  const audio = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { audio, mimeType: detectAudioMime(new Uint8Array(audio)) };
}
