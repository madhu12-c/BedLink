'use client';

import React, { useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { bedLinkStore } from '@/lib/data/store';
import { QuickMessage } from '@/lib/types';

interface QuickMessagesProps {
  reservationId: string;
  /** Which side this screen is. */
  from: QuickMessage['from'];
  author: string;
  className?: string;
}

const PRESETS: Record<QuickMessage['from'], string[]> = {
  crew: ['Patient unconscious', 'CPR in progress', 'Patient stable', 'Arriving in 5 min', 'At the gate'],
  hospital: ['Use gate 2', 'Trauma bay ready', 'Cath lab ready', 'Go straight to ICU', 'Team waiting at entry']
};

/**
 * Two-way quick messages for one request (like a short radio call): one tap on a preset, or a
 * short typed note. Messages reach the other screen live. No patient names.
 */
export function QuickMessages({ reservationId, from, author, className = '' }: QuickMessagesProps) {
  const [, setVersion] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-render when a message arrives (from this or another device)
  useEffect(
    () =>
      bedLinkStore.subscribe((event) => {
        if (event.type === 'reservation_message') setVersion((v) => v + 1);
      }),
    []
  );

  const messages = bedLinkStore.getMessages(reservationId).slice(-6);
  const otherSide = from === 'crew' ? 'Hospital' : 'Ambulance';

  const send = (text: string) => {
    try {
      bedLinkStore.sendMessage(reservationId, from, text, author);
      setDraft('');
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    }
  };

  return (
    <section
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-col gap-2 ${className}`}
      aria-label={`Messages with the ${otherSide.toLowerCase()}`}
    >
      <div className="flex items-center text-xs font-bold text-slate-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-600" />
          Messages with the {otherSide.toLowerCase()}
        </div>
      </div>

      {messages.length > 0 && (
        <ul className="flex flex-col gap-1.5 max-h-40 overflow-y-auto" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.from === from ? 'justify-end' : 'justify-start'}`}>
              <span
                className={`max-w-[85%] px-2.5 py-1.5 rounded-xl text-xs ${
                  m.from === from ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'
                }`}
              >
                <span className="block font-semibold">{m.text}</span>
                <span className="block text-xs opacity-75" suppressHydrationWarning>
                  {m.from === from ? 'You' : m.author || otherSide} ·{' '}
                  {new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PRESETS[from].map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => send(text)}
            className="text-xs font-semibold px-2.5 min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-800"
          >
            {text}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor={`msg-${reservationId}`} className="sr-only">
          Short message
        </label>
        <input
          id={`msg-${reservationId}`}
          value={draft}
          maxLength={140}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Short note (no patient names)"
          className="flex-1 min-w-0 px-3 text-sm border border-slate-300 rounded-lg min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
        />
        <button
          type="submit"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </section>
  );
}
