-- ============================================================
-- BedLink FULL Setup: Paste & Run in Supabase SQL Editor
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================

-- ============================================================
-- SECTION A: Extend reservations status for edge-case statuses
-- ============================================================
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending','accepted','rejected','expired','cancelled','completed','shadow','auto_released'));

-- ============================================================
-- SECTION B: Bed History Logs (who was in which bed)
-- ============================================================
CREATE TABLE IF NOT EXISTS bed_history_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  bed_type TEXT NOT NULL CHECK (bed_type IN ('icu','ventilator','oxygen','emergency','general')),
  bed_identifier TEXT NOT NULL,
  patient_id TEXT,
  patient_name TEXT,
  diagnosis TEXT,
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  discharged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'occupied' CHECK (status IN ('occupied','discharged','reserved','cleaning','available')),
  handover_sha256 TEXT,
  actor_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bed_history_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bed_history_logs REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_bed_history_hospital ON bed_history_logs(hospital_id, admitted_at DESC);

-- ============================================================
-- SECTION C: Patient Handover Records (SHA-256 sealed)
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  patient_age INTEGER,
  patient_gender TEXT,
  chief_complaint TEXT NOT NULL,
  triage_level TEXT NOT NULL CHECK (triage_level IN ('red','yellow','green')),
  vitals JSONB NOT NULL DEFAULT '{}',
  allergies JSONB,
  medications_administered JSONB,
  paramedic_badge_id TEXT NOT NULL,
  ambulance_vehicle_id TEXT NOT NULL,
  destination_hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  sha256_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reservation_id)
);

ALTER TABLE patient_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_handovers REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_handovers_reservation ON patient_handovers(reservation_id);
CREATE INDEX IF NOT EXISTS idx_handovers_hospital ON patient_handovers(destination_hospital_id);

-- ============================================================
-- SECTION D: Enable Realtime (AFTER tables exist!)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bed_inventory') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bed_inventory;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reservations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'hospitals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hospitals;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bed_history_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bed_history_logs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'patient_handovers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE patient_handovers;
  END IF;
END $$;

-- ============================================================
-- SECTION E: RLS Policies (allow anon for demo)
-- ============================================================
DO $$
BEGIN
  -- bed_history_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bed_history_logs' AND policyname = 'Anon read bed_history_logs') THEN
    CREATE POLICY "Anon read bed_history_logs" ON bed_history_logs FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bed_history_logs' AND policyname = 'Anon insert bed_history_logs') THEN
    CREATE POLICY "Anon insert bed_history_logs" ON bed_history_logs FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bed_history_logs' AND policyname = 'Anon update bed_history_logs') THEN
    CREATE POLICY "Anon update bed_history_logs" ON bed_history_logs FOR UPDATE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bed_history_logs' AND policyname = 'Auth read bed_history_logs') THEN
    CREATE POLICY "Auth read bed_history_logs" ON bed_history_logs FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bed_history_logs' AND policyname = 'Auth insert bed_history_logs') THEN
    CREATE POLICY "Auth insert bed_history_logs" ON bed_history_logs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  -- patient_handovers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patient_handovers' AND policyname = 'Anon read patient_handovers') THEN
    CREATE POLICY "Anon read patient_handovers" ON patient_handovers FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patient_handovers' AND policyname = 'Anon insert patient_handovers') THEN
    CREATE POLICY "Anon insert patient_handovers" ON patient_handovers FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patient_handovers' AND policyname = 'Auth read patient_handovers') THEN
    CREATE POLICY "Auth read patient_handovers" ON patient_handovers FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patient_handovers' AND policyname = 'Auth insert patient_handovers') THEN
    CREATE POLICY "Auth insert patient_handovers" ON patient_handovers FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  -- profiles: allow insert on signup
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ============================================================
-- SECTION F: Seed Demo Data (TRUNCATE + re-insert)
-- ============================================================
TRUNCATE TABLE patient_handovers CASCADE;
TRUNCATE TABLE bed_history_logs CASCADE;
TRUNCATE TABLE reservation_events CASCADE;
TRUNCATE TABLE reservations CASCADE;
TRUNCATE TABLE bed_inventory CASCADE;
TRUNCATE TABLE hospital_capabilities CASCADE;
TRUNCATE TABLE hospitals CASCADE;
TRUNCATE TABLE organizations CASCADE;

INSERT INTO organizations (id, name, type) VALUES
('11111111-1111-1111-1111-111111111111', 'Brihanmumbai Emergency Healthcare Network (BMC)', 'hospital_network'),
('22222222-2222-2222-2222-222222222222', 'Mumbai Central 108 EMS Dispatch Authority', 'ems_agency');

INSERT INTO hospitals (id, organization_id, name, address, latitude, longitude, emergency_capacity, current_load, load_updated_at, phone) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Aditi Hospital (Thakur Complex)', '90 Feet Rd, Thakur Complex, Kandivali East, Mumbai 400101', 19.2135, 72.8622, 100, 62, now() - interval '2 minutes', '+91 22 2854 4455'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Lifeline Medicare Hospital', 'Shree Gokul Garden, Thakur Complex, Kandivali East, Mumbai 400101', 19.2120, 72.8650, 120, 75, now() - interval '1 minute', '+91 22 4242 8888'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'DNA Multispeciality Hospital', 'Evershine Millennium, Thakur Village, Kandivali East, Mumbai 400101', 19.2085, 72.8695, 90, 81, now() - interval '6 minutes', '+91 22 6128 0000'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Apex Superspeciality Hospital', 'Akurli Road, Lokhandwala Township, Kandivali East, Mumbai 400101', 19.2045, 72.8755, 80, 68, now() - interval '18 minutes', '+91 22 6826 9999'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'Dr. Babasaheb Ambedkar Shatabdi Hospital', 'S.V. Road, Near Kandivali Station, Kandivali West, Mumbai 400067', 19.2062, 72.8460, 150, 94, now() - interval '45 minutes', '+91 22 2805 0244');

INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cardiac'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'emergency'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'trauma'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cardiac'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'trauma'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'burns'),('cccccccc-cccc-cccc-cccc-cccccccccccc', 'pediatric'),('cccccccc-cccc-cccc-cccc-cccccccccccc', 'trauma'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cardiac'),('dddddddd-dddd-dddd-dddd-dddddddddddd', 'neuro'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'trauma'),('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'neuro'),('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cardiac');

INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','icu',10,5,now()-interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ventilator',6,2,now()-interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','oxygen',18,12,now()-interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','emergency',20,14,now()-interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','general',30,20,now()-interval '2 minutes'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','icu',12,2,now()-interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','ventilator',8,0,now()-interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','oxygen',15,8,now()-interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','emergency',16,5,now()-interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','general',25,15,now()-interval '1 minute'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','icu',12,8,now()-interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','ventilator',8,4,now()-interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','oxygen',20,15,now()-interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','emergency',15,9,now()-interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','general',30,22,now()-interval '6 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','icu',8,0,now()-interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','ventilator',6,2,now()-interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','oxygen',12,6,now()-interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','emergency',14,7,now()-interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','general',20,10,now()-interval '18 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','icu',15,3,now()-interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','ventilator',10,1,now()-interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','oxygen',25,4,now()-interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','emergency',20,2,now()-interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','general',40,6,now()-interval '45 minutes');

-- Sample bed history log
INSERT INTO bed_history_logs (hospital_id, bed_type, bed_identifier, patient_id, patient_name, diagnosis, admitted_at, status, actor_name) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'icu', 'ICU-Bay-3', 'PT-20261001-001', 'Ramesh Kumar', 'Acute Myocardial Infarction', now() - interval '4 hours', 'occupied', 'Staff Nurse (Aditi Hospital)'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'emergency', 'EMG-Bay-7', 'PT-20261001-002', 'Sunita Patel', 'Polytrauma — RTA', now() - interval '2 hours', 'discharged', 'Staff Nurse (Aditi Hospital)'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'icu', 'ICU-Bay-1', 'PT-20261001-003', 'Priya Shah', 'Ischemic Stroke', now() - interval '6 hours', 'occupied', 'Staff Nurse (Lifeline Medicare)');

-- ============================================================
-- SECTION G: Disable RLS for anon demo access
-- ============================================================
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals DISABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_capabilities DISABLE ROW LEVEL SECURITY;
ALTER TABLE bed_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservations DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE bed_history_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE patient_handovers DISABLE ROW LEVEL SECURITY;
