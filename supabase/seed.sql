-- BedLink Fictional Demo Seed Data
-- Fictional records for hackathon demonstration. Not real hospital availability.

-- Clean existing demo data
TRUNCATE TABLE reservation_events CASCADE;
TRUNCATE TABLE reservations CASCADE;
TRUNCATE TABLE hospital_matches CASCADE;
TRUNCATE TABLE emergency_requests CASCADE;
TRUNCATE TABLE bed_inventory CASCADE;
TRUNCATE TABLE hospital_capabilities CASCADE;
TRUNCATE TABLE profiles CASCADE;
TRUNCATE TABLE hospitals CASCADE;
TRUNCATE TABLE organizations CASCADE;

-- Insert Organization
INSERT INTO organizations (id, name, type) VALUES
('11111111-1111-1111-1111-111111111111', 'Metro Regional Health System', 'hospital_network'),
('22222222-2222-2222-2222-222222222222', 'Central EMS Dispatch Authority', 'ems_agency');

-- Insert 5 Demo Hospitals (Coordinates centered around metro area: ~37.7749, -122.4194)
INSERT INTO hospitals (id, organization_id, name, address, latitude, longitude, emergency_capacity, current_load, load_updated_at, phone) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'CityCare Hospital', '742 Evergreen Terrace, Central District', 37.7833, -122.4167, 100, 62, now() - interval '2 minutes', '+1 (555) 019-2831'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Metro General Hospital', '1200 Broadway Ave, Northside', 37.7950, -122.4050, 120, 75, now() - interval '1 minute', '+1 (555) 019-2832'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Lifeline Medical Center', '450 Mission Bay Blvd, South Coast', 37.7680, -122.3920, 90, 81, now() - interval '6 minutes', '+1 (555) 019-2833'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'St. Mary Emergency Hospital', '89 Sunset Blvd, West End', 37.7550, -122.4450, 80, 68, now() - interval '18 minutes', '+1 (555) 019-2834'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'Apex Regional Trauma Center', '210 University Heights, Highland', 37.8020, -122.4350, 150, 94, now() - interval '45 minutes', '+1 (555) 019-2835');

-- Insert Hospital Capabilities
-- CityCare: cardiac, emergency
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cardiac'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'emergency'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'trauma');

-- Metro General: cardiac, trauma
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cardiac'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'trauma');

-- Lifeline: burns, pediatric, trauma
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'burns'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'pediatric'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'trauma');

-- St. Mary: cardiac, neuro
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cardiac'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'neuro');

-- Apex Regional: trauma, neuro, cardiac
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'trauma'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'neuro'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cardiac');

-- Insert Bed Inventory (with exact spec counts and freshness)
-- CityCare: ICU: 5, Ventilator: 2, Oxygen: 12, Emergency: 14, General: 20 (updated 2 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'icu', 10, 5, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ventilator', 6, 2, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'oxygen', 18, 12, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'emergency', 20, 14, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'general', 30, 20, now() - interval '2 minutes');

-- Metro General: ICU: 2, Ventilator: 0, Oxygen: 8, Emergency: 5, General: 15 (updated 1 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'icu', 12, 2, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ventilator', 8, 0, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'oxygen', 15, 8, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'emergency', 16, 5, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'general', 25, 15, now() - interval '1 minute');

-- Lifeline Medical: ICU: 8, Ventilator: 4, Oxygen: 15, Emergency: 9, General: 22 (updated 6 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'icu', 12, 8, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ventilator', 8, 4, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'oxygen', 20, 15, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'emergency', 15, 9, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'general', 30, 22, now() - interval '6 minutes');

-- St. Mary: ICU: 0, Ventilator: 2, Oxygen: 6, Emergency: 7, General: 10 (updated 18 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'icu', 8, 0, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'ventilator', 6, 2, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'oxygen', 12, 6, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'emergency', 14, 7, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'general', 20, 10, now() - interval '18 minutes');

-- Apex Regional: ICU: 3, Ventilator: 1, Oxygen: 4, Emergency: 2, General: 6 (stale: updated 45 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'icu', 15, 3, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ventilator', 10, 1, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'oxygen', 25, 4, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'emergency', 20, 2, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'general', 40, 6, now() - interval '45 minutes');
