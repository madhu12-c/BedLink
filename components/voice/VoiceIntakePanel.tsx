'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Lock, Mic, RotateCcw, Square, Volume2, X } from 'lucide-react';
import { BedType, Urgency } from '@/lib/types';
import { VoiceAvailability } from '@/lib/voice/hooks';
import {
  applyVoiceIntake,
  hasAnyIntakeField,
  IntakeFormValues,
  VoiceErrorBody,
  VoiceIntakeResult
} from '@/lib/voice/intake';
import { VoiceConfirmResult } from '@/lib/voice/confirm';
import { getLanguageLabel, VoiceLanguageCode } from '@/lib/voice/languages';
import { dispatchEventPhrase, intakeReadbackPhrase, SpokenPhrase } from '@/lib/voice/phrases';
import {
  ActiveRecording,
  RecordingResult,
  SILENCE_LOUDNESS,
  startRecording,
  VoiceRecorderError
} from '@/lib/voice/recorder';

const MAX_SECONDS = 20;
const ANSWER_SECONDS = 5;
const MIN_SECONDS = 0.7;
// Live level above this counts as "the mic is hearing something".
const HEARD_LEVEL = 0.08;

const BED_LABELS: Record<BedType, string> = {
  icu: 'ICU',
  ventilator: 'Ventilator',
  oxygen: 'Oxygen',
  cardiac: 'Cardiac',
  burns: 'Burns',
  emergency: 'Emergency',
  general: 'General ward'
};

const SPECIALTY_LABELS: Record<string, string> = {
  none: 'None',
  cardiac: 'Cardiac',
  burns: 'Burns',
  trauma: 'Trauma',
  neuro: 'Neurology',
  pediatric: 'Pediatrics'
};

const URGENCY_LABELS: Record<Urgency, string> = {
  critical: 'Critical',
  urgent: 'Urgent',
  normal: 'Normal'
};

export interface VoiceBestMatch {
  hospitalId: string;
  hospitalName: string;
  etaMinutes: number;
  freeBeds: number;
}

type Phase =
  | 'idle'
  | 'recording' // listening to the patient's needs
  | 'processing' // understanding them
  | 'review' // showing what was understood
  | 'asking' // reading back the best match and asking "hold this bed?"
  | 'answer_recording' // listening for yes / no
  | 'answer_processing' // understanding the answer
  | 'error';

const REVIEW_PHASES: readonly Phase[] = ['review', 'asking', 'answer_recording', 'answer_processing'];

/** What the crew is reviewing: what was understood and the hospital that would be held. */
interface ReviewState {
  result: VoiceIntakeResult;
  values: IntakeFormValues;
  match: VoiceBestMatch | null;
}

type ApiResponse<T> = { success: true; result: T } | VoiceErrorBody;

const SILENCE_MESSAGE =
  'Your microphone recorded silence. Check the right mic is selected and not muted: click the mic icon in the address bar, or Windows Settings > Sound > Input.';

interface VoiceIntakePanelProps {
  availability: VoiceAvailability;
  currentForm: IntakeFormValues;
  /** Best hospital for these needs right now, or null if none has the bed. */
  findBestMatch: (values: IntakeFormValues) => VoiceBestMatch | null;
  /** Fill the dispatch form only. */
  onApply: (values: IntakeFormValues, languageCode: VoiceLanguageCode) => void;
  /** Fill the dispatch form and hold the bed at this hospital. */
  onHold: (values: IntakeFormValues, languageCode: VoiceLanguageCode, hospitalId: string) => void;
  /** Whether spoken replies are on. When off, nothing is read out and the crew uses the buttons. */
  canSpeak: boolean;
  speakAndWait: (phrase: SpokenPhrase) => Promise<void>;
  /** Language to reply in, given the language the crew spoke. */
  speakLanguageFor: (spoken: VoiceLanguageCode) => VoiceLanguageCode;
  /** Called on the mic tap so later spoken replies are allowed to play. */
  onUnlockAudio: () => void;
  /** Voice settings controls, shown under the heading. */
  settingsSlot?: React.ReactNode;
  className?: string;
}

/**
 * Lets the ambulance crew speak the patient's needs in their own language, hear the
 * best match read back, and hold that bed by saying "haan" / "hoy" / "yes" or by tapping.
 * Nothing is held without that explicit yes or tap.
 */
export function VoiceIntakePanel(props: VoiceIntakePanelProps) {
  const { availability, settingsSlot, className = '' } = props;

  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [heardSomething, setHeardSomething] = useState(false);
  // Last recording, so the user can play it back when something goes wrong.
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const recordingRef = useRef<ActiveRecording | null>(null);
  const tickRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  // Bumped whenever the crew starts something new, so older async steps stop quietly.
  const flowRef = useRef(0);
  // Async steps read the latest props (form, ranking, callbacks) instead of stale ones.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const stopTicking = () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const keepRecordingForPlayback = (wav: Blob | null) => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = wav ? URL.createObjectURL(wav) : null;
    setRecordingUrl(recordingUrlRef.current);
  };

  useEffect(() => {
    return () => {
      flowRef.current += 1;
      recordingRef.current?.cancel();
      abortRef.current?.abort();
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  /** Stops whatever is in progress and starts a new flow. */
  const beginFlow = () => {
    flowRef.current += 1;
    recordingRef.current?.cancel();
    recordingRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    stopTicking();
    return flowRef.current;
  };

  const fail = (message: string) => {
    setError(message);
    setPhase('error');
  };

  const reset = () => {
    setReview(null);
    setError(null);
    setNote(null);
    setPhase('idle');
  };

  const backToReview = (message: string) => {
    setNote(message);
    setPhase('review');
  };

  /** Starts the mic. Returns an error message, or null when recording has started. */
  const startMic = async (flow: number, maxSeconds: number, onAutoStop: () => void): Promise<string | null> => {
    setLevel(0);
    setHeardSomething(false);
    let recording: ActiveRecording;
    try {
      recording = await startRecording({
        maxDurationMs: maxSeconds * 1000,
        onAutoStop,
        onLevel: (value) => {
          setLevel(value);
          if (value > HEARD_LEVEL) setHeardSomething(true);
        }
      });
    } catch (err) {
      return err instanceof VoiceRecorderError ? err.message : 'Could not start the microphone.';
    }
    if (flowRef.current !== flow) {
      recording.cancel();
      return 'cancelled';
    }
    recordingRef.current = recording;
    const startedAt = Date.now();
    setSeconds(0);
    tickRef.current = window.setInterval(() => {
      setSeconds(Math.min(maxSeconds, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);
    return null;
  };

  /** Stops the mic. Returns the recording, or a reason it is not usable. */
  const stopMic = async (): Promise<{ recorded: RecordingResult } | { problem: string }> => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    stopTicking();
    if (!recording) return { problem: 'Nothing was recorded.' };

    let recorded: RecordingResult;
    try {
      recorded = await recording.stop();
    } catch (err) {
      return { problem: err instanceof Error ? err.message : 'Could not process the recording.' };
    }
    keepRecordingForPlayback(recorded.wav);
    // Catch microphone problems here instead of sending silence to the server.
    if (recorded.durationSec < MIN_SECONDS) {
      return { problem: 'That was too short. Tap, wait until it says "Listening", then speak.' };
    }
    if (recorded.loudness < SILENCE_LOUDNESS) return { problem: SILENCE_MESSAGE };
    return { recorded };
  };

  const postAudio = async <T,>(url: string, wav: Blob): Promise<T> => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const form = new FormData();
      form.append('audio', wav, 'speech.wav');
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) throw err;
        throw new Error('Network problem while sending the recording. Try again.');
      }
      const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
      if (!body || !body.success) {
        throw new Error(body?.error ?? `Voice request failed (${res.status}).`);
      }
      return body.result;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  // ── Step 1: the crew describes the patient ──

  const startListening = async () => {
    propsRef.current.onUnlockAudio();
    const flow = beginFlow();
    setError(null);
    setNote(null);
    setReview(null);
    keepRecordingForPlayback(null);
    const problem = await startMic(flow, MAX_SECONDS, () => void finishListening(flow));
    if (problem === 'cancelled') return;
    if (problem) fail(problem);
    else setPhase('recording');
  };

  const finishListening = async (flow: number) => {
    if (flowRef.current !== flow || !recordingRef.current) return;
    setPhase('processing');

    const stopped = await stopMic();
    if (flowRef.current !== flow) return;
    if ('problem' in stopped) {
      fail(stopped.problem);
      return;
    }

    let result: VoiceIntakeResult;
    try {
      result = await postAudio<VoiceIntakeResult>('/api/voice/intake', stopped.recorded.wav);
    } catch (err) {
      if (flowRef.current === flow) fail(err instanceof Error ? err.message : 'Voice request failed.');
      return;
    }
    if (flowRef.current !== flow) return;

    const { currentForm, findBestMatch } = propsRef.current;
    const values = applyVoiceIntake(currentForm, result.fields);
    const understood = hasAnyIntakeField(result.fields);
    const state: ReviewState = { result, values, match: understood ? findBestMatch(values) : null };
    setReview(state);
    setNote(null);
    setPhase('review');
    if (understood) void readBackAndAsk(flow, state);
  };

  // ── Step 2: read back the best match and ask "hold this bed?" ──

  const readBackAndAsk = async (flow: number, state: ReviewState) => {
    const { canSpeak, speakAndWait, speakLanguageFor } = propsRef.current;
    if (!canSpeak) return;
    setPhase('asking');
    const { match } = state;
    await speakAndWait(
      intakeReadbackPhrase(
        {
          ...state.values,
          topMatch: match
            ? { hospitalName: match.hospitalName, etaMinutes: match.etaMinutes, freeBeds: match.freeBeds }
            : null,
          askToHold: match !== null
        },
        speakLanguageFor(state.result.languageCode)
      )
    );
    if (flowRef.current !== flow) return;
    if (match) await listenForAnswer(flow, state);
    else setPhase('review');
  };

  // ── Step 3: hear "haan" / "hoy" / "yes" (hold) or "nahin" / "no" (don't) ──

  const listenForAnswer = async (flow: number, state: ReviewState) => {
    setNote(null);
    const problem = await startMic(flow, ANSWER_SECONDS, () => void finishAnswer(flow, state));
    if (problem === 'cancelled') return;
    if (problem) backToReview(problem);
    else setPhase('answer_recording');
  };

  const finishAnswer = async (flow: number, state: ReviewState) => {
    if (flowRef.current !== flow || !recordingRef.current) return;
    setPhase('answer_processing');

    const stopped = await stopMic();
    if (flowRef.current !== flow) return;
    if ('problem' in stopped) {
      backToReview("Didn't hear an answer. Tap a button below, or answer by voice again.");
      return;
    }

    let answer: VoiceConfirmResult;
    try {
      answer = await postAudio<VoiceConfirmResult>('/api/voice/confirm', stopped.recorded.wav);
    } catch (err) {
      if (flowRef.current === flow) backToReview(err instanceof Error ? err.message : 'Could not check the answer.');
      return;
    }
    if (flowRef.current !== flow) return;

    if (answer.answer === 'yes' && state.match) {
      hold(state, state.match);
      return;
    }
    if (answer.answer === 'no') {
      backToReview('Not held. Tap a button below when ready.');
      const { canSpeak, speakAndWait, speakLanguageFor } = propsRef.current;
      if (canSpeak) void speakAndWait(dispatchEventPhrase({ kind: 'not_held' }, speakLanguageFor(state.result.languageCode)));
      return;
    }
    backToReview(`Heard "${answer.transcript || '…'}". Say "haan" or "yes" to hold, or tap the button.`);
  };

  // ── Actions ──

  const hold = (state: ReviewState, match: VoiceBestMatch) => {
    beginFlow();
    propsRef.current.onHold(state.values, state.result.languageCode, match.hospitalId);
    reset();
  };

  const applyOnly = (state: ReviewState) => {
    beginFlow();
    propsRef.current.onApply(state.values, state.result.languageCode);
    reset();
  };

  const discard = () => {
    beginFlow();
    reset();
  };

  const answerByVoice = (state: ReviewState) => {
    propsRef.current.onUnlockAudio();
    const flow = beginFlow();
    void listenForAnswer(flow, state);
  };

  const ready = availability === 'ready';
  const inReview = review !== null && REVIEW_PHASES.includes(phase);
  const understoodSomething = review ? hasAnyIntakeField(review.result.fields) : false;
  const match = review?.match ?? null;

  return (
    <section
      className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3 ${className}`}
      aria-label="Voice patient intake"
    >
      <div>
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Mic className="w-4 h-4 text-blue-600" />
          Speak patient needs
        </h2>
        <p className="text-xs text-slate-500">
          Any Indian language or English. Say the bed, ventilator, condition and how serious it is. No names.
        </p>
      </div>

      {settingsSlot}

      {/* Idle / error: the mic button */}
      {(phase === 'idle' || phase === 'error') && (
        <>
          <button
            type="button"
            onClick={() => void startListening()}
            disabled={!ready}
            aria-label="Start voice input"
            className={`w-full py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[52px] transition-all ${
              ready
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-[0.98]'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            <Mic className="w-5 h-5" />
            {availability === 'checking'
              ? 'Checking voice…'
              : ready
                ? 'Tap and speak'
                : 'Voice input is not set up'}
          </button>
          {ready && phase === 'idle' && (
            <p className="text-xs text-slate-400 italic">
              e.g. &ldquo;ICU chahiye, ventilator bhi, heart attack, patient critical hai&rdquo;. Then say
              &ldquo;haan&rdquo; to hold the best bed.
            </p>
          )}
          {phase === 'error' && error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex flex-col gap-2" role="alert">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {recordingUrl && <RecordingPlayback url={recordingUrl} />}
            </div>
          )}
        </>
      )}

      {/* Recording the patient's needs */}
      {phase === 'recording' && (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <button
            type="button"
            onClick={() => void finishListening(flowRef.current)}
            aria-label="Stop recording and send"
            className="w-full py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[52px] bg-red-600 hover:bg-red-700 text-white shadow-md"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            <Square className="w-4 h-4" />
            Listening… tap to finish ({seconds}s / {MAX_SECONDS}s)
          </button>
          <MicLevel level={level} heard={heardSomething} />
          {!heardSomething && seconds >= 2 && (
            <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Not hearing anything yet. Speak up, or check that the right microphone is selected and not muted.
            </p>
          )}
          <button
            type="button"
            onClick={discard}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 self-center inline-flex items-center gap-1 min-h-[36px]"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      )}

      {phase === 'processing' && <BusyStrip text="Understanding what was said…" />}

      {/* Review: nothing is held until the crew says yes or taps */}
      {inReview && review && (
        <div className="flex flex-col gap-2.5" aria-live="polite">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              Heard ({getLanguageLabel(review.result.languageCode)})
            </span>
            <p className="text-sm text-slate-900 mt-0.5">&ldquo;{review.result.transcript}&rdquo;</p>
          </div>

          {review.result.parser === 'keywords' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              The AI step was unavailable, so only clear keywords were matched. Please check before using.
            </p>
          )}

          {understoodSomething ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <ReviewRow label="Bed" value={BED_LABELS[review.values.bedType]} heard={review.result.fields.bedType !== null} />
              <ReviewRow
                label="Ventilator"
                value={review.values.requiresVentilator ? 'Yes' : 'No'}
                heard={review.result.fields.requiresVentilator !== null}
              />
              <ReviewRow
                label="Specialty"
                value={SPECIALTY_LABELS[review.values.specialty] ?? review.values.specialty}
                heard={review.result.fields.specialty !== null}
              />
              <ReviewRow
                label="Urgency"
                value={URGENCY_LABELS[review.values.urgency]}
                heard={review.result.fields.urgency !== null}
              />
              {review.values.notes && <ReviewRow label="Notes" value={review.values.notes} heard />}
            </dl>
          ) : (
            <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
              No bed details were found in what was said. Try again and mention the bed type, for example
              &ldquo;ICU&rdquo; or &ldquo;oxygen&rdquo;.
            </p>
          )}

          {understoodSomething && (
            <div
              className={`p-2.5 rounded-lg border text-xs ${
                match ? 'bg-blue-50 border-blue-200 text-blue-950' : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {match ? (
                <>
                  <span className="font-bold">Best match:</span> {match.hospitalName} · {match.etaMinutes} min ·{' '}
                  {match.freeBeds} {BED_LABELS[review.values.bedType]} free
                </>
              ) : (
                'No hospital has this bed free right now. Fill the form to see partial matches.'
              )}
            </div>
          )}

          {/* Voice question / answer status */}
          {phase === 'asking' && (
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-800" role="status">
              <Volume2 className="w-4 h-4 animate-pulse shrink-0" />
              Reading back… then say &ldquo;haan&rdquo; / &ldquo;hoy&rdquo; / &ldquo;yes&rdquo; to hold.
            </div>
          )}
          {phase === 'answer_recording' && (
            <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-red-200 bg-red-50" role="status">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                  Listening for &ldquo;haan&rdquo; / &ldquo;yes&rdquo; or &ldquo;nahin&rdquo; / &ldquo;no&rdquo; ({ANSWER_SECONDS - seconds}s)
                </span>
                <button
                  type="button"
                  onClick={() => void finishAnswer(flowRef.current, review)}
                  className="text-xs font-bold text-red-800 underline min-h-[32px] px-1"
                >
                  Done
                </button>
              </div>
              <MicLevel level={level} heard={heardSomething} />
            </div>
          )}
          {phase === 'answer_processing' && <BusyStrip text="Checking your answer…" />}

          {note && (
            <p className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2" role="status">
              {note}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {match ? (
              <>
                <button
                  type="button"
                  onClick={() => hold(review, match)}
                  className="col-span-2 py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                >
                  <Lock className="w-4 h-4" />
                  Hold bed at {match.hospitalName}
                </button>
                <button
                  type="button"
                  onClick={() => applyOnly(review)}
                  className="py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 min-h-[40px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Fill form only
                </button>
                <button
                  type="button"
                  onClick={() => answerByVoice(review)}
                  disabled={phase !== 'review'}
                  className="py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 min-h-[40px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Mic className="w-3.5 h-3.5" />
                  Answer by voice
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => applyOnly(review)}
                disabled={!understoodSomething}
                className="col-span-2 py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <CheckCircle2 className="w-5 h-5" />
                Use these details
              </button>
            )}
            <button
              type="button"
              onClick={() => void startListening()}
              className="py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 min-h-[40px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Record again
            </button>
            <button
              type="button"
              onClick={discard}
              className="py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 min-h-[40px] bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <X className="w-3.5 h-3.5" />
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewRow({ label, value, heard }: { label: string; value: string; heard: boolean }) {
  return (
    <>
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="text-slate-900 font-semibold">
        {value}
        {!heard && <span className="ml-1.5 text-xs font-normal text-slate-400">(not mentioned)</span>}
      </dd>
    </>
  );
}

function MicLevel({ level, heard }: { level: number; heard: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0">Mic</span>
      <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${heard ? 'bg-emerald-500' : 'bg-slate-400'}`}
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
    </div>
  );
}

function BusyStrip({ text }: { text: string }) {
  return (
    <div
      className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 min-h-[48px] bg-blue-50 text-blue-800 border border-blue-200"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-5 h-5 animate-spin" />
      {text}
    </div>
  );
}

function RecordingPlayback({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-600">Play what the mic recorded:</span>
      <audio controls src={url} className="w-full h-9" aria-label="Your last recording" />
    </div>
  );
}
