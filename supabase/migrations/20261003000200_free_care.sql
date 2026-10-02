-- =============================================================================
-- BedLink: free care for patients who can't pay
--   govt    = government / municipal hospital: free for everyone
--   charity = charitable trust hospital: by Maharashtra law (Bombay Public Trusts Act
--             scheme) 10% of beds free for poor patients and 10% at concession
--   NULL    = not known
-- Safe to run more than once.
-- =============================================================================

ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS free_care TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospitals_free_care_check') THEN
    ALTER TABLE public.hospitals
      ADD CONSTRAINT hospitals_free_care_check CHECK (free_care IN ('govt', 'charity'));
  END IF;
END $$;

-- Government / municipal hospitals in the seed data
UPDATE public.hospitals SET free_care = 'govt' WHERE id IN (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',  -- Dr. Babasaheb Ambedkar Shatabdi Hospital
  '10000000-0000-4000-8000-000000000002',  -- Bhagwati Municipal General Hospital
  '10000000-0000-4000-8000-000000000003',  -- Siddharth Municipal General Hospital
  '10000000-0000-4000-8000-000000000008',  -- Dr. R.N. Cooper Municipal General Hospital
  '10000000-0000-4000-8000-000000000012',  -- Lokmanya Tilak Municipal General Hospital (Sion)
  '10000000-0000-4000-8000-000000000013'   -- KEM Hospital
);

-- Charitable trust hospitals
UPDATE public.hospitals SET free_care = 'charity' WHERE id IN (
  '10000000-0000-4000-8000-000000000005',  -- Holy Spirit Hospital
  '10000000-0000-4000-8000-000000000007',  -- Nanavati Max Super Speciality Hospital
  '10000000-0000-4000-8000-000000000010',  -- Lilavati Hospital
  '10000000-0000-4000-8000-000000000011'   -- P.D. Hinduja Hospital
);
