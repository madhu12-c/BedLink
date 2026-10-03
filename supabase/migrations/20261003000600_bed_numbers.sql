-- =============================================================================
-- BedLink: the same bed numbers on every screen, and counts that always add up
--
-- Before, each phone picked its own red / green beds (the nurse's phone could show beds 5-8
-- taken while the coordinator's laptop showed 1-4), and the coordinator's "+ / - seat" wrote
-- whole numbers that could overwrite a hold or a nurse's change made a moment earlier.
--
--   * bed_inventory.occupied_beds: which bed numbers are taken, stored with the counts
--   * a trigger keeps it in line with the count on EVERY change (holds, timeouts, Telegram,
--     the nurse's +/-, demo reset): highest numbers are freed first, lowest free taken first
--     (lib/data/bedNumbers.ts uses the same rule, so screens show the change before it saves)
--   * set_bed_occupied(): the nurse taps one bed number; number and count change together
--   * adjust_total_beds(): the coordinator adds / removes beds as +N / -N on the server
--
-- Run in the Supabase SQL editor. Safe to run more than once.
-- =============================================================================

ALTER TABLE public.bed_inventory ADD COLUMN IF NOT EXISTS occupied_beds INTEGER[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 1. The rule: bring the taken bed numbers in line with the count
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bedlink_fit_occupied(p_occupied INTEGER[], p_total INTEGER, p_available INTEGER)
RETURNS INTEGER[] LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_total INTEGER := GREATEST(coalesce(p_total, 0), 0);
  v_target INTEGER := v_total - LEAST(GREATEST(coalesce(p_available, 0), 0), v_total);
  v_kept INTEGER[];
BEGIN
  -- Valid numbers only, and if too many are taken keep the lowest (frees the highest)
  SELECT coalesce(array_agg(n ORDER BY n), '{}') INTO v_kept
  FROM (
    SELECT DISTINCT n FROM unnest(coalesce(p_occupied, '{}'::INTEGER[])) AS n
    WHERE n BETWEEN 1 AND v_total
    ORDER BY n
    LIMIT v_target
  ) k;

  -- Too few taken: take the lowest free numbers
  IF cardinality(v_kept) < v_target THEN
    SELECT array_agg(n ORDER BY n) INTO v_kept
    FROM (
      SELECT unnest(v_kept) AS n
      UNION ALL
      (SELECT s FROM generate_series(1, v_total) AS s
       WHERE NOT (s = ANY (v_kept))
       ORDER BY s
       LIMIT v_target - cardinality(v_kept))
    ) a;
  END IF;

  RETURN coalesce(v_kept, '{}');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Every write to bed_inventory goes through the rule (and counts stay in range)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bedlink_keep_bed_numbers()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.total_beds := GREATEST(coalesce(NEW.total_beds, 0), 0);
  NEW.available_beds := LEAST(GREATEST(coalesce(NEW.available_beds, 0), 0), NEW.total_beds);
  NEW.occupied_beds := public.bedlink_fit_occupied(NEW.occupied_beds, NEW.total_beds, NEW.available_beds);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bedlink_keep_bed_numbers ON public.bed_inventory;
CREATE TRIGGER bedlink_keep_bed_numbers
  BEFORE INSERT OR UPDATE ON public.bed_inventory
  FOR EACH ROW EXECUTE FUNCTION public.bedlink_keep_bed_numbers();

-- Fill the numbers for the rows already there (beds 1..taken)
UPDATE public.bed_inventory SET occupied_beds = occupied_beds;

-- ---------------------------------------------------------------------------
-- 3. set_bed_occupied: nurse / coordinator taps one bed number
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_bed_occupied(
  p_hospital_id UUID,
  p_bed_type TEXT,
  p_bed_no INTEGER,
  p_occupied BOOLEAN,
  p_actor_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT := public.current_app_role();
  v_row RECORD;
  v_occupied INTEGER[];
  v_available INTEGER;
BEGIN
  IF NOT public.is_service_role()
     AND NOT (v_role = 'admin'
              OR (v_role IN ('nurse', 'coordinator') AND p_hospital_id = public.current_hospital_id())) THEN
    RAISE EXCEPTION 'You can only change your own hospital''s beds' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM bed_inventory
  WHERE hospital_id = p_hospital_id AND bed_type = p_bed_type
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF p_bed_no IS NULL OR p_bed_no < 1 OR p_bed_no > v_row.total_beds THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_such_bed');
  END IF;

  v_occupied := public.bedlink_fit_occupied(v_row.occupied_beds, v_row.total_beds, v_row.available_beds);

  -- Already that way (a double tap, or another phone did it first): nothing to change
  IF coalesce(p_occupied, false) = (p_bed_no = ANY (v_occupied)) THEN
    RETURN jsonb_build_object('success', true, 'available_beds', v_row.available_beds,
                              'total_beds', v_row.total_beds, 'occupied_beds', to_jsonb(v_occupied));
  END IF;

  IF p_occupied THEN
    v_occupied := array_append(v_occupied, p_bed_no);
  ELSE
    v_occupied := array_remove(v_occupied, p_bed_no);
  END IF;

  UPDATE bed_inventory
  SET occupied_beds = v_occupied,
      available_beds = total_beds - cardinality(v_occupied),
      updated_at = now(),
      updated_by = public.bedlink_actor(),
      updated_by_name = coalesce(p_actor_name, updated_by_name)
  WHERE id = v_row.id
  RETURNING available_beds, occupied_beds INTO v_available, v_occupied;

  RETURN jsonb_build_object('success', true, 'available_beds', v_available,
                            'total_beds', v_row.total_beds, 'occupied_beds', to_jsonb(v_occupied));
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. adjust_total_beds: coordinator adds or removes beds (+N / -N, done on the server)
--    Removing takes free beds only. A bed type the hospital doesn't have yet is created.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_total_beds(
  p_hospital_id UUID,
  p_bed_type TEXT,
  p_total_delta INTEGER,
  p_free_delta INTEGER,
  p_actor_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT := public.current_app_role();
  v_row RECORD;
  v_total INTEGER;
  v_available INTEGER;
BEGIN
  IF NOT public.is_service_role()
     AND NOT (v_role = 'admin'
              OR (v_role = 'coordinator' AND p_hospital_id = public.current_hospital_id())) THEN
    RAISE EXCEPTION 'Only the hospital coordinator can add or remove beds' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM bed_inventory
  WHERE hospital_id = p_hospital_id AND bed_type = p_bed_type
  FOR UPDATE;

  IF NOT FOUND THEN
    IF coalesce(p_total_delta, 0) <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at, updated_by, updated_by_name)
    VALUES (p_hospital_id, p_bed_type, p_total_delta, LEAST(GREATEST(coalesce(p_free_delta, 0), 0), p_total_delta),
            now(), public.bedlink_actor(), p_actor_name)
    RETURNING total_beds, available_beds INTO v_total, v_available;
    RETURN jsonb_build_object('success', true, 'total_beds', v_total, 'available_beds', v_available);
  END IF;

  IF v_row.total_beds + p_total_delta < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'last_bed');
  END IF;
  IF p_total_delta < 0 AND v_row.available_beds < -p_total_delta THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_free');
  END IF;

  UPDATE bed_inventory
  SET total_beds = total_beds + p_total_delta,
      available_beds = LEAST(GREATEST(available_beds + coalesce(p_free_delta, 0), 0), total_beds + p_total_delta),
      updated_at = now(),
      updated_by = public.bedlink_actor(),
      updated_by_name = coalesce(p_actor_name, updated_by_name)
  WHERE id = v_row.id
  RETURNING total_beds, available_beds INTO v_total, v_available;

  RETURN jsonb_build_object('success', true, 'total_beds', v_total, 'available_beds', v_available);
END;
$$;

REVOKE ALL ON FUNCTION public.set_bed_occupied(UUID, TEXT, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_total_beds(UUID, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_bed_occupied(UUID, TEXT, INTEGER, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_total_beds(UUID, TEXT, INTEGER, INTEGER, TEXT) TO authenticated, service_role;
