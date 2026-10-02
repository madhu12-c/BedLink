import { SpokenPhrase } from './phrases';

/**
 * Plays BedLink announcements one at a time.
 *
 * Browsers block audio until the person has tapped the page, so the player starts
 * "locked". Anything queued while locked waits (status "blocked") and plays after
 * the next tap, unless it has gone stale by then.
 */

export type VoicePlayerStatus = 'idle' | 'loading' | 'playing' | 'blocked' | 'error';

export interface VoicePlayerSnapshot {
  status: VoicePlayerStatus;
  error: string | null;
}

interface QueuedPhrase {
  phrase: SpokenPhrase;
  queuedAt: number;
  /** Resolves a speakAndWait() caller once this phrase has finished or been skipped. */
  done?: () => void;
}

/** A 50 ms silent WAV, played on the first tap so later announcements are allowed to play. */
function createSilentClipUrl(): string {
  const samples = 400;
  const sampleRate = 8000;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const ascii = (offset: number, text: string) =>
    [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }));
}

const MAX_WAITING = 2; // keep only the newest announcements when they pile up
const STALE_AFTER_MS = 30_000; // don't announce something that happened long ago
const MAX_CACHED_CLIPS = 24;

const IDLE_SNAPSHOT: VoicePlayerSnapshot = { status: 'idle', error: null };

export class VoicePlayer {
  private audio: HTMLAudioElement | null = null;
  /** Phrases waiting to play (not including the one playing now). */
  private queue: QueuedPhrase[] = [];
  private running = false;
  /** Ends the clip that is playing now; used by stop(). */
  private finishCurrentClip: (() => void) | null = null;
  private unlocked = false;
  private clipUrls = new Map<string, string>();
  private listeners = new Set<() => void>();
  private snapshot: VoicePlayerSnapshot = IDLE_SNAPSHOT;
  private silentClipUrl: string | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): VoicePlayerSnapshot => this.snapshot;

  getServerSnapshot = (): VoicePlayerSnapshot => IDLE_SNAPSHOT;

  /** Call from a tap or key press so the browser allows audio. */
  unlock = () => {
    if (this.unlocked || this.running) return;
    const audio = this.getAudio();
    this.silentClipUrl ??= createSilentClipUrl();
    audio.src = this.silentClipUrl;
    audio
      .play()
      .then(() => {
        this.unlocked = true;
        if (this.snapshot.status === 'blocked') this.setSnapshot('idle', null);
        void this.pump();
      })
      .catch(() => {
        // Still locked; the next tap will try again.
      });
  };

  speak = (phrase: SpokenPhrase) => {
    this.enqueue({ phrase, queuedAt: Date.now() });
  };

  /**
   * Speaks and resolves once the phrase has finished (or was skipped, failed or blocked),
   * so the caller can start listening for a spoken reply straight after.
   */
  speakAndWait = (phrase: SpokenPhrase): Promise<void> =>
    new Promise<void>((resolve) => this.enqueue({ phrase, queuedAt: Date.now(), done: resolve }));

  stop = () => {
    this.queue.forEach((item) => item.done?.());
    this.queue = [];
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    this.finishCurrentClip?.();
    if (this.snapshot.status !== 'error') this.setSnapshot('idle', null);
  };

  private enqueue(item: QueuedPhrase) {
    this.queue.push(item);
    while (this.queue.length > MAX_WAITING) {
      this.queue.shift()?.done?.();
    }
    void this.pump();
  }

  dispose = () => {
    this.stop();
    this.clipUrls.forEach((url) => URL.revokeObjectURL(url));
    this.clipUrls.clear();
    if (this.silentClipUrl) {
      URL.revokeObjectURL(this.silentClipUrl);
      this.silentClipUrl = null;
    }
  };

  private getAudio(): HTMLAudioElement {
    if (!this.audio) this.audio = new Audio();
    return this.audio;
  }

  private setSnapshot(status: VoicePlayerStatus, error: string | null) {
    if (this.snapshot.status === status && this.snapshot.error === error) return;
    this.snapshot = { status, error };
    this.listeners.forEach((l) => l());
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      let item: QueuedPhrase | undefined;
      while ((item = this.queue.shift())) {
        if (Date.now() - item.queuedAt > STALE_AFTER_MS) {
          item.done?.();
          continue;
        }
        try {
          this.setSnapshot('loading', null);
          const url = await this.fetchClip(item.phrase);
          this.setSnapshot('playing', null);
          await this.play(url);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            // Wait for a tap; unlock() resumes the queue. A question someone is waiting on
            // is released instead of being replayed later, out of context.
            this.setSnapshot('blocked', 'Tap anywhere to turn on voice updates.');
            if (item.done) item.done();
            else this.queue.unshift(item);
            return;
          }
          this.setSnapshot('error', err instanceof Error ? err.message : 'Could not play voice update.');
        }
        item.done?.();
      }
      if (this.snapshot.status !== 'error') this.setSnapshot('idle', null);
    } finally {
      this.running = false;
    }
  }

  private async fetchClip(phrase: SpokenPhrase): Promise<string> {
    const key = `${phrase.sourceLanguage}>${phrase.targetLanguage}|${phrase.text}`;
    const cached = this.clipUrls.get(key);
    if (cached) return cached;

    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(phrase)
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Voice update failed (${res.status}).`);
    }
    const url = URL.createObjectURL(await res.blob());

    if (this.clipUrls.size >= MAX_CACHED_CLIPS) {
      const [oldestKey, oldestUrl] = this.clipUrls.entries().next().value as [string, string];
      URL.revokeObjectURL(oldestUrl);
      this.clipUrls.delete(oldestKey);
    }
    this.clipUrls.set(key, url);
    return url;
  }

  private play(url: string): Promise<void> {
    const audio = this.getAudio();
    return new Promise<void>((resolve, reject) => {
      const finish = () => {
        this.finishCurrentClip = null;
        resolve();
      };
      this.finishCurrentClip = finish;
      audio.onended = finish;
      audio.onerror = () => {
        this.finishCurrentClip = null;
        reject(new Error('Could not play the voice clip.'));
      };
      audio.src = url;
      audio.play().catch((err: unknown) => {
        this.finishCurrentClip = null;
        reject(err);
      });
    });
  }
}
