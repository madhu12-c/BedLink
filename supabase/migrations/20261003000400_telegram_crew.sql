-- =============================================================================
-- BedLink: Telegram updates for the ambulance crew
-- A dispatcher's phone linked with "Get updates on Telegram" on the dispatch screen hears
-- when a hospital is asked, when it accepts, and when BedLink moves on to the next one.
-- Only the server (service role) reads or writes these tables. Safe to run more than once.
-- =============================================================================

-- Which Telegram chat follows which dispatcher account. Separate from telegram_links, so the
-- same phone can also be linked as a nurse or coordinator.
CREATE TABLE IF NOT EXISTS public.telegram_crew_links (
  chat_id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_crew_links_user_idx ON public.telegram_crew_links (user_id);

-- One message per hold and step, even when two screens report the same change
CREATE TABLE IF NOT EXISTS public.telegram_notices (
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (reservation_id, chat_id, kind)
);

-- Row-level security on with no policies: browsers can't see or change these
ALTER TABLE public.telegram_crew_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_crew_links FROM anon, authenticated;
REVOKE ALL ON public.telegram_notices FROM anon, authenticated;
