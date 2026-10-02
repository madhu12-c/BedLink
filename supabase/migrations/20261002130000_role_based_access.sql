-- BedLink role-based access
--
-- Who someone is comes from Supabase Auth, not from a table the user can write:
--   app_metadata.role         dispatcher | nurse | coordinator | admin
--   app_metadata.hospital_id  the one hospital a nurse or coordinator belongs to
-- Only the service role can change app_metadata (scripts/create-demo-users.mjs does it),
-- so nobody can promote themselves from the browser.
--
-- Run this in the Supabase SQL editor after the schema migration and setup_and_seed.sql.
-- setup_and_seed.sql turns RLS off again, so re-run this file every time that one is run.
-- It is safe to run again. After it runs, the anon (signed-out) key can read nothing.
-- Note: a role or hospital change reaches a user's token on their next sign-in
-- (or token refresh, up to 1 hour).

-- ---------------------------------------------------------------------------
-- 1. Helpers: read role and hospital from the signed-in user's verified JWT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.jwt() -> 'app_metadata' ->> 'role' IN ('dispatcher', 'nurse', 'coordinator', 'admin')
      THEN auth.jwt() -> 'app_metadata' ->> 'role'
  END
$$;

CREATE OR REPLACE FUNCTION public.current_hospital_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.jwt() -> 'app_metadata' ->> 'hospital_id'
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (auth.jwt() -> 'app_metadata' ->> 'hospital_id')::uuid
  END
$$;

-- True for calls made with the service role key (server scripts), which skip role checks.
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_hospital_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_service_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_hospital_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Turn RLS back on (setup_and_seed.sql turned it off) and drop every old policy,
--    including the open "Anon public ..." demo policies and "Users can update own
--    profile", which let any user change their own role.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bed_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations', 'profiles', 'hospitals', 'hospital_capabilities', 'bed_inventory',
        'emergency_requests', 'hospital_matches', 'reservations', 'reservation_events',
        'bed_history_logs', 'patient_handovers'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Policies. Everything is for signed-in users with a BedLink role; anon gets nothing.
--    Admins can do everything.
-- ---------------------------------------------------------------------------

-- Admin: full access everywhere
CREATE POLICY "admin_all" ON public.organizations FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.hospitals FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.hospital_capabilities FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.bed_inventory FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.emergency_requests FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.hospital_matches FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.reservations FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY "admin_all" ON public.reservation_events FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

-- Profiles: everyone reads only their own row. Nobody but admin / service role writes.
CREATE POLICY "read_own_profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Reference data: any BedLink role can read
CREATE POLICY "role_read" ON public.organizations FOR SELECT TO authenticated
  USING (public.current_app_role() IS NOT NULL);
CREATE POLICY "role_read" ON public.hospitals FOR SELECT TO authenticated
  USING (public.current_app_role() IS NOT NULL);
CREATE POLICY "role_read" ON public.hospital_capabilities FOR SELECT TO authenticated
  USING (public.current_app_role() IS NOT NULL);

-- Bed inventory: every role reads (dispatch ranks all hospitals)
CREATE POLICY "role_read" ON public.bed_inventory FOR SELECT TO authenticated
  USING (public.current_app_role() IS NOT NULL);

-- Nurses and coordinators change bed counts only for their own hospital
CREATE POLICY "staff_update_own_hospital_beds" ON public.bed_inventory FOR UPDATE TO authenticated
  USING (
    public.current_app_role() IN ('nurse', 'coordinator')
    AND hospital_id = public.current_hospital_id()
  )
  WITH CHECK (
    public.current_app_role() IN ('nurse', 'coordinator')
    AND hospital_id = public.current_hospital_id()
  );

-- Only coordinators add new bed types / wards, for their own hospital
CREATE POLICY "coordinator_add_own_hospital_beds" ON public.bed_inventory FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'coordinator'
    AND hospital_id = public.current_hospital_id()
  );

-- TEMPORARY: the dispatch screen still writes the held bed count from the browser
-- (lib/supabase/sync.ts). Remove this policy once holds go through hold_bed_atomic().
CREATE POLICY "dispatcher_update_beds_for_holds" ON public.bed_inventory FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'dispatcher')
  WITH CHECK (public.current_app_role() = 'dispatcher');

-- Emergency requests: dispatchers create and manage; hospital staff see the ones sent to them
CREATE POLICY "dispatcher_read" ON public.emergency_requests FOR SELECT TO authenticated
  USING (public.current_app_role() = 'dispatcher');
CREATE POLICY "dispatcher_insert" ON public.emergency_requests FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() = 'dispatcher');
CREATE POLICY "dispatcher_update" ON public.emergency_requests FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'dispatcher')
  WITH CHECK (public.current_app_role() = 'dispatcher');
CREATE POLICY "staff_read_requests_sent_to_own_hospital" ON public.emergency_requests FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('nurse', 'coordinator')
    AND EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.request_id = emergency_requests.id
        AND r.hospital_id = public.current_hospital_id()
    )
  );

-- Hospital matches (ranking results): dispatchers only
CREATE POLICY "dispatcher_read" ON public.hospital_matches FOR SELECT TO authenticated
  USING (public.current_app_role() = 'dispatcher');
CREATE POLICY "dispatcher_insert" ON public.hospital_matches FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() = 'dispatcher');

-- Reservations
CREATE POLICY "dispatcher_read" ON public.reservations FOR SELECT TO authenticated
  USING (public.current_app_role() = 'dispatcher');
CREATE POLICY "dispatcher_insert" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() = 'dispatcher');
-- TEMPORARY: the dispatch screen marks timed-out holds as expired from the browser.
-- Remove once expiry runs server-side through expire_reservation_atomic().
CREATE POLICY "dispatcher_update_for_expiry" ON public.reservations FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'dispatcher')
  WITH CHECK (public.current_app_role() = 'dispatcher');
CREATE POLICY "staff_read_own_hospital" ON public.reservations FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('nurse', 'coordinator')
    AND hospital_id = public.current_hospital_id()
  );
-- Only the coordinator accepts or rejects, and only for their own hospital
CREATE POLICY "coordinator_respond_own_hospital" ON public.reservations FOR UPDATE TO authenticated
  USING (
    public.current_app_role() = 'coordinator'
    AND hospital_id = public.current_hospital_id()
  )
  WITH CHECK (
    public.current_app_role() = 'coordinator'
    AND hospital_id = public.current_hospital_id()
  );

-- Reservation events (audit trail): append-only, signed with the real user's id
CREATE POLICY "dispatcher_read" ON public.reservation_events FOR SELECT TO authenticated
  USING (public.current_app_role() = 'dispatcher');
CREATE POLICY "dispatcher_insert" ON public.reservation_events FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'dispatcher'
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );
CREATE POLICY "staff_read_own_hospital" ON public.reservation_events FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('nurse', 'coordinator')
    AND EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_events.reservation_id
        AND r.hospital_id = public.current_hospital_id()
    )
  );
CREATE POLICY "coordinator_insert_own_hospital" ON public.reservation_events FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'coordinator'
    AND (actor_id IS NULL OR actor_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = reservation_events.reservation_id
        AND r.hospital_id = public.current_hospital_id()
    )
  );

-- Bed history and patient handovers (tables from setup_and_seed.sql; skipped if it has not
-- created them yet). They hold patient details, so only the coordinator of that hospital
-- (and admins) can see or write them.
DO $$
BEGIN
  IF to_regclass('public.bed_history_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.bed_history_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$
      CREATE POLICY "admin_all" ON public.bed_history_logs FOR ALL TO authenticated
        USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin')
    $p$;
    EXECUTE $p$
      CREATE POLICY "coordinator_own_hospital" ON public.bed_history_logs FOR ALL TO authenticated
        USING (public.current_app_role() = 'coordinator' AND hospital_id = public.current_hospital_id())
        WITH CHECK (public.current_app_role() = 'coordinator' AND hospital_id = public.current_hospital_id())
    $p$;
  END IF;

  IF to_regclass('public.patient_handovers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.patient_handovers ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$
      CREATE POLICY "admin_all" ON public.patient_handovers FOR ALL TO authenticated
        USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin')
    $p$;
    EXECUTE $p$
      CREATE POLICY "coordinator_own_hospital" ON public.patient_handovers FOR ALL TO authenticated
        USING (
          public.current_app_role() = 'coordinator'
          AND destination_hospital_id = public.current_hospital_id()
        )
        WITH CHECK (
          public.current_app_role() = 'coordinator'
          AND destination_hospital_id = public.current_hospital_id()
        )
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Atomic RPCs: these run as SECURITY DEFINER (they skip RLS), so they check the
--    caller's role themselves. Signed-out (anon) callers can no longer run them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hold_bed_atomic(
    p_request_id UUID,
    p_hospital_id UUID,
    p_bed_type TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inv_id UUID;
    v_available INTEGER;
    v_reservation_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF NOT public.is_service_role()
       AND coalesce(public.current_app_role(), '') NOT IN ('dispatcher', 'admin') THEN
        RAISE EXCEPTION 'Only dispatchers can hold beds' USING ERRCODE = '42501';
    END IF;
    -- Signed-in callers always act as themselves
    IF NOT public.is_service_role() THEN
        p_actor_id := auth.uid();
    END IF;

    -- 1. Row-level lock on bed_inventory to prevent race condition
    SELECT id, available_beds
    INTO v_inv_id, v_available
    FROM bed_inventory
    WHERE hospital_id = p_hospital_id AND bed_type = p_bed_type
    FOR UPDATE;

    IF v_inv_id IS NULL THEN
        RAISE EXCEPTION 'Bed inventory record not found for hospital % and type %', p_hospital_id, p_bed_type;
    END IF;

    IF v_available <= 0 THEN
        RAISE EXCEPTION 'Resource conflict: No available beds of type % remaining at this hospital', p_bed_type;
    END IF;

    -- 2. Decrement available bed count
    UPDATE bed_inventory
    SET available_beds = available_beds - 1,
        updated_at = now(),
        updated_by = p_actor_id
    WHERE id = v_inv_id;

    -- 3. Calculate 2-minute expiration
    v_expires_at := now() + interval '2 minutes';

    -- 4. Create reservation row
    INSERT INTO reservations (request_id, hospital_id, bed_type, status, requested_at, expires_at)
    VALUES (p_request_id, p_hospital_id, p_bed_type, 'pending', now(), v_expires_at)
    RETURNING id INTO v_reservation_id;

    -- 5. Record audit event
    INSERT INTO reservation_events (reservation_id, event_type, actor_id, metadata)
    VALUES (
        v_reservation_id,
        'reservation_created',
        p_actor_id,
        jsonb_build_object('hospital_id', p_hospital_id, 'bed_type', p_bed_type, 'expires_at', v_expires_at)
    );

    -- 6. Update request status to holding
    UPDATE emergency_requests SET status = 'holding' WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'expires_at', v_expires_at,
        'status', 'pending'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_reservation_atomic(
    p_reservation_id UUID,
    p_action TEXT, -- 'accept' or 'reject'
    p_actor_id UUID,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_res RECORD;
BEGIN
    IF NOT public.is_service_role()
       AND coalesce(public.current_app_role(), '') NOT IN ('coordinator', 'admin') THEN
        RAISE EXCEPTION 'Only hospital coordinators can accept or reject requests' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_service_role() THEN
        p_actor_id := auth.uid();
    END IF;

    -- Lock reservation row
    SELECT * INTO v_res FROM reservations WHERE id = p_reservation_id FOR UPDATE;

    IF v_res IS NULL THEN
        RAISE EXCEPTION 'Reservation not found';
    END IF;

    -- Coordinators may only answer requests sent to their own hospital
    IF public.current_app_role() = 'coordinator'
       AND v_res.hospital_id IS DISTINCT FROM public.current_hospital_id() THEN
        RAISE EXCEPTION 'You can only answer requests for your own hospital' USING ERRCODE = '42501';
    END IF;

    IF v_res.status != 'pending' THEN
        RAISE EXCEPTION 'Reservation is already in status: %', v_res.status;
    END IF;

    -- Check if already expired
    IF v_res.expires_at <= now() THEN
        UPDATE reservations SET status = 'expired', responded_at = now() WHERE id = p_reservation_id;

        -- Return bed to inventory
        UPDATE bed_inventory
        SET available_beds = available_beds + 1, updated_at = now(), updated_by = p_actor_id
        WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;

        INSERT INTO reservation_events (reservation_id, event_type, actor_id, metadata)
        VALUES (
            p_reservation_id,
            'reservation_expired',
            p_actor_id,
            jsonb_build_object('reason', 'Response attempted after 2-minute deadline')
        );

        RETURN jsonb_build_object('success', false, 'status', 'expired', 'error', 'Reservation expired');
    END IF;

    IF p_action = 'accept' THEN
        UPDATE reservations
        SET status = 'accepted', responded_at = now(), accepted_by = p_actor_id
        WHERE id = p_reservation_id;

        UPDATE emergency_requests SET status = 'matched' WHERE id = v_res.request_id;

        INSERT INTO reservation_events (reservation_id, event_type, actor_id, metadata)
        VALUES (p_reservation_id, 'reservation_accepted', p_actor_id, jsonb_build_object('accepted_at', now()));

        RETURN jsonb_build_object('success', true, 'status', 'accepted');

    ELSIF p_action = 'reject' THEN
        UPDATE reservations
        SET status = 'rejected', responded_at = now(), rejection_reason = p_rejection_reason
        WHERE id = p_reservation_id;

        -- Reclaim the held bed back into available inventory
        UPDATE bed_inventory
        SET available_beds = available_beds + 1, updated_at = now(), updated_by = p_actor_id
        WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;

        INSERT INTO reservation_events (reservation_id, event_type, actor_id, metadata)
        VALUES (p_reservation_id, 'reservation_rejected', p_actor_id, jsonb_build_object('reason', p_rejection_reason));

        RETURN jsonb_build_object('success', true, 'status', 'rejected');
    ELSE
        RAISE EXCEPTION 'Invalid action: %', p_action;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_reservation_atomic(
    p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_res RECORD;
BEGIN
    -- Expiring is safe for any role: it only acts once the 2-minute deadline has passed
    IF NOT public.is_service_role() AND public.current_app_role() IS NULL THEN
        RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_res FROM reservations WHERE id = p_reservation_id FOR UPDATE;

    IF v_res IS NULL THEN
        RAISE EXCEPTION 'Reservation not found';
    END IF;

    IF v_res.status = 'pending' AND v_res.expires_at <= now() THEN
        UPDATE reservations SET status = 'expired', responded_at = now() WHERE id = p_reservation_id;

        -- Restore inventory
        UPDATE bed_inventory
        SET available_beds = available_beds + 1, updated_at = now()
        WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;

        INSERT INTO reservation_events (reservation_id, event_type, metadata)
        VALUES (
            p_reservation_id,
            'reservation_expired',
            jsonb_build_object('expired_at', now(), 'timeout_seconds', 120)
        );

        RETURN jsonb_build_object('success', true, 'status', 'expired');
    END IF;

    RETURN jsonb_build_object('success', false, 'status', v_res.status, 'message', 'Not eligible for expiration');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hold_bed_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_reservation_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_reservation_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hold_bed_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_reservation_atomic(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_reservation_atomic(UUID) TO authenticated, service_role;
