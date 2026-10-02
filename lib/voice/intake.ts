import { z } from 'zod';
import { BedType, Urgency } from '../types';
import { VoiceLanguageCode } from './languages';

export const BED_TYPE_VALUES = ['icu', 'ventilator', 'oxygen', 'emergency', 'general'] as const;
export const SPECIALTY_VALUES = ['none', 'cardiac', 'burns', 'trauma', 'neuro', 'pediatric'] as const;
export const URGENCY_VALUES = ['critical', 'urgent', 'normal'] as const;

export type VoiceSpecialty = (typeof SPECIALTY_VALUES)[number];

const lowercaseOrNull = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/**
 * What the crew said, as structured fields. `null` means "not mentioned".
 * Never contains patient names or other personal details.
 */
export const VoiceIntakeFieldsSchema = z.object({
  bedType: z.preprocess(lowercaseOrNull, z.enum(BED_TYPE_VALUES).nullable()),
  requiresVentilator: z.boolean().nullable(),
  specialty: z.preprocess(lowercaseOrNull, z.enum(SPECIALTY_VALUES).nullable()),
  urgency: z.preprocess(lowercaseOrNull, z.enum(URGENCY_VALUES).nullable()),
  notes: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .transform((v) => (v ? v : null))
});

export type VoiceIntakeFields = z.infer<typeof VoiceIntakeFieldsSchema>;

export interface VoiceIntakeResult {
  transcript: string;
  /** Language BedLink will reply in (always one it can speak). */
  languageCode: VoiceLanguageCode;
  /** Language code reported by speech recognition, if any. */
  detectedLanguageCode: string | null;
  fields: VoiceIntakeFields;
  parser: 'ai' | 'keywords';
}

export type VoiceErrorCode =
  | 'NOT_CONFIGURED'
  | 'BAD_REQUEST'
  | 'NO_SPEECH'
  | 'UPSTREAM'
  | 'TIMEOUT';

export interface VoiceErrorBody {
  success: false;
  code: VoiceErrorCode;
  error: string;
}

const EMPTY_FIELDS: VoiceIntakeFields = {
  bedType: null,
  requiresVentilator: null,
  specialty: null,
  urgency: null,
  notes: null
};

const includesAny = (text: string, words: readonly string[]) => words.some((w) => text.includes(w));

// Keyword lists cover English plus common Hindi and Marathi words (Devanagari).
const KEYWORDS = {
  icu: ['icu', 'i.c.u', 'intensive care', 'आईसीयू', 'आयसीयू', 'आई सी यू', 'आय सी यू'],
  ventilator: ['ventilator', 'वेंटिलेटर', 'व्हेंटिलेटर', 'वेंटीलेटर'],
  oxygen: ['oxygen', 'o2', 'ऑक्सीजन', 'ऑक्सिजन', 'आक्सीजन'],
  emergencyBed: ['emergency bed', 'resus', 'casualty', 'इमरजेंसी बेड', 'इमर्जन्सी बेड', 'कैजुअल्टी'],
  generalBed: ['general ward', 'general bed', 'जनरल वार्ड', 'जनरल वॉर्ड', 'जनरल बेड'],
  cardiac: ['cardiac', 'heart', 'stemi', 'chest pain', 'हार्ट', 'हृदय', 'दिल का', 'दिल की', 'छाती', 'हृदयविकार'],
  burns: ['burn', 'जला', 'जली', 'जले', 'झुलस', 'भाजल', 'भाजले', 'आग'],
  trauma: ['trauma', 'accident', 'fracture', 'एक्सीडेंट', 'दुर्घटना', 'अपघात', 'ट्रॉमा', 'फ्रैक्चर'],
  neuro: ['stroke', 'neuro', 'brain', 'seizure', 'लकवा', 'पक्षाघात', 'दिमाग', 'मेंदू', 'मिर्गी', 'झटके'],
  pediatric: ['child', 'baby', 'infant', 'pediatric', 'paediatric', 'बच्चा', 'बच्ची', 'बच्चे', 'बाळ', 'मूल', 'लहान मुल'],
  critical: ['critical', 'serious', 'unconscious', 'not breathing', 'गंभीर', 'क्रिटिकल', 'सीरियस', 'बेहोश', 'बेशुद्ध'],
  urgent: ['urgent', 'quickly', 'अर्जेंट', 'जल्दी', 'तातडी', 'तातडीने', 'लवकर'],
  normal: ['stable', 'normal', 'स्थिर', 'नॉर्मल']
} as const;

/**
 * Fallback parser used when the AI step is unavailable. Deliberately conservative:
 * it only fills a field when a clear keyword is present.
 */
export function parseIntakeKeywords(transcript: string): VoiceIntakeFields {
  const text = transcript.toLowerCase();
  const fields: VoiceIntakeFields = { ...EMPTY_FIELDS };

  const mentionsVentilator = includesAny(text, KEYWORDS.ventilator);

  if (includesAny(text, KEYWORDS.icu)) fields.bedType = 'icu';
  else if (includesAny(text, KEYWORDS.oxygen)) fields.bedType = 'oxygen';
  else if (includesAny(text, KEYWORDS.emergencyBed)) fields.bedType = 'emergency';
  else if (includesAny(text, KEYWORDS.generalBed)) fields.bedType = 'general';
  else if (mentionsVentilator) fields.bedType = 'ventilator';

  if (mentionsVentilator) fields.requiresVentilator = true;

  if (includesAny(text, KEYWORDS.cardiac)) fields.specialty = 'cardiac';
  else if (includesAny(text, KEYWORDS.burns)) fields.specialty = 'burns';
  else if (includesAny(text, KEYWORDS.trauma)) fields.specialty = 'trauma';
  else if (includesAny(text, KEYWORDS.neuro)) fields.specialty = 'neuro';
  else if (includesAny(text, KEYWORDS.pediatric)) fields.specialty = 'pediatric';

  if (includesAny(text, KEYWORDS.critical)) fields.urgency = 'critical';
  else if (includesAny(text, KEYWORDS.urgent)) fields.urgency = 'urgent';
  else if (includesAny(text, KEYWORDS.normal)) fields.urgency = 'normal';

  return fields;
}

/** Fills fields the AI left empty with anything the keyword parser found. */
export function mergeIntakeFields(primary: VoiceIntakeFields, fallback: VoiceIntakeFields): VoiceIntakeFields {
  return {
    bedType: primary.bedType ?? fallback.bedType,
    requiresVentilator: primary.requiresVentilator ?? fallback.requiresVentilator,
    specialty: primary.specialty ?? fallback.specialty,
    urgency: primary.urgency ?? fallback.urgency,
    notes: primary.notes ?? fallback.notes
  };
}

export function hasAnyIntakeField(fields: VoiceIntakeFields): boolean {
  return (
    fields.bedType !== null ||
    fields.requiresVentilator !== null ||
    fields.specialty !== null ||
    fields.urgency !== null
  );
}

export interface IntakeFormValues {
  bedType: BedType;
  requiresVentilator: boolean;
  specialty: string;
  urgency: Urgency;
  notes: string;
}

/**
 * A voice request describes a new patient, so anything not mentioned is reset to a
 * neutral default rather than kept from the previous patient. Urgency is the
 * exception: it is kept, because the dispatcher may have set it already.
 */
export function applyVoiceIntake<T extends IntakeFormValues>(current: T, fields: VoiceIntakeFields): T {
  const bedType: BedType = fields.bedType ?? (fields.requiresVentilator ? 'ventilator' : current.bedType);
  return {
    ...current,
    bedType,
    requiresVentilator: fields.requiresVentilator ?? bedType === 'ventilator',
    specialty: fields.specialty ?? 'none',
    urgency: fields.urgency ?? current.urgency,
    notes: fields.notes ?? ''
  };
}
