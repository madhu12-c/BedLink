import { BedType, Urgency } from '../types';
import { VoiceLanguageCode } from './languages';
import { VoiceSpecialty } from './intake';

/**
 * Everything BedLink says out loud. English, Hindi and Marathi are written by hand;
 * for any other language the English sentence is sent with `targetLanguage` set,
 * and the server translates it before speaking.
 */

type PhraseLanguage = 'en-IN' | 'hi-IN' | 'mr-IN';

export interface SpokenPhrase {
  text: string;
  sourceLanguage: PhraseLanguage;
  targetLanguage: VoiceLanguageCode;
}

const BED_LABELS: Record<PhraseLanguage, Record<BedType, string>> = {
  'en-IN': { icu: 'ICU', ventilator: 'ventilator', oxygen: 'oxygen', cardiac: 'cardiac', burns: 'burns', emergency: 'emergency', general: 'general ward' },
  'hi-IN': { icu: 'आईसीयू', ventilator: 'वेंटिलेटर', oxygen: 'ऑक्सीजन', cardiac: 'कार्डियक', burns: 'बर्न्स', emergency: 'इमरजेंसी', general: 'जनरल वार्ड' },
  'mr-IN': { icu: 'आयसीयू', ventilator: 'व्हेंटिलेटर', oxygen: 'ऑक्सिजन', cardiac: 'कार्डियाक', burns: 'बर्न्स', emergency: 'इमर्जन्सी', general: 'जनरल वॉर्ड' }
};

const SPECIALTY_LABELS: Record<PhraseLanguage, Record<Exclude<VoiceSpecialty, 'none'>, string>> = {
  'en-IN': {
    cardiac: 'cardiac care',
    burns: 'burns unit',
    trauma: 'trauma care',
    neuro: 'neurology',
    pediatric: "children's care"
  },
  'hi-IN': {
    cardiac: 'हृदय रोग विभाग',
    burns: 'बर्न यूनिट',
    trauma: 'ट्रॉमा केयर',
    neuro: 'न्यूरोलॉजी',
    pediatric: 'बाल रोग विभाग'
  },
  'mr-IN': {
    cardiac: 'हृदयरोग विभाग',
    burns: 'बर्न युनिट',
    trauma: 'ट्रॉमा केअर',
    neuro: 'न्यूरोलॉजी',
    pediatric: 'बालरोग विभाग'
  }
};

const URGENCY_SENTENCES: Record<PhraseLanguage, Record<Urgency, string>> = {
  'en-IN': { critical: 'Critical patient', urgent: 'Urgent case', normal: 'Patient is stable' },
  'hi-IN': {
    critical: 'मरीज़ की हालत गंभीर है',
    urgent: 'मामला अर्जेंट है',
    normal: 'मरीज़ की हालत स्थिर है'
  },
  'mr-IN': {
    critical: 'रुग्णाची स्थिती गंभीर आहे',
    urgent: 'प्रकरण तातडीचे आहे',
    normal: 'रुग्णाची स्थिती स्थिर आहे'
  }
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function phraseLanguageFor(target: VoiceLanguageCode): PhraseLanguage {
  return target === 'hi-IN' || target === 'mr-IN' ? target : 'en-IN';
}

function phrase(target: VoiceLanguageCode, build: (lang: PhraseLanguage) => string): SpokenPhrase {
  const sourceLanguage = phraseLanguageFor(target);
  return { text: build(sourceLanguage), sourceLanguage, targetLanguage: target };
}

// ── Dispatch screen: status of the request, spoken to the ambulance crew ──

export type DispatchVoiceEvent =
  | { kind: 'hold_sent'; hospitalName: string }
  | { kind: 'accepted'; hospitalName: string }
  | { kind: 'rejected'; hospitalName: string }
  | { kind: 'expired'; hospitalName: string }
  | { kind: 'unavailable'; hospitalName: string }
  | { kind: 'not_held' };

export function dispatchEventPhrase(event: DispatchVoiceEvent, target: VoiceLanguageCode): SpokenPhrase {
  if (event.kind === 'not_held') {
    return phrase(target, (lang) => ({
      'en-IN': 'Okay, the bed was not held.',
      'hi-IN': 'ठीक है, बेड होल्ड नहीं किया गया।',
      'mr-IN': 'ठीक आहे, बेड होल्ड केला नाही.'
    })[lang]);
  }
  const h = event.hospitalName;
  return phrase(target, (lang) => {
    switch (event.kind) {
      case 'unavailable':
        return {
          'en-IN': `No free bed left at ${h}. Please choose another hospital.`,
          'hi-IN': `${h} में अब कोई खाली बेड नहीं है। कृपया दूसरा अस्पताल चुनें।`,
          'mr-IN': `${h} मध्ये आता रिकामा बेड नाही. कृपया दुसरे रुग्णालय निवडा.`
        }[lang];
      case 'hold_sent':
        return {
          'en-IN': `Request sent to ${h}. Waiting for their answer, up to 2 minutes.`,
          'hi-IN': `${h} को अनुरोध भेज दिया है। जवाब का इंतज़ार है, ज़्यादा से ज़्यादा दो मिनट।`,
          'mr-IN': `${h} ला विनंती पाठवली आहे. उत्तराची वाट पाहत आहोत, जास्तीत जास्त दोन मिनिटे.`
        }[lang];
      case 'accepted':
        return {
          'en-IN': `Bed confirmed at ${h}. Go now.`,
          'hi-IN': `${h} में बेड पक्का हो गया है। अभी रवाना हो जाइए।`,
          'mr-IN': `${h} मध्ये बेड निश्चित झाला आहे. लगेच निघा.`
        }[lang];
      case 'rejected':
        return {
          'en-IN': `${h} declined. Looking for the next hospital.`,
          'hi-IN': `${h} ने मना कर दिया। अगला अस्पताल ढूंढ रहे हैं।`,
          'mr-IN': `${h} ने नकार दिला. पुढचे रुग्णालय शोधत आहोत.`
        }[lang];
      case 'expired':
        return {
          'en-IN': `${h} did not answer in 2 minutes. Looking for the next hospital.`,
          'hi-IN': `${h} ने दो मिनट में जवाब नहीं दिया। अगला अस्पताल ढूंढ रहे हैं।`,
          'mr-IN': `${h} कडून दोन मिनिटांत उत्तर आले नाही. पुढचे रुग्णालय शोधत आहोत.`
        }[lang];
    }
  });
}

// ── Dispatch screen: read back what was understood from the crew's voice ──

export interface IntakeReadbackInput {
  bedType: BedType;
  requiresVentilator: boolean;
  specialty: string;
  urgency: Urgency;
  topMatch: { hospitalName: string; etaMinutes: number; freeBeds: number } | null;
  /** End by asking the crew to say "yes" to hold the bed (they are listened to next). */
  askToHold: boolean;
}

const ASK_TO_HOLD: Record<PhraseLanguage, string> = {
  'en-IN': 'Say yes to hold this bed, or no to cancel.',
  'hi-IN': 'बेड होल्ड करने के लिए हाँ बोलिए, या रद्द करने के लिए नहीं।',
  'mr-IN': 'बेड होल्ड करण्यासाठी हो म्हणा, किंवा रद्द करण्यासाठी नाही म्हणा.'
};

const TAP_TO_HOLD: Record<PhraseLanguage, string> = {
  'en-IN': 'Tap Hold Bed to send the request.',
  'hi-IN': 'अनुरोध भेजने के लिए होल्ड बेड दबाइए।',
  'mr-IN': 'विनंती पाठवण्यासाठी होल्ड बेड दाबा.'
};

function specialtyLabel(lang: PhraseLanguage, specialty: string): string | null {
  const labels = SPECIALTY_LABELS[lang] as Record<string, string>;
  return labels[specialty] ?? null;
}

export function intakeReadbackPhrase(input: IntakeReadbackInput, target: VoiceLanguageCode): SpokenPhrase {
  return phrase(target, (lang) => {
    const bed = BED_LABELS[lang][input.bedType];
    const spec = specialtyLabel(lang, input.specialty);
    const withVent = input.requiresVentilator && input.bedType !== 'ventilator';
    const urgency = URGENCY_SENTENCES[lang][input.urgency];
    const top = input.topMatch;
    const nextStep = (input.askToHold ? ASK_TO_HOLD : TAP_TO_HOLD)[lang];

    if (lang === 'hi-IN') {
      const need = `${bed} बेड${withVent ? ', वेंटिलेटर के साथ' : ''}${spec ? `, ${spec}` : ''}।`;
      const match = top
        ? `सबसे अच्छा विकल्प: ${top.hospitalName}, ${top.etaMinutes} मिनट दूर, ${top.freeBeds} ${bed} बेड खाली। ${nextStep}`
        : 'अभी किसी अस्पताल में यह बेड खाली नहीं है।';
      return `${need} ${urgency}। ${match}`;
    }
    if (lang === 'mr-IN') {
      const need = `${bed} बेड${withVent ? ', व्हेंटिलेटरसह' : ''}${spec ? `, ${spec}` : ''}.`;
      const match = top
        ? `सर्वोत्तम पर्याय: ${top.hospitalName}, ${top.etaMinutes} मिनिटांवर, ${top.freeBeds} ${bed} बेड रिकामे. ${nextStep}`
        : 'सध्या कोणत्याही रुग्णालयात हा बेड रिकामा नाही.';
      return `${need} ${urgency}. ${match}`;
    }
    const need = `${capitalize(bed)} bed${withVent ? ', with ventilator' : ''}${spec ? `, ${spec}` : ''}.`;
    const match = top
      ? `Best match: ${top.hospitalName}, ${top.etaMinutes} minutes away, ${top.freeBeds} ${bed} beds free. ${nextStep}`
      : 'No hospital has this bed free right now.';
    return `${need} ${urgency}. ${match}`;
  });
}

// ── Hospital screen: announce a new incoming request out loud ──

export function hospitalIncomingPhrase(
  input: { bedType: BedType; urgency?: Urgency | null },
  target: VoiceLanguageCode
): SpokenPhrase {
  return phrase(target, (lang) => {
    const bed = BED_LABELS[lang][input.bedType];
    const urgency = input.urgency ? URGENCY_SENTENCES[lang][input.urgency] : null;
    if (lang === 'hi-IN') {
      return `नया एम्बुलेंस अनुरोध। ${bed} बेड चाहिए${urgency ? `, ${urgency}` : ''}। कृपया दो मिनट में स्वीकार या अस्वीकार करें।`;
    }
    if (lang === 'mr-IN') {
      return `नवीन रुग्णवाहिका विनंती. ${bed} बेड हवा आहे${urgency ? `, ${urgency}` : ''}. कृपया दोन मिनिटांत स्वीकारा किंवा नाकारा.`;
    }
    return `New ambulance request. ${capitalize(bed)} bed needed.${urgency ? ` ${urgency}.` : ''} Please accept or reject within 2 minutes.`;
  });
}

/** Hospital screen: confirmation after the hospital accepts (the bed is now allotted). */
export function hospitalAllottedPhrase(input: { bedType: BedType }, target: VoiceLanguageCode): SpokenPhrase {
  return phrase(target, (lang) => {
    const bed = BED_LABELS[lang][input.bedType];
    return {
      'en-IN': `Bed allotted. The ${bed} bed is held for the incoming ambulance. Please get ready to receive the patient.`,
      'hi-IN': `बेड आवंटित हो गया। आने वाली एम्बुलेंस के लिए ${bed} बेड रखा गया है। कृपया मरीज़ को लेने की तैयारी करें।`,
      'mr-IN': `बेड दिला गेला आहे. येणाऱ्या रुग्णवाहिकेसाठी ${bed} बेड राखून ठेवला आहे. कृपया रुग्णाला घेण्याची तयारी करा.`
    }[lang];
  });
}
