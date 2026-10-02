-- BedLink Real Location Demo Seed Data
-- Mumbai Suburban Western Belt: Thakur Complex, Kandivali East & West, Mumbai 400101

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
('11111111-1111-1111-1111-111111111111', 'Brihanmumbai Emergency Healthcare Network (BMC)', 'hospital_network'),
('22222222-2222-2222-2222-222222222222', 'Mumbai Central 108 EMS Dispatch Authority', 'ems_agency');

-- Insert 5 Real Hospitals centered around Thakur Complex, 90 Feet Rd, Kandivali East, Mumbai (19.2148, 72.8635)
INSERT INTO hospitals (id, organization_id, name, address, latitude, longitude, emergency_capacity, current_load, load_updated_at, phone) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Aditi Hospital (Thakur Complex)', '90 Feet Rd, Thakur Complex, Kandivali East, Mumbai, Maharashtra 400101', 19.2135, 72.8622, 100, 62, now() - interval '2 minutes', '+91 22 2854 4455'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Lifeline Medicare Hospital', 'Shree Gokul Garden, Thakur Complex, Kandivali East, Mumbai, Maharashtra 400101', 19.2120, 72.8650, 120, 75, now() - interval '1 minute', '+91 22 4242 8888'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'DNA Multispeciality Hospital', 'Evershine Millennium, Thakur Village, Kandivali East, Mumbai, Maharashtra 400101', 19.2085, 72.8695, 90, 81, now() - interval '6 minutes', '+91 22 6128 0000'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Apex Superspeciality Hospital', 'Akurli Road, Lokhandwala Township, Kandivali East, Mumbai, Maharashtra 400101', 19.2045, 72.8755, 80, 68, now() - interval '18 minutes', '+91 22 6826 9999'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'Dr. Babasaheb Ambedkar Shatabdi Hospital', 'S.V. Road, Near Kandivali Station, Kandivali West, Mumbai, Maharashtra 400067', 19.2062, 72.8460, 150, 94, now() - interval '45 minutes', '+91 22 2805 0244');

-- Insert Hospital Capabilities
-- Aditi Hospital (Thakur Complex): cardiac, emergency, trauma
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cardiac'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'emergency'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'trauma');

-- Lifeline Medicare: cardiac, trauma
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cardiac'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'trauma');

-- DNA Multispeciality: burns, pediatric, trauma
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'burns'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'pediatric'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'trauma');

-- Apex Superspeciality: cardiac, neuro
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cardiac'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'neuro');

-- Shatabdi Hospital: trauma, neuro, cardiac
INSERT INTO hospital_capabilities (hospital_id, capability) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'trauma'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'neuro'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cardiac');

-- Insert Bed Inventory
-- Aditi Hospital: ICU: 5, Ventilator: 2, Oxygen: 12, Emergency: 14, General: 20 (updated 2 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'icu', 10, 5, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ventilator', 6, 2, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'oxygen', 18, 12, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'emergency', 20, 14, now() - interval '2 minutes'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'general', 30, 20, now() - interval '2 minutes');

-- Lifeline Medicare: ICU: 2, Ventilator: 0, Oxygen: 8, Emergency: 5, General: 15 (updated 1 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'icu', 12, 2, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ventilator', 8, 0, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'oxygen', 15, 8, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'emergency', 16, 5, now() - interval '1 minute'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'general', 25, 15, now() - interval '1 minute');

-- DNA Multispeciality: ICU: 8, Ventilator: 4, Oxygen: 15, Emergency: 9, General: 22 (updated 6 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'icu', 12, 8, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ventilator', 8, 4, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'oxygen', 20, 15, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'emergency', 15, 9, now() - interval '6 minutes'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'general', 30, 22, now() - interval '6 minutes');

-- Apex Superspeciality: ICU: 0, Ventilator: 2, Oxygen: 6, Emergency: 7, General: 10 (updated 18 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'icu', 8, 0, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'ventilator', 6, 2, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'oxygen', 12, 6, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'emergency', 14, 7, now() - interval '18 minutes'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'general', 20, 10, now() - interval '18 minutes');

-- Shatabdi Municipal Hospital: ICU: 3, Ventilator: 1, Oxygen: 4, Emergency: 2, General: 6 (stale: updated 45 min ago)
INSERT INTO bed_inventory (hospital_id, bed_type, total_beds, available_beds, updated_at) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'icu', 15, 3, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ventilator', 10, 1, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'oxygen', 25, 4, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'emergency', 20, 2, now() - interval '45 minutes'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'general', 40, 6, now() - interval '45 minutes');
