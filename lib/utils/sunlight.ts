import { useSyncExternalStore } from 'react';

/**
 * Sunlight mode: maximum contrast for phones used outdoors (ambulance crews in daylight).
 * Remembered on this device; applied as data-sunlight="on" on <html> (see globals.css).
 */
const STORAGE_KEY = 'bedlink.sunlight';
const listeners = new Set<() => void>();

function readSunlight(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function applySunlight(on: boolean) {
  document.documentElement.dataset.sunlight = on ? 'on' : 'off';
}

function setSunlight(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode etc.: still switch for this visit
  }
  applySunlight(on);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** [is sunlight mode on, turn it on/off]. Off during the server render. */
export function useSunlight(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readSunlight, () => false);
  return [on, setSunlight];
}
