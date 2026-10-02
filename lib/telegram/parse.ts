import { BedType } from '../types';

export const BED_LABELS: Record<BedType, string> = {
  icu: 'ICU',
  ventilator: 'Ventilator',
  oxygen: 'Oxygen',
  cardiac: 'Cardiac',
  burns: 'Burns',
  emergency: 'Emergency',
  general: 'General'
};

/** Words a nurse may type for each bed type (lower case, whole word). */
const BED_WORDS: ReadonlyArray<[BedType, RegExp]> = [
  ['ventilator', /^(ventilators?|vents?|venti)$/],
  ['icu', /^(icu|icus|micu|sicu|nicu)$/],
  ['oxygen', /^(oxygen|o2|oxy)$/],
  ['cardiac', /^(cardiac|ccu|iccu|heart)$/],
  ['burns', /^(burns?)$/],
  ['emergency', /^(emergency|er|ed|casualty)$/],
  ['general', /^(general|gen|ward)$/]
];

function bedTypeOf(word: string): BedType | null {
  return BED_WORDS.find(([, pattern]) => pattern.test(word))?.[0] ?? null;
}

/**
 * Free-bed counts from a short message such as "ICU 3, O2 5", "3 icu 2 vent" or "icu=0".
 * A number goes with the bed word just before it, otherwise with the next bed word.
 * Returns {} when the message has no bed counts.
 */
export function parseBedCounts(text: string): Partial<Record<BedType, number>> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // split "icu3" / "3icu" into word and number, but keep "o2" whole
    .flatMap((t) => (t === 'o2' ? [t] : t.split(/(\d+)/).filter(Boolean)));

  const counts: Partial<Record<BedType, number>> = {};
  let waitingBed: BedType | null = null;
  let waitingNumber: number | null = null;

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = Math.min(999, Number(token));
      if (waitingBed) {
        counts[waitingBed] = n;
        waitingBed = null;
      } else {
        waitingNumber = n;
      }
      continue;
    }
    const bed = bedTypeOf(token);
    if (!bed) continue; // "beds", "free", "and", "khali"...
    if (waitingNumber !== null) {
      counts[bed] = waitingNumber;
      waitingNumber = null;
    } else {
      waitingBed = bed;
    }
  }
  return counts;
}

/** "Nothing changed" replies: 1 / yes / ok / haan / ho... */
export function isYes(text: string): boolean {
  return /^(1|y|yes|yep|ok|okay|same|correct|right|haan|han|ha|haa|ho|hoy|hoye|ji|theek|thik)$/i.test(
    text.trim().replace(/[.!\s]+$/, '')
  );
}
