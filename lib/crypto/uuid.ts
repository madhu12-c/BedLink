/**
 * Robust UUID v4 Generator compatible with all browser and server environments
 * (including non-HTTPS mobile browser sessions where crypto.randomUUID is undefined).
 */

export function isUUID(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

export function generateUUID(): string {
  // 1. Native crypto.randomUUID (available in Secure Contexts: HTTPS or localhost)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to getRandomValues or Math.random
    }
  }

  // 2. crypto.getRandomValues (available in almost all browser environments, even HTTP)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    } catch {
      // Fall through to Math.random
    }
  }

  // 3. RFC4122 v4 Math.random fallback (guaranteed to work everywhere)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Ensures a valid UUID: returns the input if already valid UUID, otherwise generates a fresh UUID.
 */
export function ensureUUID(val?: string | null): string {
  if (isUUID(val)) return val!;
  return generateUUID();
}
