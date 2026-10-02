/**
 * Classifies a short spoken answer ("haan", "hoy", "yes, hold it", "nahin") as yes / no.
 * Used when BedLink asks the crew "say yes to hold this bed".
 * Any "no" word wins over a "yes" word, so a mixed or unclear answer never holds a bed.
 */

export type ConfirmationAnswer = 'yes' | 'no' | 'unclear';

export interface VoiceConfirmResult {
  answer: ConfirmationAnswer;
  transcript: string;
}

// Single words, matched as whole tokens.
const YES_WORDS = new Set([
  // English
  'yes', 'yeah', 'yep', 'yup', 'hold', 'confirm', 'confirmed', 'ok', 'okay', 'sure', 'send', 'proceed',
  // Hindi / Hinglish (Roman)
  'haan', 'haa', 'han', 'ha', 'ji', 'theek', 'thik', 'karo', 'bhejo', 'bhej',
  // Marathi (Roman)
  'ho', 'hoy', 'kara', 'pathva',
  // Hindi (Devanagari)
  'हाँ', 'हां', 'हा', 'जी', 'ठीक', 'करो', 'भेजो', 'भेज', 'होल्ड', 'कन्फर्म', 'ओके', 'यस',
  // Marathi (Devanagari)
  'हो', 'होय', 'करा', 'पाठवा'
]);

const NO_WORDS = new Set([
  // English
  'no', 'nope', 'cancel', 'stop', 'wait', "don't", 'dont', 'not',
  // Hindi / Hinglish (Roman)
  'nahin', 'nahi', 'nai', 'na', 'mat', 'ruko', 'ruk',
  // Marathi (Roman)
  'nako', 'nahi', 'thamba',
  // Hindi (Devanagari)
  'नहीं', 'नही', 'ना', 'मत', 'रुको', 'रुक', 'रद्द', 'नो', 'कैंसल',
  // Marathi (Devanagari)
  'नाही', 'नको', 'थांबा'
]);

// Multi-word "yes" phrases.
const YES_PHRASES = ['go ahead', 'do it', 'kar do', 'bhej do', 'ठीक है', 'कर दो', 'भेज दो', 'ठीक आहे', 'theek hai', 'thik hai'];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Keep letters (any script), combining marks (Devanagari vowel signs) and apostrophes.
    .replace(/[^\p{L}\p{M}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function classifyConfirmation(transcript: string): ConfirmationAnswer {
  const tokens = tokenize(transcript);
  if (tokens.length === 0) return 'unclear';
  if (tokens.some((t) => NO_WORDS.has(t))) return 'no';

  const normalized = ` ${tokens.join(' ')} `;
  if (tokens.some((t) => YES_WORDS.has(t)) || YES_PHRASES.some((p) => normalized.includes(` ${p} `))) {
    return 'yes';
  }
  return 'unclear';
}
