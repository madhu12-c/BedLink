'use client';

import React from 'react';
import { AlertTriangle, Loader2, Volume2, VolumeX } from 'lucide-react';
import { VoiceAvailability, VoiceSettings } from '@/lib/voice/hooks';
import { VOICE_LANGUAGES, VoiceLanguageCode, getLanguageLabel } from '@/lib/voice/languages';
import { VoicePlayerStatus } from '@/lib/voice/player';

interface VoiceSettingsBarProps {
  availability: VoiceAvailability;
  settings: VoiceSettings;
  onChange: (patch: Partial<VoiceSettings>) => void;
  playerStatus: VoicePlayerStatus;
  playerError: string | null;
  onUnlock: () => void;
  /** Text on the on/off toggle, e.g. "Voice updates". */
  label: string;
  /** Offer "Auto" (follow the language the crew spoke). */
  allowAuto?: boolean;
  autoLanguage?: VoiceLanguageCode | null;
  className?: string;
}

export function VoiceSettingsBar({
  availability,
  settings,
  onChange,
  playerStatus,
  playerError,
  onUnlock,
  label,
  allowAuto = false,
  autoLanguage = null,
  className = ''
}: VoiceSettingsBarProps) {
  if (availability === 'checking') return null;

  if (availability !== 'ready') {
    return (
      <div className={`flex items-center gap-2 text-xs text-slate-500 ${className}`} role="status">
        <VolumeX className="w-3.5 h-3.5 shrink-0" />
        <span>
          {availability === 'not_configured'
            ? 'Voice is off: add SARVAM_API_KEY on the server to turn it on.'
            : 'Voice service is unreachable right now.'}
        </span>
      </div>
    );
  }

  const toggle = () => {
    const turningOn = !settings.announce;
    onChange({ announce: turningOn });
    if (turningOn) onUnlock(); // this click counts as the tap browsers need before playing audio
  };

  const languageValue = settings.language === 'auto' && !allowAuto ? 'en-IN' : settings.language;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={settings.announce}
        aria-label={`${label}: ${settings.announce ? 'on' : 'off'}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border min-h-[36px] transition-colors ${
          settings.announce
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
            : 'bg-white text-slate-500 border-slate-300'
        }`}
      >
        {settings.announce ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        <span>
          {label}: {settings.announce ? 'On' : 'Off'}
        </span>
      </button>

      <select
        value={languageValue}
        onChange={(e) => onChange({ language: e.target.value as VoiceSettings['language'] })}
        aria-label="Voice language"
        className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1.5 min-h-[36px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        {allowAuto && (
          <option value="auto">
            Auto{autoLanguage ? ` (${getLanguageLabel(autoLanguage)})` : ' (language spoken)'}
          </option>
        )}
        {VOICE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native} ({lang.label})
          </option>
        ))}
      </select>

      {settings.announce && (playerStatus === 'loading' || playerStatus === 'playing') && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700" role="status">
          <Loader2 className="w-3 h-3 animate-spin" />
          {playerStatus === 'loading' ? 'Preparing voice…' : 'Speaking…'}
        </span>
      )}

      {settings.announce && playerStatus === 'blocked' && (
        <button
          type="button"
          onClick={onUnlock}
          className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1.5 min-h-[36px]"
        >
          Tap to enable sound
        </button>
      )}

      {settings.announce && playerStatus === 'error' && playerError && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700" role="alert">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {playerError}
        </span>
      )}
    </div>
  );
}
