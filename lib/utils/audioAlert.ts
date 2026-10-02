/**
 * Emergency Alert Tone & Browser Push Notification Utilities
 * Designed for emergency medical service (EMS) dispatch and hospital bed triage.
 */

/**
 * Plays an attention-grabbing two-tone emergency chime using Web Audio API.
 * Guaranteed zero external asset dependencies; works on any browser with AudioContext.
 */
export function playEmergencyAlertSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number, type: OscillatorType = 'triangle') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.35, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Urgent two-pulse hospital paging chime (880Hz A5 -> 659Hz E5 -> 880Hz A5)
    playTone(880, now, 0.22, 'sine');
    playTone(659, now + 0.25, 0.22, 'sine');
    playTone(880, now + 0.52, 0.35, 'triangle');
  } catch {
    // AudioContext might be restricted until first user interaction; ignore safely
  }
}

/**
 * Triggers a browser native notification if permitted.
 */
export async function triggerEmergencyNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  try {
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm === 'granted') {
      new Notification(title, {
        icon: '/icon-512.jpg',
        badge: '/icon-512.jpg',
        tag: 'bedlink-live-alert',
        requireInteraction: true,
        ...options
      });
    }
  } catch {
    // Ignore notification errors in restrictive sandbox environments
  }
}
