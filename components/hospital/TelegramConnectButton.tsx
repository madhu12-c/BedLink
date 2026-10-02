'use client';

import React, { useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';

interface TelegramConnectButtonProps {
  hospitalId: string;
  role: 'nurse' | 'coordinator';
}

/**
 * Gets this hospital's signed "Connect Telegram" link, then shows it as a big link: tapping
 * it opens the BedLink bot, and pressing Start there connects that phone.
 */
export function TelegramConnectButton({ hospitalId, role }: TelegramConnectButtonProps) {
  const [state, setState] = useState<{ url?: string; error?: string; loading?: boolean }>({});

  const getLink = async () => {
    setState({ loading: true });
    try {
      const params = new URLSearchParams({ hospitalId, role });
      const res = await fetch(`/api/telegram/link?${params}`);
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error || 'Could not make the link.');
      setState({ url: body.url });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : 'Could not make the link.' });
    }
  };

  if (state.url) {
    return (
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm flex items-center gap-1.5 min-h-[44px]"
        title="Opens the BedLink bot in Telegram. Tap Start there to connect this phone."
      >
        <ExternalLink className="w-4 h-4" />
        Open in Telegram, then tap Start
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void getLink()}
        disabled={state.loading}
        className="px-3 py-2 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold text-sm flex items-center gap-1.5 min-h-[44px] disabled:opacity-60"
        title={
          role === 'coordinator'
            ? 'Get ambulance requests on Telegram with Accept / Reject buttons'
            : 'Update free beds from Telegram by text or voice note'
        }
      >
        <Send className="w-4 h-4" />
        {state.loading ? 'Getting link…' : 'Connect Telegram'}
      </button>
      {state.error && <span className="text-xs text-red-700 max-w-[260px]">{state.error}</span>}
    </div>
  );
}
