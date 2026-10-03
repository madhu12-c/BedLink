-- =============================================================================
-- BedLink: one Telegram chat can hold several roles
-- Before, a chat was either a nurse or a coordinator: opening the other link replaced it.
-- Now each role is its own row (one hospital per role), so the same phone can be nurse and
-- coordinator at once (and ambulance crew, through telegram_crew_links). Safe to run more than once.
-- =============================================================================

DO $$
DECLARE
  pkey TEXT;
BEGIN
  -- The old primary key was chat_id alone
  SELECT conname INTO pkey
  FROM pg_constraint
  WHERE conrelid = 'public.telegram_links'::regclass AND contype = 'p' AND array_length(conkey, 1) = 1;

  IF pkey IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.telegram_links DROP CONSTRAINT %I', pkey);
    ALTER TABLE public.telegram_links ADD PRIMARY KEY (chat_id, role);
  END IF;
END $$;
