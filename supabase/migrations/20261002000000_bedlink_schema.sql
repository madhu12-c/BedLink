-- BedLink Database Schema Migration
-- Emergency Hospital Bed Coordination System

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'hospital_network', -- 'hospital_network', 'ems_agency', 'regional_authority'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Profiles (Users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('dispatcher', 'nurse', 'coordinator', 'admin')),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    hospital_id UUID, -- Set for hospital staff
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Hospitals
CREATE TABLE IF NOT EXISTS hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    emergency_capacity INTEGER NOT NULL DEFAULT 50,
    current_load INTEGER NOT NULL DEFAULT 60, -- Percentage 0-100
    load_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key back to profiles hospital_id
ALTER TABLE profiles 
ADD CONSTRAINT fk_profiles_hospital 
FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL;

-- 4. Hospital Capabilities (specialties)
CREATE TABLE IF NOT EXISTS hospital_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    capability TEXT NOT NULL, -- 'cardiac', 'burns', 'trauma', 'neuro', 'pediatric'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(hospital_id, capability)
);

-- 5. Bed Inventory
CREATE TABLE IF NOT EXISTS bed_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    bed_type TEXT NOT NULL CHECK (bed_type IN ('icu', 'ventilator', 'oxygen', 'emergency', 'general')),
    total_beds INTEGER NOT NULL DEFAULT 10 CHECK (total_beds >= 0),
    available_beds INTEGER NOT NULL DEFAULT 5 CHECK (available_beds >= 0 AND available_beds <= total_beds),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(hospital_id, bed_type)
);

-- 6. Emergency Requests
CREATE TABLE IF NOT EXISTS emergency_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatcher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    patient_latitude DOUBLE PRECISION NOT NULL,
    patient_longitude DOUBLE PRECISION NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('critical', 'urgent', 'normal')),
    required_bed_type TEXT NOT NULL CHECK (required_bed_type IN ('icu', 'ventilator', 'oxygen', 'emergency', 'general')),
    required_specialty TEXT, -- e.g. 'cardiac', 'burns', etc.
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'holding', 'matched', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Hospital Matches
CREATE TABLE IF NOT EXISTS hospital_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES emergency_requests(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    bed_match_score NUMERIC NOT NULL,
    travel_score NUMERIC NOT NULL,
    freshness_score NUMERIC NOT NULL,
    load_score NUMERIC NOT NULL,
    total_score NUMERIC NOT NULL,
    eta_minutes INTEGER NOT NULL,
    distance_km NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES emergency_requests(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    bed_type TEXT NOT NULL CHECK (bed_type IN ('icu', 'ventilator', 'oxygen', 'emergency', 'general')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled', 'completed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 minutes'),
    responded_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT
);

-- 9. Reservation Events (Audit Trail)
CREATE TABLE IF NOT EXISTS reservation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'reservation_created', 'reservation_accepted', 'reservation_rejected', 'reservation_expired', 'fallback_triggered'
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for high-frequency emergency queries
CREATE INDEX IF NOT EXISTS idx_hospitals_location ON hospitals(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_bed_inventory_hospital_type ON bed_inventory(hospital_id, bed_type);
CREATE INDEX IF NOT EXISTS idx_hospital_capabilities_lookup ON hospital_capabilities(hospital_id, capability);
CREATE INDEX IF NOT EXISTS idx_reservations_status_expires ON reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_hospital ON reservations(hospital_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_request ON reservations(request_id);
CREATE INDEX IF NOT EXISTS idx_reservation_events_reservation ON reservation_events(reservation_id);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_dispatcher ON emergency_requests(dispatcher_id);

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bed_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_events ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES

-- Profiles: Authenticated users can view profiles; only self can update
CREATE POLICY "Public profiles can be viewed by authenticated users"
ON profiles FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

-- Hospitals & Capabilities: viewable by authenticated users
CREATE POLICY "Hospitals viewable by authenticated"
ON hospitals FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Capabilities viewable by authenticated"
ON hospital_capabilities FOR SELECT TO authenticated
USING (true);

-- Bed Inventory: Viewable by authenticated; updatable by hospital staff for their hospital or admins
CREATE POLICY "Bed inventory viewable by authenticated"
ON bed_inventory FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Hospital staff can update own hospital beds"
ON bed_inventory FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND (profiles.hospital_id = bed_inventory.hospital_id OR profiles.role = 'admin')
    )
);

-- Emergency Requests: Dispatchers can create and view; hospital staff can view if relevant
CREATE POLICY "Emergency requests viewable by authenticated"
ON emergency_requests FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Dispatchers can create emergency requests"
ON emergency_requests FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('dispatcher', 'admin')
    )
);

CREATE POLICY "Dispatchers can update own emergency requests"
ON emergency_requests FOR UPDATE TO authenticated
USING (
    dispatcher_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- Reservations: Viewable by hospital staff for their hospital, and dispatcher who created request
CREATE POLICY "Reservations viewable by involved parties"
ON reservations FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND (
            profiles.hospital_id = reservations.hospital_id OR 
            profiles.role IN ('dispatcher', 'admin')
        )
    )
);

CREATE POLICY "Dispatchers can create reservations"
ON reservations FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('dispatcher', 'admin')
    )
);

CREATE POLICY "Hospital staff can update reservation response"
ON reservations FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND (profiles.hospital_id = reservations.hospital_id OR profiles.role = 'admin')
    )
);

-- Reservation Events: viewable by involved parties
CREATE POLICY "Events viewable by authenticated"
ON reservation_events FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Events insertable by authenticated"
ON reservation_events FOR INSERT TO authenticated
WITH CHECK (true);

-- ATOMIC STORED PROCEDURES (RPC)

-- 1. hold_bed_atomic: Atomically locks inventory, checks availability, decrements, and reserves
CREATE OR REPLACE FUNCTION hold_bed_atomic(
    p_request_id UUID,
    p_hospital_id UUID,
    p_bed_type TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv_id UUID;
    v_available INTEGER;
    v_reservation_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
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
    INSERT INTO reservations (
        request_id,
        hospital_id,
        bed_type,
        status,
        requested_at,
        expires_at
    ) VALUES (
        p_request_id,
        p_hospital_id,
        p_bed_type,
        'pending',
        now(),
        v_expires_at
    ) RETURNING id INTO v_reservation_id;

    -- 5. Record audit event
    INSERT INTO reservation_events (
        reservation_id,
        event_type,
        actor_id,
        metadata
    ) VALUES (
        v_reservation_id,
        'reservation_created',
        p_actor_id,
        jsonb_build_object(
            'hospital_id', p_hospital_id,
            'bed_type', p_bed_type,
            'expires_at', v_expires_at
        )
    );

    -- 6. Update request status to holding
    UPDATE emergency_requests
    SET status = 'holding'
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'expires_at', v_expires_at,
        'status', 'pending'
    );
END;
$$;

-- 2. respond_reservation_atomic: Hospital staff accepts or rejects
CREATE OR REPLACE FUNCTION respond_reservation_atomic(
    p_reservation_id UUID,
    p_action TEXT, -- 'accept' or 'reject'
    p_actor_id UUID,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res RECORD;
BEGIN
    -- Lock reservation row
    SELECT * INTO v_res
    FROM reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF v_res IS NULL THEN
        RAISE EXCEPTION 'Reservation not found';
    END IF;

    IF v_res.status != 'pending' THEN
        RAISE EXCEPTION 'Reservation is already in status: %', v_res.status;
    END IF;

    -- Check if already expired
    IF v_res.expires_at <= now() THEN
        -- Mark as expired
        UPDATE reservations
        SET status = 'expired',
            responded_at = now()
        WHERE id = p_reservation_id;

        -- Return bed to inventory
        UPDATE bed_inventory
        SET available_beds = available_beds + 1,
            updated_at = now(),
            updated_by = p_actor_id
        WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;

        INSERT INTO reservation_events (
            reservation_id,
            event_type,
            actor_id,
            metadata
        ) VALUES (
            p_reservation_id,
            'reservation_expired',
            p_actor_id,
            jsonb_build_object('reason', 'Response attempted after 2-minute deadline')
        );

        RETURN jsonb_build_object('success', false, 'status', 'expired', 'error', 'Reservation expired');
    END IF;

    IF p_action = 'accept' THEN
        UPDATE reservations
        SET status = 'accepted',
            responded_at = now(),
            accepted_by = p_actor_id
        WHERE id = p_reservation_id;

        UPDATE emergency_requests
        SET status = 'matched'
        WHERE id = v_res.request_id;

        INSERT INTO reservation_events (
            reservation_id,
            event_type,
            actor_id,
            metadata
        ) VALUES (
            p_reservation_id,
            'reservation_accepted',
            p_actor_id,
            jsonb_build_object('accepted_at', now())
        );

        RETURN jsonb_build_object('success', true, 'status', 'accepted');

    ELSIF p_action = 'reject' THEN
        UPDATE reservations
        SET status = 'rejected',
            responded_at = now(),
            rejection_reason = p_rejection_reason
        WHERE id = p_reservation_id;

        -- Reclaim the held bed back into available inventory
        UPDATE bed_inventory
        SET available_beds = available_beds + 1,
            updated_at = now(),
            updated_by = p_actor_id
        WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;

        INSERT INTO reservation_events (
            reservation_id,
            event_type,
            actor_id,
            metadata
        ) VALUES (
            p_reservation_id,
            'reservation_rejected',
            p_actor_id,
            jsonb_build_object('reason', p_rejection_reason)
        );

        RETURN jsonb_build_object('success', true, 'status', 'rejected');
    ELSE
        RAISE EXCEPTION 'Invalid action: %', p_action;
    END IF;
END;
$$;

-- 3. expire_reservation_atomic: Authoritative backend timeout check
CREATE OR REPLACE FUNCTION expire_reservation_atomic(
    p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res RECORD;
BEGIN
    SELECT * INTO v_res
    FROM reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF v_res IS NULL THEN
        RAISE EXCEPTION 'Reservation not found';
    END IF;

    IF v_res.status = 'pending' AND v_res.expires_at <= now() THEN
        UPDATE reservations
        SET status = 'expired',
            responded_at = now()
        WHERE id = p_reservation_id;

        -- Restore inventory
        UPDATE bed_inventory
        SET available_beds = available_beds + 1,
            updated_at = now()
        WHERE hospital_id = v_res.hospital_id AND bed_type = v_res.bed_type;

        INSERT INTO reservation_events (
            reservation_id,
            event_type,
            metadata
        ) VALUES (
            p_reservation_id,
            'reservation_expired',
            jsonb_build_object('expired_at', now(), 'timeout_seconds', 120)
        );

        RETURN jsonb_build_object('success', true, 'status', 'expired');
    END IF;

    RETURN jsonb_build_object('success', false, 'status', v_res.status, 'message', 'Not eligible for expiration');
END;
$$;

-- Enable Replica Identity for full row payload on Realtime updates
ALTER TABLE bed_inventory REPLICA IDENTITY FULL;
ALTER TABLE reservations REPLICA IDENTITY FULL;
ALTER TABLE hospitals REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE bed_inventory;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE reservation_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE hospitals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Public/Demo policies for anon client (essential for hackathon & rapid testing)
CREATE POLICY "Anon public read hospitals" ON hospitals FOR SELECT TO anon USING (true);
CREATE POLICY "Anon public read capabilities" ON hospital_capabilities FOR SELECT TO anon USING (true);
CREATE POLICY "Anon public read bed_inventory" ON bed_inventory FOR SELECT TO anon USING (true);
CREATE POLICY "Anon public update bed_inventory" ON bed_inventory FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon public read reservations" ON reservations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon public insert reservations" ON reservations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon public update reservations" ON reservations FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon public read events" ON reservation_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon public insert events" ON reservation_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon public read emergency_requests" ON emergency_requests FOR SELECT TO anon USING (true);
CREATE POLICY "Anon public insert emergency_requests" ON emergency_requests FOR INSERT TO anon WITH CHECK (true);

-- Grant RPC execution to anon and authenticated
GRANT EXECUTE ON FUNCTION hold_bed_atomic(UUID, UUID, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION respond_reservation_atomic(UUID, TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_reservation_atomic(UUID) TO anon, authenticated;

