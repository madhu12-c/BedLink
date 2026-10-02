/**
 * Languages BedLink can speak back in (Sarvam Bulbul v3 text-to-speech).
 * Speech recognition (Saaras v4) understands more languages than this; anything
 * it detects outside this list is answered in English.
 */
export const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr-IN', label: 'Marathi', native: 'मराठी' },
  { code: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'bn-IN', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa-IN', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'od-IN', label: 'Odia', native: 'ଓଡ଼ିଆ' }
] as const;

export type VoiceLanguageCode = (typeof VOICE_LANGUAGES)[number]['code'];

export const VOICE_LANGUAGE_CODES = VOICE_LANGUAGES.map((l) => l.code) as [
  VoiceLanguageCode,
  ...VoiceLanguageCode[]
];

/** Languages with hand-written phrases; the rest are translated by Sarvam on the server. */
export const NATIVE_PHRASE_LANGUAGES: readonly VoiceLanguageCode[] = ['en-IN', 'hi-IN', 'mr-IN'];

export function isVoiceLanguage(code: string): code is VoiceLanguageCode {
  return (VOICE_LANGUAGE_CODES as readonly string[]).includes(code);
}

/** Maps a detected language code to one BedLink can speak, falling back to English. */
export function toSpeakableLanguage(code: string | null | undefined): VoiceLanguageCode {
  if (!code) return 'en-IN';
  const normalized = code === 'or-IN' ? 'od-IN' : code;
  return isVoiceLanguage(normalized) ? normalized : 'en-IN';
}

export function getLanguageLabel(code: VoiceLanguageCode): string {
  const lang = VOICE_LANGUAGES.find((l) => l.code === code);
  return lang ? `${lang.native} (${lang.label})` : code;
}
