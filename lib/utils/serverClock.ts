/**
 * Server time for the browser. BedLink compares times the server saved (when a hold was made,
 * when beds were updated) with "now", so a phone whose clock is wrong (wrong time zone, set by
 * hand) would show a 4-minute arrival as 334 minutes, call fresh data old, or expire holds
 * early. The browser measures how far its clock is from the server's at start and every few
 * minutes, and every time check uses serverNow() instead of Date.now(). On the server the
 * offset stays 0.
 */

let offsetMs = 0;
let started = false;

/** Below this the device clock is fine: keep it, so times don't jump by a second. */
const IGNORE_BELOW_MS = 2000;
const RESYNC_MS = 5 * 60 * 1000;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function serverDate(): Date {
  return new Date(serverNow());
}

export function serverIso(): string {
  return serverDate().toISOString();
}

async function measure(): Promise<void> {
  const sentAt = Date.now();
  const res = await fetch('/api/voice/status', { cache: 'no-store' });
  const server = Date.parse(res.headers.get('date') ?? '');
  if (Number.isNaN(server)) return;
  // The server stamped its reply between sending and receiving; the header drops the
  // milliseconds, so its real time is on average half a second later
  const offset = server + 500 - (sentAt + Date.now()) / 2;
  offsetMs = Math.abs(offset) < IGNORE_BELOW_MS ? 0 : offset;
  if (offsetMs) console.info(`[BedLink] Device clock is off by ${Math.round(offsetMs / 1000)} s; using server time.`);
}

/** Starts measuring (browser only, once per page load). */
export function startServerClock() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const run = () => {
    measure().catch(() => {
      // Offline: keep the last offset
    });
  };
  run();
  window.setInterval(run, RESYNC_MS);
}
