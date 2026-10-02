'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { VOICE_LANGUAGE_CODES, VoiceLanguageCode } from './languages';
import { VoicePlayer } from './player';

// ── Is voice set up on the server? ──

export type VoiceAvailability = 'checking' | 'ready' | 'not_configured' | 'unavailable';

let availabilityRequest: Promise<VoiceAvailability> | null = null;

function fetchAvailability(): Promise<VoiceAvailability> {
  availabilityRequest ??= fetch('/api/voice/status', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return 'unavailable' as const;
      const body = (await res.json()) as { configured?: boolean };
      return body.configured ? ('ready' as const) : ('not_configured' as const);
    })
    .catch(() => {
      availabilityRequest = null; // allow a retry on the next mount
      return 'unavailable' as const;
    });
  return availabilityRequest;
}

export function useVoiceAvailability(): VoiceAvailability {
  const [availability, setAvailability] = useState<VoiceAvailability>('checking');
  useEffect(() => {
    let cancelled = false;
    fetchAvailability().then((value) => {
      if (!cancelled) setAvailability(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return availability;
}

// ── Per-screen voice settings, remembered in this browser ──

export interface VoiceSettings {
  /** Speak status updates and alerts out loud. */
  announce: boolean;
  /** Language to speak in; "auto" follows the language the crew last spoke. */
  language: VoiceLanguageCode | 'auto';
}

const VoiceSettingsSchema = z.object({
  announce: z.boolean(),
  language: z.union([z.literal('auto'), z.enum(VOICE_LANGUAGE_CODES)])
});

const settingsListeners = new Set<() => void>();
const memoryStore = new Map<string, string>(); // used when localStorage is blocked
const snapshotCache = new Map<string, { raw: string | null; value: VoiceSettings }>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string) {
  memoryStore.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the in-memory copy still works for this visit.
  }
}

function readSettings(key: string, defaults: VoiceSettings): VoiceSettings {
  const raw = readRaw(key);
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.value;

  let value = defaults;
  if (raw) {
    try {
      const parsed = VoiceSettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    } catch {
      // Ignore corrupt values and fall back to defaults.
    }
  }
  snapshotCache.set(key, { raw, value });
  return value;
}

function subscribeSettings(listener: () => void) {
  settingsListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    settingsListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useVoiceSettings(
  key: string,
  defaults: VoiceSettings
): [VoiceSettings, (patch: Partial<VoiceSettings>) => void] {
  const [stableDefaults] = useState(defaults);
  const settings = useSyncExternalStore(
    subscribeSettings,
    () => readSettings(key, stableDefaults),
    () => stableDefaults
  );

  const update = useCallback(
    (patch: Partial<VoiceSettings>) => {
      const next = { ...readSettings(key, stableDefaults), ...patch };
      writeRaw(key, JSON.stringify(next));
      settingsListeners.forEach((l) => l());
    },
    [key, stableDefaults]
  );

  return [settings, update];
}

// ── Announcement player ──

export function useVoicePlayer() {
  const [player] = useState(() => new VoicePlayer());
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getServerSnapshot);

  useEffect(() => {
    // Any tap or key press on the page unlocks audio for later announcements.
    window.addEventListener('pointerdown', player.unlock);
    window.addEventListener('keydown', player.unlock);
    return () => {
      window.removeEventListener('pointerdown', player.unlock);
      window.removeEventListener('keydown', player.unlock);
      player.dispose();
    };
  }, [player]);

  return {
    status: snapshot.status,
    error: snapshot.error,
    speak: player.speak,
    speakAndWait: player.speakAndWait,
    unlock: player.unlock,
    stop: player.stop
  };
}
