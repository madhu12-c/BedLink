'use client';

import React, { useState } from 'react';
import { Copy, ExternalLink, Send } from 'lucide-react';

type ConnectRole = 'nurse' | 'coordinator' | 'crew';

interface TelegramConnectButtonProps {
  role: ConnectRole;
  /** Nurse / coordinator links: the hospital (staff always get their own hospital's link). */
  hospitalId?: string;
  className?: string;
}

const TITLES: Record<ConnectRole, string> = {
  nurse: 'Update free beds from Telegram by text or voice note',
  coordinator: 'Get ambulance requests on Telegram with Accept / Reject buttons',
  crew: 'Hear on Telegram when a hospital accepts, says no, or BedLink moves on to the next one'
};

/**
 * Gets a signed "Connect Telegram" link, then shows it as a big link: tapping it opens the
 * BedLink bot, and pressing Start there connects that phone. Some Telegram apps skip the
 * Start button for a bot they already know, so the /start line is also shown to send by hand.
 */
export function TelegramConnectButton({ role, hospitalId, className = '' }: TelegramConnectButtonProps) {
  const [state, setState] = useState<{
    url?: string;
    code?: string;
    error?: string;
    loading?: boolean;
    copied?: boolean;
  }>({});

  const getLink = async () => {
    setState({ loading: true });
    try {
      const params = new URLSearchParams({ role, ...(hospitalId ? { hospitalId } : {}) });
      const res = await fetch(`/api/telegram/link?${params}`);
      const body = (await res.json().catch(() => ({}))) as { url?: string; code?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error || 'Could not make the link.');
      setState({ url: body.url, code: body.code });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : 'Could not make the link.' });
    }
  };

  if (state.url) {
    const startLine = state.code ? `/start ${state.code}` : null;
    const bot = new URL(state.url).pathname.slice(1);
    const copy = async () => {
      if (!startLine) return;
      try {
        await navigator.clipboard.writeText(startLine);
        setState((current) => ({ ...current, copied: true }));
      } catch {
        // No clipboard (e.g. plain http on a phone): the line is on screen to copy by hand
      }
    };

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm flex items-center justify-center gap-1.5 min-h-[44px]"
          title="Opens the BedLink bot in Telegram. Tap Start there to connect this phone."
        >
          <ExternalLink className="w-4 h-4" />
          Open Telegram, tap Start
        </a>
        {startLine && (
          <details className="text-xs text-slate-600 max-w-[300px]">
            <summary className="cursor-pointer select-none">No START button?</summary>
            <p className="mt-1">
              Send this message to <strong>@{bot}</strong>:
            </p>
            <div className="mt-1 flex items-start gap-1">
              <code className="flex-1 min-w-0 break-all rounded bg-slate-100 px-1.5 py-1 font-mono text-[11px] text-slate-800">
                {startLine}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                className="shrink-0 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 font-semibold flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                {state.copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void getLink()}
        disabled={state.loading}
        className="w-full px-3 py-2 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-sm flex items-center justify-center gap-1.5 min-h-[44px] disabled:opacity-60"
        title={TITLES[role]}
      >
        <Send className="w-4 h-4" />
        {state.loading ? 'Getting link…' : role === 'crew' ? 'Get updates on Telegram' : 'Connect Telegram'}
      </button>
      {state.error && <span className="text-xs text-red-700 max-w-[260px]">{state.error}</span>}
    </div>
  );
}
