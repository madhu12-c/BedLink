import { BedInventory, Hospital, HospitalCapability } from '../types';

// Static demo timestamps: fixed offsets from a reference time to ensure
// consistent hydration between server and client renders.
// Uses a lazy initializer pattern — timestamps set once when module first loads on client.
const REF = '2026-10-02T04:00:00.000Z';
function ago(minutesBefore: number) {
  return new Date(new Date(REF).getTime() - minutesBefore * 60 * 1000).toISOString();
}

export const INITIAL_HOSPITALS: Hospital[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    organization_id: '11111111-1111-1111-1111-111111111111',
    name: 'CityCare Hospital',
    address: '742 Evergreen Terrace, Central District',
    latitude: 37.7833,
    longitude: -122.4167,
    emergency_capacity: 100,
    current_load: 62,
    load_updated_at: ago(2),
    is_active: true,
    phone: '+1 (555) 019-2831',
    created_at: ago(120)
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    organization_id: '11111111-1111-1111-1111-111111111111',
    name: 'Metro General Hospital',
    address: '1200 Broadway Ave, Northside',
    latitude: 37.7950,
    longitude: -122.4050,
    emergency_capacity: 120,
    current_load: 75,
    load_updated_at: ago(1),
    is_active: true,
    phone: '+1 (555) 019-2832',
    created_at: ago(120)
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    organization_id: '11111111-1111-1111-1111-111111111111',
    name: 'Lifeline Medical Center',
    address: '450 Mission Bay Blvd, South Coast',
    latitude: 37.7680,
    longitude: -122.3920,
    emergency_capacity: 90,
    current_load: 81,
    load_updated_at: ago(6),
    is_active: true,
    phone: '+1 (555) 019-2833',
    created_at: ago(120)
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    organization_id: '11111111-1111-1111-1111-111111111111',
    name: 'St. Mary Emergency Hospital',
    address: '89 Sunset Blvd, West End',
    latitude: 37.7550,
    longitude: -122.4450,
    emergency_capacity: 80,
    current_load: 68,
    load_updated_at: ago(18),
    is_active: true,
    phone: '+1 (555) 019-2834',
    created_at: ago(120)
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    organization_id: '11111111-1111-1111-1111-111111111111',
    name: 'Apex Regional Trauma Center',
    address: '210 University Heights, Highland',
    latitude: 37.8020,
    longitude: -122.4350,
    emergency_capacity: 150,
    current_load: 94,
    load_updated_at: ago(45),
    is_active: true,
    phone: '+1 (555) 019-2835',
    created_at: ago(120)
  }
];

export const INITIAL_CAPABILITIES: HospitalCapability[] = [
  // CityCare
  { id: 'c1', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', capability: 'cardiac' },
  { id: 'c2', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', capability: 'emergency' },
  { id: 'c3', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', capability: 'trauma' },

  // Metro General
  { id: 'c4', hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', capability: 'cardiac' },
  { id: 'c5', hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', capability: 'trauma' },

  // Lifeline Medical
  { id: 'c6', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', capability: 'burns' },
  { id: 'c7', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', capability: 'pediatric' },
  { id: 'c8', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', capability: 'trauma' },

  // St. Mary
  { id: 'c9', hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', capability: 'cardiac' },
  { id: 'c10', hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', capability: 'neuro' },

  // Apex Regional
  { id: 'c11', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', capability: 'trauma' },
  { id: 'c12', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', capability: 'neuro' },
  { id: 'c13', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', capability: 'cardiac' },
];

export const INITIAL_BED_INVENTORY: BedInventory[] = [
  // CityCare (ICU: 5, Ventilator: 2, Oxygen: 12, Emergency: 14, General: 20, updated 2 min ago)
  { id: 'b1', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bed_type: 'icu', total_beds: 10, available_beds: 5, updated_at: ago(2) },
  { id: 'b2', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bed_type: 'ventilator', total_beds: 6, available_beds: 2, updated_at: ago(2) },
  { id: 'b3', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bed_type: 'oxygen', total_beds: 18, available_beds: 12, updated_at: ago(2) },
  { id: 'b4', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bed_type: 'emergency', total_beds: 20, available_beds: 14, updated_at: ago(2) },
  { id: 'b5', hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bed_type: 'general', total_beds: 30, available_beds: 20, updated_at: ago(2) },

  // Metro General (ICU: 2, Ventilator: 0, Oxygen: 8, Emergency: 5, General: 15, updated 1 min ago)
  { id: 'b6', hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bed_type: 'icu', total_beds: 12, available_beds: 2, updated_at: ago(1) },
  { id: 'b7', hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bed_type: 'ventilator', total_beds: 8, available_beds: 0, updated_at: ago(1) },
  { id: 'b8', hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bed_type: 'oxygen', total_beds: 15, available_beds: 8, updated_at: ago(1) },
  { id: 'b9', hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bed_type: 'emergency', total_beds: 16, available_beds: 5, updated_at: ago(1) },
  { id: 'b10', hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bed_type: 'general', total_beds: 25, available_beds: 15, updated_at: ago(1) },

  // Lifeline Medical (ICU: 8, Ventilator: 4, Oxygen: 15, Emergency: 9, General: 22, updated 6 min ago)
  { id: 'b11', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', bed_type: 'icu', total_beds: 12, available_beds: 8, updated_at: ago(6) },
  { id: 'b12', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', bed_type: 'ventilator', total_beds: 8, available_beds: 4, updated_at: ago(6) },
  { id: 'b13', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', bed_type: 'oxygen', total_beds: 20, available_beds: 15, updated_at: ago(6) },
  { id: 'b14', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', bed_type: 'emergency', total_beds: 15, available_beds: 9, updated_at: ago(6) },
  { id: 'b15', hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', bed_type: 'general', total_beds: 30, available_beds: 22, updated_at: ago(6) },

  // St. Mary (ICU: 0, Ventilator: 2, Oxygen: 6, Emergency: 7, General: 10, updated 18 min ago)
  { id: 'b16', hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', bed_type: 'icu', total_beds: 8, available_beds: 0, updated_at: ago(18) },
  { id: 'b17', hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', bed_type: 'ventilator', total_beds: 6, available_beds: 2, updated_at: ago(18) },
  { id: 'b18', hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', bed_type: 'oxygen', total_beds: 12, available_beds: 6, updated_at: ago(18) },
  { id: 'b19', hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', bed_type: 'emergency', total_beds: 14, available_beds: 7, updated_at: ago(18) },
  { id: 'b20', hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', bed_type: 'general', total_beds: 20, available_beds: 10, updated_at: ago(18) },

  // Apex Regional (ICU: 3, Ventilator: 1, Oxygen: 4, Emergency: 2, General: 6, updated 45 min ago)
  { id: 'b21', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', bed_type: 'icu', total_beds: 15, available_beds: 3, updated_at: ago(45) },
  { id: 'b22', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', bed_type: 'ventilator', total_beds: 10, available_beds: 1, updated_at: ago(45) },
  { id: 'b23', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', bed_type: 'oxygen', total_beds: 25, available_beds: 4, updated_at: ago(45) },
  { id: 'b24', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', bed_type: 'emergency', total_beds: 20, available_beds: 2, updated_at: ago(45) },
  { id: 'b25', hospital_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', bed_type: 'general', total_beds: 40, available_beds: 6, updated_at: ago(45) },
];
