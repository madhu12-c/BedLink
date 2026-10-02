/**
 * Browser microphone recording for voice input.
 * Records with MediaRecorder (webm/ogg/mp4 depending on the browser), then converts
 * to 16 kHz mono WAV, a format Sarvam speech-to-text accepts on every browser.
 */

export type RecorderErrorReason = 'insecure' | 'unsupported' | 'denied' | 'no_mic' | 'failed';

export class VoiceRecorderError extends Error {
  constructor(
    public readonly reason: RecorderErrorReason,
    message: string
  ) {
    super(message);
    this.name = 'VoiceRecorderError';
  }
}

export interface RecordingResult {
  /** 16 kHz mono WAV. */
  wav: Blob;
  durationSec: number;
  /** Loudest 20 ms stretch (RMS, 0 to 1). Near zero means the mic picked up silence. */
  loudness: number;
}

export interface ActiveRecording {
  /** Stops recording and returns the audio. */
  stop(): Promise<RecordingResult>;
  /** Stops recording and throws the audio away. */
  cancel(): void;
}

const TARGET_SAMPLE_RATE = 16_000;
const LEVEL_INTERVAL_MS = 100;

/** Below this, a recording is treated as silence (wrong or muted microphone). */
export const SILENCE_LOUDNESS = 0.01;

type AudioContextConstructor = typeof AudioContext;

function getAudioContextClass(): AudioContextConstructor | null {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  const legacy = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return legacy.webkitAudioContext ?? null;
}

/**
 * Reports the live microphone level (0 to 1) so the user can see they are being heard.
 * The AudioContext is created before the first await so it starts inside the user's tap.
 */
function createLevelMeter(AudioCtx: AudioContextConstructor, onLevel: (level: number) => void) {
  const ctx = new AudioCtx();
  let timer: number | null = null;
  return {
    attach(stream: MediaStream) {
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 6));
      }, LEVEL_INTERVAL_MS);
    },
    close() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      void ctx.close();
    }
  };
}

export async function startRecording(options: {
  maxDurationMs: number;
  onAutoStop: () => void;
  onLevel?: (level: number) => void;
}): Promise<ActiveRecording> {
  if (!window.isSecureContext) {
    throw new VoiceRecorderError(
      'insecure',
      'The microphone only works over HTTPS (or on localhost).'
    );
  }
  const AudioCtx = getAudioContextClass();
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || !AudioCtx) {
    throw new VoiceRecorderError('unsupported', 'This browser cannot record audio.');
  }

  const meter = options.onLevel ? createLevelMeter(AudioCtx, options.onLevel) : null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    meter?.close();
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new VoiceRecorderError('denied', 'Microphone permission was denied. Allow it in the browser settings.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new VoiceRecorderError('no_mic', 'No microphone was found on this device.');
    }
    throw new VoiceRecorderError('failed', 'Could not start the microphone.');
  }

  const release = () => {
    meter?.close();
    stream.getTracks().forEach((t) => t.stop());
  };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream);
  } catch {
    release();
    throw new VoiceRecorderError('unsupported', 'This browser cannot record audio.');
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  meter?.attach(stream);

  const autoStopTimer = window.setTimeout(options.onAutoStop, options.maxDurationMs);

  return {
    stop() {
      window.clearTimeout(autoStopTimer);
      return new Promise<RecordingResult>((resolve, reject) => {
        const finish = async () => {
          release();
          try {
            const recorded = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            resolve(await convertToWav(recorded));
          } catch {
            reject(new VoiceRecorderError('failed', 'Could not process the recording.'));
          }
        };
        if (recorder.state === 'inactive') {
          void finish();
        } else {
          recorder.onstop = () => void finish();
          recorder.stop();
        }
      });
    },
    cancel() {
      window.clearTimeout(autoStopTimer);
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    }
  };
}

/** Loudest 20 ms window, as RMS. */
function measureLoudness(samples: Float32Array, sampleRate: number): number {
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  let loudest = 0;
  for (let start = 0; start < samples.length; start += frame) {
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    loudest = Math.max(loudest, Math.sqrt(sum / (end - start)));
  }
  return loudest;
}

async function convertToWav(recorded: Blob): Promise<RecordingResult> {
  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) throw new Error('AudioContext unavailable');

  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await recorded.arrayBuffer());
  } finally {
    void ctx.close();
  }

  // Resample and mix down to mono in one pass.
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  return {
    wav: encodeWav(samples, TARGET_SAMPLE_RATE),
    durationSec: samples.length / TARGET_SAMPLE_RATE,
    loudness: measureLoudness(samples, TARGET_SAMPLE_RATE)
  };
}

/** 16-bit PCM WAV encoder. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
