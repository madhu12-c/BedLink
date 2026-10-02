import { NextRequest } from 'next/server';
import { z } from 'zod';
import { VOICE_LANGUAGE_CODES, VoiceLanguageCode } from '@/lib/voice/languages';
import { isVoiceConfigured, synthesizeSpeech, translateForSpeech } from '@/lib/voice/sarvam';
import { voiceError, voiceErrorFromException } from '@/lib/voice/http';
import { requireApiUser } from '@/lib/auth/session';
import { USER_ROLES } from '@/lib/auth/roles';

export const runtime = 'nodejs';

const SpeakSchema = z.object({
  text: z.string().trim().min(1).max(600),
  sourceLanguage: z.enum(VOICE_LANGUAGE_CODES),
  targetLanguage: z.enum(VOICE_LANGUAGE_CODES)
});

interface CachedAudio {
  audio: ArrayBuffer;
  mimeType: string;
  language: VoiceLanguageCode;
}

// The same announcements repeat a lot during a shift (and a demo), so keep recent audio in memory.
const MAX_CACHE_ENTRIES = 64;
const audioCache = new Map<string, CachedAudio>();

function remember(key: string, value: CachedAudio) {
  if (audioCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = audioCache.keys().next().value;
    if (oldest !== undefined) audioCache.delete(oldest);
  }
  audioCache.set(key, value);
}

/**
 * Speaks a BedLink phrase. If the phrase is not already in the target language it is
 * translated first; if translation fails, the original language is spoken instead.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser(USER_ROLES);
  if (auth.response) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return voiceError('BAD_REQUEST', 'Expected a JSON body.');
  }

  const parsed = SpeakSchema.safeParse(body);
  if (!parsed.success) {
    return voiceError('BAD_REQUEST', 'Invalid speak request.');
  }
  if (!isVoiceConfigured()) {
    return voiceError('NOT_CONFIGURED', 'Voice is not set up: SARVAM_API_KEY is missing.');
  }

  const { text, sourceLanguage, targetLanguage } = parsed.data;
  const cacheKey = `${sourceLanguage}>${targetLanguage}|${text}`;

  try {
    let cached = audioCache.get(cacheKey);
    if (!cached) {
      let spokenText = text;
      let language: VoiceLanguageCode = sourceLanguage;
      if (targetLanguage !== sourceLanguage) {
        try {
          spokenText = await translateForSpeech(text, sourceLanguage, targetLanguage);
          language = targetLanguage;
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown error';
          console.warn(`[voice] translation to ${targetLanguage} failed, speaking ${sourceLanguage}: ${reason}`);
        }
      }
      const { audio, mimeType } = await synthesizeSpeech(spokenText, language);
      cached = { audio, mimeType, language };
      remember(cacheKey, cached);
    }

    return new Response(cached.audio.slice(0), {
      headers: {
        'Content-Type': cached.mimeType,
        'Cache-Control': 'no-store',
        'X-Voice-Language': cached.language
      }
    });
  } catch (err) {
    return voiceErrorFromException(err);
  }
}
