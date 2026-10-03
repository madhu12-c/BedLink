/**
 * Live ambulance tracking from the crew's phone: GPS for where it is, the compass for which way
 * it faces, the accelerometer for moving / stopped. Sent to every open BedLink screen through
 * Supabase Realtime (a broadcast channel: nothing is stored), or between tabs of one browser in
 * demo mode. Phone sensors only work on HTTPS (the Vercel link), not on http://192.168.x.x.
 *
 * Production note: positions go to anyone signed in to this Supabase project; a private channel
 * with row-level rules per hospital is the step before a real rollout.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '../supabase/client';
import { serverNow } from '../utils/serverClock';

export interface LivePosition {
  /** The crew's user id */
  id: string;
  name: string;
  fleet: string | null;
  vehicle: string | null;
  lat: number | null;
  lng: number | null;
  /** GPS accuracy in metres */
  accuracy: number | null;
  /** Degrees clockwise from north (compass), null if the phone has no compass */
  heading: number | null;
  moving: boolean;
  /** m/s from GPS, when the phone reports it */
  speed: number | null;
  /** The hold this ambulance is driving to, if any */
  reservationId: string | null;
  ts: number;
}

export interface SharingState {
  on: boolean;
  gps: 'waiting' | 'ok' | 'denied' | 'unavailable';
  compass: 'waiting' | 'ok' | 'denied' | 'unavailable';
  motion: 'waiting' | 'ok' | 'denied' | 'unavailable';
  last: LivePosition | null;
  error: string | null;
}

const CHANNEL = 'bedlink_ambulance_live';
const EVENT = 'pos';
/** A screen forgets an ambulance that hasn't sent anything for this long */
const STALE_MS = 45_000;
/** At most this often, unless the compass turned a lot */
const MIN_SEND_MS = 250;
const HEARTBEAT_MS = 3_000;

// ── Receiving (every screen) ───────────────────────────────────────────────
const live = new Map<string, LivePosition>();
const listeners = new Set<() => void>();
let snapshot: LivePosition[] = [];
let channel: RealtimeChannel | null = null;
let channelReady = false;
let tabBus: BroadcastChannel | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function publish() {
  snapshot = Array.from(live.values()).sort((a, b) => a.name.localeCompare(b.name));
  listeners.forEach((fn) => fn());
}

function receive(pos: LivePosition) {
  if (!pos?.id) return;
  live.set(pos.id, pos);
  publish();
}

function connect() {
  if (typeof window === 'undefined' || channel || tabBus) return;
  const supabase = getBrowserSupabaseClient();
  if (supabase) {
    channel = supabase
      .channel(CHANNEL, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: EVENT }, ({ payload }) => receive(payload as LivePosition))
      .subscribe((status) => {
        channelReady = status === 'SUBSCRIBED';
      });
  } else {
    try {
      tabBus = new BroadcastChannel(CHANNEL);
      tabBus.onmessage = (msg) => receive(msg.data as LivePosition);
    } catch {
      // No BroadcastChannel: only this tab sees its own position
    }
  }
  if (!pruneTimer) {
    pruneTimer = setInterval(() => {
      const cutoff = serverNow() - STALE_MS;
      let changed = false;
      for (const [id, pos] of live) {
        if (pos.ts < cutoff) {
          live.delete(id);
          changed = true;
        }
      }
      if (changed) publish();
    }, 5_000);
  }
}

/** Live ambulances, for useSyncExternalStore. */
export function subscribeLive(fn: () => void): () => void {
  connect();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLiveSnapshot(): LivePosition[] {
  return snapshot;
}

const EMPTY: LivePosition[] = [];
export function getServerLiveSnapshot(): LivePosition[] {
  return EMPTY;
}

function send(pos: LivePosition) {
  receive(pos); // this screen sees itself too
  if (channel && channelReady) {
    void channel.send({ type: 'broadcast', event: EVENT, payload: pos });
  } else if (tabBus) {
    tabBus.postMessage(pos);
  }
}

// ── Sharing (the crew's phone) ─────────────────────────────────────────────
type PermissionAsker = { requestPermission?: () => Promise<'granted' | 'denied'> };

let stopCurrent: (() => void) | null = null;

/**
 * Starts sending this phone's position, heading and motion. Call it from a tap (iPhone asks for
 * motion permission only inside a tap). Returns a stop function.
 */
export function startSharing(
  crew: { id: string; name: string; fleet: string | null; vehicle: string | null },
  getReservationId: () => string | null,
  onState: (state: SharingState) => void
): () => void {
  stopCurrent?.();
  connect();

  const state: SharingState = { on: true, gps: 'waiting', compass: 'waiting', motion: 'waiting', last: null, error: null };
  const pos: LivePosition = {
    ...crew,
    lat: null,
    lng: null,
    accuracy: null,
    heading: null,
    moving: false,
    speed: null,
    reservationId: getReservationId(),
    ts: serverNow()
  };
  let lastSent: LivePosition | null = null;
  let lastSentAt = 0;
  let motionAvg = 0;
  let lastMovingAt = 0;
  let stopped = false;

  const emitState = () => onState({ ...state, last: lastSent });

  const maybeSend = (force = false) => {
    if (stopped) return;
    const now = serverNow();
    pos.reservationId = getReservationId();
    pos.ts = now;
    const turned = lastSent && pos.heading !== null && lastSent.heading !== null
      ? Math.abs(((pos.heading - lastSent.heading + 540) % 360) - 180)
      : 999;
    const changed =
      !lastSent ||
      lastSent.moving !== pos.moving ||
      lastSent.lat !== pos.lat ||
      lastSent.lng !== pos.lng ||
      turned >= 4 ||
      lastSent.reservationId !== pos.reservationId;
    if (!force && now - lastSentAt < MIN_SEND_MS && turned < 30) return;
    if (!force && !changed && now - lastSentAt < HEARTBEAT_MS) return;
    lastSent = { ...pos };
    lastSentAt = now;
    send(lastSent);
    emitState();
  };

  // GPS
  let watchId: number | null = null;
  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        pos.lat = p.coords.latitude;
        pos.lng = p.coords.longitude;
        pos.accuracy = Math.round(p.coords.accuracy);
        pos.speed = typeof p.coords.speed === 'number' && !Number.isNaN(p.coords.speed) ? p.coords.speed : null;
        // GPS heading while driving is better than the compass (no magnets in an ambulance)
        if (pos.speed !== null && pos.speed > 2 && typeof p.coords.heading === 'number' && !Number.isNaN(p.coords.heading)) {
          pos.heading = Math.round(p.coords.heading);
        }
        if (pos.speed !== null && pos.speed > 1.5) lastMovingAt = serverNow();
        state.gps = 'ok';
        maybeSend();
      },
      (err) => {
        state.gps = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
        state.error = err.code === err.PERMISSION_DENIED ? 'Location is blocked. Allow it for this site.' : null;
        emitState();
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 }
    );
  } else {
    state.gps = 'unavailable';
  }

  // Compass: iPhone gives webkitCompassHeading; Android gives alpha on the "absolute" event
  const onOrientation = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    let heading: number | null = null;
    if (typeof ios === 'number' && !Number.isNaN(ios)) heading = ios;
    else if (typeof e.alpha === 'number') heading = (360 - e.alpha) % 360;
    if (heading === null) return;
    // While driving fast, GPS heading wins
    if (pos.speed !== null && pos.speed > 2) return;
    pos.heading = Math.round(heading);
    state.compass = 'ok';
    maybeSend();
  };
  const orientationEvent = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';

  // Accelerometer: shaking / walking / driving over a bump = moving
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    let magnitude: number | null = null;
    if (a && a.x !== null && a.y !== null && a.z !== null) {
      magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    } else if (e.accelerationIncludingGravity?.x != null) {
      const g = e.accelerationIncludingGravity;
      magnitude = Math.abs(Math.sqrt((g.x ?? 0) ** 2 + (g.y ?? 0) ** 2 + (g.z ?? 0) ** 2) - 9.81);
    }
    if (magnitude === null) return;
    state.motion = 'ok';
    motionAvg = motionAvg * 0.85 + magnitude * 0.15;
    const now = serverNow();
    if (motionAvg > 0.6) lastMovingAt = now;
    // Stopped after 3 s of calm
    const moving = now - lastMovingAt < 3_000;
    if (moving !== pos.moving) {
      pos.moving = moving;
      maybeSend(true);
    }
  };

  const startSensors = () => {
    window.addEventListener(orientationEvent, onOrientation as EventListener);
    window.addEventListener('devicemotion', onMotion);
    // No events after a few seconds: this device has no such sensor (e.g. a laptop)
    window.setTimeout(() => {
      if (state.compass === 'waiting') state.compass = 'unavailable';
      if (state.motion === 'waiting') state.motion = 'unavailable';
      emitState();
    }, 4_000);
  };

  // iPhone: motion and compass need a "yes" inside this tap
  const asker = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null) as PermissionAsker | null;
  const motionAsker = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : null) as PermissionAsker | null;
  if (asker?.requestPermission) {
    Promise.all([asker.requestPermission(), motionAsker?.requestPermission?.() ?? Promise.resolve('granted')])
      .then(([o, m]) => {
        if (o !== 'granted') state.compass = 'denied';
        if (m !== 'granted') state.motion = 'denied';
        startSensors();
      })
      .catch(() => {
        state.compass = 'denied';
        state.motion = 'denied';
        emitState();
      });
  } else {
    startSensors();
  }

  // Every second: calm for 3 s means stopped (even if the phone stops sending motion readings),
  // and a heartbeat so other screens know this ambulance is still there
  const heartbeat = window.setInterval(() => {
    if (pos.moving && serverNow() - lastMovingAt >= 3_000) {
      pos.moving = false;
      maybeSend(true);
    } else {
      maybeSend();
    }
  }, 1_000);
  emitState();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    window.removeEventListener(orientationEvent, onOrientation as EventListener);
    window.removeEventListener('devicemotion', onMotion);
    window.clearInterval(heartbeat);
    // Tell the other screens right away (a time of 0 is dropped at their next clean-up)
    if (lastSent) send({ ...lastSent, ts: 0 });
    live.delete(crew.id);
    publish();
    onState({ on: false, gps: state.gps, compass: state.compass, motion: state.motion, last: null, error: null });
    if (stopCurrent === stop) stopCurrent = null;
  };
  stopCurrent = stop;
  return stop;
}
