import 'server-only';
import { VoiceErrorBody, VoiceErrorCode } from './intake';
import { VoiceServiceError } from './sarvam';

const STATUS_BY_CODE: Record<VoiceErrorCode, number> = {
  NOT_CONFIGURED: 503,
  BAD_REQUEST: 400,
  NO_SPEECH: 422,
  UPSTREAM: 502,
  TIMEOUT: 504
};

export function voiceError(code: VoiceErrorCode, error: string): Response {
  const body: VoiceErrorBody = { success: false, code, error };
  return Response.json(body, { status: STATUS_BY_CODE[code] });
}

export function voiceErrorFromException(err: unknown): Response {
  if (err instanceof VoiceServiceError) {
    return voiceError(err.code, err.message);
  }
  console.error('[voice] unexpected error', err);
  return voiceError('UPSTREAM', 'Voice service failed unexpectedly.');
}
