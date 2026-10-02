-- =============================================================================
-- BedLink: Telegram bot
-- Which Telegram chat belongs to which hospital (and as nurse or coordinator).
-- A chat is linked by tapping the signed "Connect Telegram" link on the hospital screen.
-- Only the server (service role) reads or writes this table. Safe to run more than once.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_links (
  chat_id BIGINT PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('nurse', 'coordinator')),
  display_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- last "are the counts still right?" reminder, so nurses get at most one per 30 minutes
  last_nudged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS telegram_links_hospital_idx ON public.telegram_links (hospital_id);

-- Row-level security on with no policies: browsers can't see or change links
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_links FROM anon, authenticated;
