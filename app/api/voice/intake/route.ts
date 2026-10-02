import { NextRequest } from 'next/server';
import {
  mergeIntakeFields,
  parseIntakeKeywords,
  VoiceIntakeFields,
  VoiceIntakeResult
} from '@/lib/voice/intake';
import { toSpeakableLanguage } from '@/lib/voice/languages';
import { extractIntakeFields, INTAKE_KEYTERMS, transcribeAudio, VoiceServiceError } from '@/lib/voice/sarvam';
import { voiceError, voiceErrorFromException } from '@/lib/voice/http';

export const runtime = 'nodejs';

// 16 kHz mono WAV is about 32 KB per second; the browser caps recordings at 20 seconds.
const MIN_AUDIO_BYTES = 2_000;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/**
 * Turns a spoken request from the ambulance crew into dispatch form fields.
 * Audio and transcripts are not stored.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return voiceError('BAD_REQUEST', 'Expected multipart form data with an "audio" file.');
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob)) {
    return voiceError('BAD_REQUEST', 'Missing "audio" file.');
  }
  if (audio.type && !audio.type.startsWith('audio/')) {
    return voiceError('BAD_REQUEST', 'The uploaded file is not audio.');
  }
  if (audio.size < MIN_AUDIO_BYTES) {
    return voiceError('NO_SPEECH', 'The recording was too short. Hold the mic and speak for a few seconds.');
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return voiceError('BAD_REQUEST', 'The recording is too long. Keep it under 20 seconds.');
  }

  try {
    const { transcript, languageCode } = await transcribeAudio(audio, INTAKE_KEYTERMS);
    if (!transcript) {
      // Size and rough length only; never log audio or transcripts.
      console.warn(
        `[voice] empty transcript for ${audio.size} B (~${(audio.size / 32_000).toFixed(1)} s at 16 kHz), detected=${languageCode ?? 'none'}`
      );
      throw new VoiceServiceError('NO_SPEECH', "Didn't catch any speech. Try again closer to the mic.");
    }

    const keywordFields = parseIntakeKeywords(transcript);
    let fields: VoiceIntakeFields = keywordFields;
    let parser: VoiceIntakeResult['parser'] = 'keywords';
    try {
      const aiFields = await extractIntakeFields(transcript, languageCode);
      fields = mergeIntakeFields(aiFields, keywordFields);
      parser = 'ai';
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      console.warn(`[voice] AI field extraction failed, using keyword parser: ${reason}`);
    }

    const result: VoiceIntakeResult = {
      transcript,
      languageCode: toSpeakableLanguage(languageCode),
      detectedLanguageCode: languageCode,
      fields,
      parser
    };
    return Response.json({ success: true, result });
  } catch (err) {
    return voiceErrorFromException(err);
  }
}
