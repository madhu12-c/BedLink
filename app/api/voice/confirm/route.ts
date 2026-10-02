import { NextRequest } from 'next/server';
import { classifyConfirmation, VoiceConfirmResult } from '@/lib/voice/confirm';
import { ANSWER_KEYTERMS, transcribeAudio } from '@/lib/voice/sarvam';
import { voiceError, voiceErrorFromException } from '@/lib/voice/http';
import { requireApiUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

const MIN_AUDIO_BYTES = 2_000;
const MAX_AUDIO_BYTES = 512 * 1024; // the browser listens for an answer for at most a few seconds

/**
 * Hears the crew's short spoken answer ("haan", "hoy", "yes", "nahin") after BedLink
 * asks whether to hold a bed. Returns yes / no / unclear; the browser only holds on "yes".
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser(['dispatcher', 'admin']);
  if (auth.response) return auth.response;
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
  if (audio.size < MIN_AUDIO_BYTES || audio.size > MAX_AUDIO_BYTES) {
    return voiceError('BAD_REQUEST', 'The answer recording has an unexpected length.');
  }

  try {
    const { transcript } = await transcribeAudio(audio, ANSWER_KEYTERMS);
    const result: VoiceConfirmResult = {
      answer: classifyConfirmation(transcript),
      transcript
    };
    return Response.json({ success: true, result });
  } catch (err) {
    return voiceErrorFromException(err);
  }
}
