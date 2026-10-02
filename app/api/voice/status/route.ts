import { isVoiceConfigured } from '@/lib/voice/sarvam';

export const dynamic = 'force-dynamic';

/** Lets screens show or hide voice controls without exposing the API key. */
export async function GET() {
  return Response.json({ configured: isVoiceConfigured() });
}
