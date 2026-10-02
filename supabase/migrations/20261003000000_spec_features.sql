-- BedLink: problem-statement features that must live in the database.
--
--   * hold_bed():        the hold is ONE atomic UPDATE ... WHERE available_beds > 0, so two
--                        ambulances can never both get the last bed
--   * adjust_bed_count(): nurses change counts by +1 / -1 on the server (no lost updates)
--   * cancel_hold():     dispatcher withdraws a pending hold, bed freed atomically
--   * tick_holds():      the 2-minute timeout (and "released" when no arrival by ETA + 15 min)
--                        runs in the database every 10 seconds (pg_cron), not in a browser
--   * statuses arrived / released / bed_lost, reliability score per hospital, and
--     Open / Busy / Diversion status per hospital
--   * bed types cardiac and burns; urgency and ETA travel with each hold; who updated the beds
--
-- Run in the Supabase SQL editor. Safe to run again. Works with or without
-- 20261002130000_role_based_access.sql (the role helpers are re-declared here).

-- ---------------------------------------------------------------------------
-- 1. Columns and allowed values
-- ---------------------------------------------------------------------------

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS ed_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS reliability INTEGER NOT NULL DEFAULT 100;
ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_ed_status_check;
ALTER TABLE public.hospitals ADD CONSTRAINT hospitals_ed_status_check CHECK (ed_status IN ('open', 'busy', 'diversion'));
ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_reliability_check;
ALTER TABLE public.hospitals ADD CONSTRAINT hospitals_reliability_check CHECK (reliability BETWEEN 0 AND 100);

ALTER TABLE public.bed_inventory ADD COLUMN IF NOT EXISTS updated_by_name TEXT;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS patient_urgency TEXT,
  ADD COLUMN IF NOT EXISTS eta_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_check CHECK (status IN (
  'pending', 'accepted', 'rejected', 'expired', 'cancelled', 'completed',
  'shadow', 'auto_released', 'arrived', 'released', 'bed_lost'
));

-- Bed types: add cardiac and burns everywhere a bed type is stored
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('bed_inventory', 'bed_type'),
      ('reservations', 'bed_type'),
      ('emergency_requests', 'required_bed_type'),
      ('bed_history_logs', 'bed_type')
    ) AS v(tbl, col)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t.tbl, t.tbl || '_' || t.col || '_check');
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IN (''icu'', ''ventilator'', ''oxygen'', ''cardiac'', ''burns'', ''emergency'', ''general''))',
        t.tbl, t.tbl || '_' || t.col || '_check', t.col
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Role helpers (same as the role-based access migration; harmless to re-declare)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.jwt() -> 'app_metadata' ->> 'role' IN ('dispatcher', 'nurse', 'coordinator', 'admin')
      THEN auth.jwt() -> 'app_metadata' ->> 'role'
  END
$$;

CREATE OR REPLACE FUNCTION public.current_hospital_id()
RETURNS UUID LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.jwt() -> 'app_metadata' ->> 'hospital_id'
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (auth.jwt() -> 'app_metadata' ->> 'hospital_id')::uuid
  END
$$;

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- The signed-in user as an audit actor, or NULL if they have no profile row (the actor
-- columns reference profiles, and a missing profile must never block a hold).
CREATE OR REPLACE FUNCTION public.bedlink_actor()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM profiles p WHERE p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 3. Reliability: changes automatically whenever a request's status changes
--    reject -2, timeout -5, bed lost on arrival -15, arrived +1 (kept between 0 and 100)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bedlink_reliability_on_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_delta INTEGER;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  v_delta := CASE NEW.status
    WHEN 'rejected' THEN -2
    WHEN 'expired' THEN -5
    WHEN 'bed_lost' THEN -15
    WHEN 'arrived' THEN 1
    WHEN 'completed' THEN 1   -- admitted (the hospital screen's "Admit")
    ELSE 0
  END;
  IF v_delta <> 0 THEN
    UPDATE hospitals
    SET reliability = GREATEST(0, LEAST(100, reliability + v_delta))
    WHERE id = NEW.hospital_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bedlink_reliability ON public.reservations;
CREATE TRIGGER bedlink_reliability
  AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.bedlink_reliability_on_status();

-- ---------------------------------------------------------------------------
-- 4. hold_bed: the race-safe hold
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hold_bed(
  p_reservation_id UUID,
  p_request_id UUID,
  p_hospital_id UUID,
  p_bed_type TEXT,
  p_urgency TEXT DEFAULT NULL,
  p_eta_minutes INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_left INTEGER;
  v_expires TIMESTAMPTZ;
  v_existing RECORD;
BEGIN
  IF NOT public.is_service_role()
     AND coalesce(public.current_app_role(), '') NOT IN ('dispatcher', 'admin') THEN
    RAISE EXCEPTION 'Only dispatchers can hold beds' USING ERRCODE = '42501';
  END IF;

  -- A retried call must not take a second bed
  SELECT id, status, expires_at INTO v_existing FROM reservations WHERE id = p_reservation_id;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
                              'status', v_existing.status, 'expires_at', v_existing.expires_at);
  END IF;

  IF EXISTS (SELECT 1 FROM hospitals WHERE id = p_hospital_id AND ed_status = 'diversion') THEN
    RETURN jsonb_build_object('success', false, 'error', 'diversion');
  END IF;

  -- The one atomic step: succeeds only while a bed is free
  UPDATE bed_inventory
  SET available_beds = available_beds - 1, updated_at = now()
  WHERE hospital_id = p_hospital_id AND bed_type = p_bed_type AND available_beds > 0
  RETURNING available_beds INTO v_left;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_bed');
  END IF;

  v_expires := now() + interval '2 minutes';
  INSERT INTO reservations (id, request_id, hospital_id, bed_type, status, requested_at, expires_at,
                            patient_urgency, eta_minutes)
  VALUES (p_reservation_id, p_request_id, p_hospital_id, p_bed_type, 'pending', now(), v_expires,
          p_urgency, p_eta_minutes);

  INSERT INTO reservation_events (reservation_id, event_type, actor_id, metadata)
  VALUES (p_reservation_id, 'reservation_created', public.bedlink_actor(),
          jsonb_build_object('hospital_id', p_hospital_id, 'bed_type', p_bed_type, 'expires_at', v_expires));

  UPDATE emergency_requests SET status = 'holding' WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'status', 'pending', 'expires_at', v_expires, 'available_beds', v_left);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. adjust_bed_count: +1 / -1 from the nurse screen, done on the server
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_bed_count(
  p_hospital_id UUID,
  p_bed_type TEXT,
  p_delta INTEGER,
  p_actor_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT := public.current_app_role();
  v_available INTEGER;
  v_total INTEGER;
BEGIN
  IF NOT public.is_service_role()
     AND NOT (v_role = 'admin'
              OR (v_role IN ('nurse', 'coordinator') AND p_hospital_id = public.current_hospital_id())) THEN
    RAISE EXCEPTION 'You can only change your own hospital''s beds' USING ERRCODE = '42501';
  END IF;

  UPDATE bed_inventory
  SET available_beds = GREATEST(0, LEAST(total_beds, available_beds + p_delta)),
      updated_at = now(),
      updated_by = public.bedlink_actor(),
      updated_by_name = coalesce(p_actor_name, updated_by_name)
  WHERE hospital_id = p_hospital_id AND bed_type = p_bed_type
  RETURNING available_beds, total_beds INTO v_available, v_total;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('success', true, 'available_beds', v_available, 'total_beds', v_total);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. cancel_hold: dispatcher withdraws a pending hold
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_hold(p_reservation_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res RECORD;
BEGIN
  IF NOT public.is_service_role()
     AND coalesce(public.current_app_role(), '') NOT IN ('dispatcher', 'admin') THEN
    RAISE EXCEPTION 'Only dispatchers can cancel holds' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_res FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_res.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending', 'status', v_res.status);
  END IF;

  UPDATE reservations SET status = 'cancelled', responded_at = now() WHERE id = p_reservation_id;
  UPDATE bed_inventory
  SET available_beds = LEAST(total_beds, available_beds + 1), updated_at = now()
  WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;
  INSERT INTO reservation_events (reservation_id, event_type, actor_id, metadata)
  VALUES (p_reservation_id, 'reservation_cancelled', public.bedlink_actor(), jsonb_build_object('hospital_id', v_res.hospital_id));

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. tick_holds: the server-side clock
--    pending past 2 minutes -> expired (bed back)
--    accepted with no arrival by ETA + 15 minutes -> released (bed back)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tick_holds()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Signed-out API callers get nothing; signed-in users, the service role and pg_cron may run it
  IF session_user = 'authenticator' AND public.current_app_role() IS NULL AND NOT public.is_service_role() THEN
    RETURN 0;
  END IF;

  FOR v_res IN
    SELECT * FROM reservations
    WHERE status = 'pending' AND expires_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE reservations SET status = 'expired', responded_at = now() WHERE id = v_res.id;
    UPDATE bed_inventory
    SET available_beds = LEAST(total_beds, available_beds + 1), updated_at = now()
    WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;
    INSERT INTO reservation_events (reservation_id, event_type, metadata)
    VALUES (v_res.id, 'reservation_expired', jsonb_build_object('reason', '2-minute timeout', 'by', 'server'));
    v_count := v_count + 1;
  END LOOP;

  FOR v_res IN
    SELECT * FROM reservations
    WHERE status = 'accepted' AND arrived_at IS NULL
      AND requested_at + make_interval(mins => coalesce(eta_minutes, 30) + 15) <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE reservations SET status = 'released', responded_at = now() WHERE id = v_res.id;
    UPDATE bed_inventory
    SET available_beds = LEAST(total_beds, available_beds + 1), updated_at = now()
    WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;
    INSERT INTO reservation_events (reservation_id, event_type, metadata)
    VALUES (v_res.id, 'reservation_released', jsonb_build_object('reason', 'No arrival by ETA + 15 min'));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. set_ed_status: Open / Busy / Diversion (coordinator for own hospital, admin any)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_ed_status(p_hospital_id UUID, p_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT := public.current_app_role();
BEGIN
  IF NOT public.is_service_role()
     AND NOT (v_role = 'admin'
              OR (v_role = 'coordinator' AND p_hospital_id = public.current_hospital_id())) THEN
    RAISE EXCEPTION 'Only the hospital coordinator can change this' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'busy', 'diversion') THEN
    RAISE EXCEPTION 'Unknown status %', p_status;
  END IF;
  UPDATE hospitals SET ed_status = p_status WHERE id = p_hospital_id;
  RETURN jsonb_build_object('success', true, 'ed_status', p_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Who may call what
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.hold_bed(UUID, UUID, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_bed_count(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_hold(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tick_holds() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_ed_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hold_bed(UUID, UUID, UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_bed_count(UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_hold(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tick_holds() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_ed_status(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Run the clock every 10 seconds (pg_cron). If pg_cron is not available, open
--     BedLink screens call tick_holds() themselves.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bedlink-tick-holds') THEN
    PERFORM cron.unschedule('bedlink-tick-holds');
  END IF;
  PERFORM cron.schedule('bedlink-tick-holds', '10 seconds', 'select public.tick_holds()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%). Open BedLink screens will run the timer instead.', SQLERRM;
END $$;
