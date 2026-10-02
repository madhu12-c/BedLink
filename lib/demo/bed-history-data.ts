import { BedHistoryLog } from '../types';

export const INITIAL_BED_HISTORY_LOGS: BedHistoryLog[] = [
  {
    id: 'bhl-001',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-01',
    patient_id: 'PT-108-MH02-7104',
    patient_name: 'Case A701',
    diagnosis: 'Acute Myocardial Infarction / Cardiogenic Shock',
    admitted_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: '9a3b8417c80ef42b322ea13745231c518fb14578bce47101cf267f8a9a2bc104',
    actor_name: 'Dr. S. Kulkarni (ER Head)'
  },
  {
    id: 'bhl-002',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-02',
    patient_id: 'PT-108-MH02-6980',
    patient_name: 'Case B738',
    diagnosis: 'Severe Diabetic Ketoacidosis (DKA) with Sepsis',
    admitted_at: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    discharged_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: 'cleaning',
    handover_sha256: '4b71f92e3cd8201a073f1396b27e6df9c7456d649ab01289de6bfa8421c97a55',
    actor_name: 'Nurse Priya M. (Duty Staff)'
  },
  {
    id: 'bhl-003',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'ventilator',
    bed_identifier: 'Vent-Unit-01',
    patient_id: 'PT-108-MH02-6541',
    patient_name: 'Case C775',
    diagnosis: 'Acute Respiratory Distress Syndrome (ARDS) secondary to Pneumonia',
    admitted_at: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: 'cf4d21e89b2746a89c56fa7831f23451bcda9032145876ef90ab312cd5478901',
    actor_name: 'Dr. Alok Verma (Intensivist)'
  },
  {
    id: 'bhl-004',
    hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', // Lifeline Medicare
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-03',
    patient_id: 'PT-108-MH02-7019',
    patient_name: 'Case D812',
    diagnosis: 'Acute Hemorrhagic Stroke with Elevated ICP',
    admitted_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: '5e8b3941a0293b745e1bca7289f6412e03948abcdf219083746a81b29c54e019',
    actor_name: 'Dr. Nikhil Roy (Neuro Consultant)'
  },
  {
    id: 'bhl-005',
    hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', // DNA Multispeciality
    bed_type: 'emergency',
    bed_identifier: 'ER-Resus-01',
    patient_id: 'PT-108-MH02-7112',
    patient_name: 'Case E849',
    diagnosis: 'Blunt Abdominal Polytrauma / High Speed RTA',
    admitted_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    actor_name: 'Dr. F. Merchant (Trauma Surgeon)'
  },
  {
    id: 'bhl-006',
    hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', // Apex Superspeciality
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-01',
    patient_id: 'PT-108-MH02-6804',
    patient_name: 'Case F886',
    diagnosis: 'Post-operative CABG Recovery Monitoring',
    admitted_at: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    discharged_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    status: 'available',
    handover_sha256: '2a1b9c8d7e6f543210abefcd8976543210fedcba9876543210abcdef12345678',
    actor_name: 'Nurse Deepa Nair'
  }
];
