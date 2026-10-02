import { BedHistoryLog } from '../types';

export const INITIAL_BED_HISTORY_LOGS: BedHistoryLog[] = [
  {
    id: 'bhl-001',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'oxygen',
    bed_identifier: 'OXY-Bed-01',
    patient_id: 'PT-108-MH02-9421',
    patient_name: 'Rameshwar K. Sharma',
    patient_age: 58,
    patient_gender: 'Male',
    triage_level: 'red',
    diagnosis: 'Severe chest discomfort and respiratory difficulty (Suspected STEMI)',
    admitted_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    actor_name: 'Coordinator, Aditi Hospital (Hospital Coordinator, Aditi Hospital (Thakur Complex))',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-744',
    ambulance_vehicle_id: 'MH-02-EMS-108',
    vitals: {
      gcs: 14,
      gcs_breakdown: { eye: 4, verbal: 4, motor: 6 },
      bp: '136/88',
      spo2: 95,
      heart_rate: 98,
      resp_rate: 22,
      temperature: 99.1,
      blood_glucose: 124
    },
    allergies: ['Penicillin', 'Sulfa drugs'],
    procedures_performed: [
      '12-Lead Pre-Hospital ECG Transmitted to ER',
      'Supplemental O2 via Venturi Mask 60%',
      '18G Peripheral IV Cannulation (Left Forearm)',
      'Continuous Pulse Oximetry & Cardiac Telemetry'
    ],
    medications_administered: [
      'Aspirin 325mg chewable PO',
      'Nitroglycerin 0.4mg SL x2 (BP monitored)',
      'Normal Saline 500mL IV bolus',
      'Supplemental High-Flow O2 @ 6L/min'
    ]
  },
  {
    id: 'bhl-002',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'emergency',
    bed_identifier: 'EMG-Bay-7',
    patient_id: 'PT-20261001-002',
    patient_name: 'Sunita Patel',
    patient_age: 29,
    patient_gender: 'Female',
    triage_level: 'red',
    diagnosis: 'Polytrauma — RTA (High-Speed Road Traffic Collision)',
    admitted_at: new Date(Date.now() - 1000 * 60 * 220).toISOString(),
    discharged_at: undefined,
    status: 'discharged',
    handover_sha256: undefined,
    actor_name: 'Staff Nurse (Aditi Hospital)',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-502',
    ambulance_vehicle_id: 'MH-02-EMS-055',
    vitals: {
      gcs: 13,
      gcs_breakdown: { eye: 3, verbal: 4, motor: 6 },
      bp: '102/68',
      spo2: 97,
      heart_rate: 118,
      resp_rate: 24,
      temperature: 97.9,
      blood_glucose: 110
    },
    allergies: ['Latex'],
    procedures_performed: [
      'Rigid Cervical Collar (C-Spine Immobilization)',
      'Bilateral Large-Bore 14G IV Cannulation',
      'Pelvic Circumferential Compression Binder',
      'Compression Pressure Dressing Left Thigh',
      'Lower Extremity Vacuum Splint Immobilization'
    ],
    medications_administered: [
      'Tranexamic Acid (TXA) 1g IV in 100mL NS',
      'Ringer Lactate 1000mL IV Pressure Infusion',
      'Fentanyl 50mcg IV Slow Push',
      'Tetanus Toxoid 0.5mL IM'
    ]
  },
  {
    id: 'bhl-003',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-01',
    patient_id: 'PT-108-MH02-7104',
    patient_name: 'Anand V. Deshmukh',
    patient_age: 62,
    patient_gender: 'Male',
    triage_level: 'red',
    diagnosis: 'Acute Myocardial Infarction / Cardiogenic Shock',
    admitted_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: '9a3b8417c80ef42b322ea13745231c518fb14578bce47101cf267f8a9a2bc104',
    actor_name: 'Dr. S. Kulkarni (ER Head)',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-744',
    ambulance_vehicle_id: 'MH-02-EMS-108',
    vitals: {
      gcs: 14,
      bp: '88/60',
      spo2: 92,
      heart_rate: 114,
      resp_rate: 26,
      temperature: 98.4,
      blood_glucose: 142
    },
    allergies: ['Penicillin', 'Sulfa drugs'],
    procedures_performed: [
      '12-Lead Pre-Hospital ECG Transmitted',
      'Dual 18G Peripheral IV Lines (Bilateral)',
      'Defibrillator Pads Placed (Pacing Standby)',
      'High-Flow NRB Oxygen Mask 12L/min'
    ],
    medications_administered: [
      'Aspirin 325mg PO chewable',
      'Nitroglycerin 0.4mg SL (titrated)',
      'Heparin 5000 IU IV Bolus',
      'Morphine 4mg IV for severe pain',
      'Normal Saline 500mL IV Bolus'
    ]
  },
  {
    id: 'bhl-004',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-02',
    patient_id: 'PT-108-MH02-6980',
    patient_name: 'Meena P. Shah',
    patient_age: 64,
    patient_gender: 'Female',
    triage_level: 'red',
    diagnosis: 'Severe Diabetic Ketoacidosis (DKA) with Sepsis',
    admitted_at: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    discharged_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: 'cleaning',
    handover_sha256: '4b71f92e3cd8201a073f1396b27e6df9c7456d649ab01289de6bfa8421c97a55',
    actor_name: 'Nurse Priya M. (Duty Staff)',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-312',
    ambulance_vehicle_id: 'MH-02-EMS-042',
    vitals: {
      gcs: 12,
      bp: '92/58',
      spo2: 96,
      heart_rate: 122,
      resp_rate: 30,
      temperature: 101.8,
      blood_glucose: 486
    },
    allergies: ['Ciprofloxacin'],
    procedures_performed: [
      'Point-of-Care Capillary Blood Glucose',
      'Large-Bore 16G IV Infusion Line',
      'Urinary Catheterization En-Route',
      'Active Thermal Convection Warming'
    ],
    medications_administered: [
      'Normal Saline 1000mL IV Rapid Infusion',
      'Regular Insulin 10 Units IV Push',
      'Ceftriaxone 2g IV Infusion',
      'Ondansetron 4mg IV Slow Push'
    ]
  },
  {
    id: 'bhl-005',
    hospital_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Aditi Hospital
    bed_type: 'ventilator',
    bed_identifier: 'Vent-Unit-01',
    patient_id: 'PT-108-MH02-6541',
    patient_name: 'Vikramjit S. Gill',
    patient_age: 52,
    patient_gender: 'Male',
    triage_level: 'red',
    diagnosis: 'Acute Respiratory Distress Syndrome (ARDS) secondary to Pneumonia',
    admitted_at: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: 'cf4d21e89b2746a89c56fa7831f23451bcda9032145876ef90ab312cd5478901',
    actor_name: 'Dr. Alok Verma (Intensivist)',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-119',
    ambulance_vehicle_id: 'MH-02-EMS-009',
    vitals: {
      gcs: 6,
      bp: '144/92',
      spo2: 84,
      heart_rate: 108,
      resp_rate: 34,
      temperature: 103.1,
      blood_glucose: 118
    },
    allergies: ['No Known Drug Allergies (NKDA)'],
    procedures_performed: [
      'Rapid Sequence Intubation (RSI) - Size 8.0 ETT',
      'Video Laryngoscopy En-Route',
      'In-Line End-Tidal CO2 (EtCO2) Capnography',
      'Deep Endotracheal Suctioning',
      'BVM Mechanical Ventilation with PEEP 8'
    ],
    medications_administered: [
      'Etomidate 20mg IV (RSI Induction)',
      'Rocuronium 70mg IV (Neuromuscular Blockade)',
      'Midazolam 5mg IV Infusion (Sedation)',
      'Normal Saline 500mL IV'
    ]
  },
  {
    id: 'bhl-006',
    hospital_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', // Lifeline Medicare
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-03',
    patient_id: 'PT-108-MH02-7019',
    patient_name: 'Kavita R. Joshi',
    patient_age: 67,
    patient_gender: 'Female',
    triage_level: 'red',
    diagnosis: 'Acute Hemorrhagic Stroke with Elevated ICP',
    admitted_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: '5e8b3941a0293b745e1bca7289f6412e03948abcdf219083746a81b29c54e019',
    actor_name: 'Dr. Nikhil Roy (Neuro Consultant)',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-204',
    ambulance_vehicle_id: 'MH-02-EMS-033',
    vitals: {
      gcs: 9,
      bp: '198/112',
      spo2: 95,
      heart_rate: 64,
      resp_rate: 16,
      temperature: 98.6,
      blood_glucose: 136
    },
    allergies: ['Aspirin', 'NSAIDs'],
    procedures_performed: [
      'Pre-Hospital Stroke Scale (CPSS) Assessment',
      'Head-of-Bed Elevation 30 Degrees',
      'Bilateral 18G IV Access',
      'Continuous Non-Invasive BP Every 3 Min'
    ],
    medications_administered: [
      'Labetalol 20mg IV Slow Push (Target BP < 180)',
      'Mannitol 20% 100mL IV Infusion',
      'Normal Saline 250mL KVO'
    ]
  },
  {
    id: 'bhl-007',
    hospital_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', // DNA Multispeciality
    bed_type: 'emergency',
    bed_identifier: 'ER-Resus-01',
    patient_id: 'PT-108-MH02-7112',
    patient_name: 'Suresh B. Patil',
    patient_age: 41,
    patient_gender: 'Male',
    triage_level: 'red',
    diagnosis: 'Blunt Abdominal Polytrauma / High Speed RTA',
    admitted_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    discharged_at: undefined,
    status: 'occupied',
    handover_sha256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    actor_name: 'Dr. F. Merchant (Trauma Surgeon)',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-881',
    ambulance_vehicle_id: 'MH-02-EMS-077',
    vitals: {
      gcs: 13,
      bp: '96/62',
      spo2: 98,
      heart_rate: 128,
      resp_rate: 24,
      temperature: 97.4,
      blood_glucose: 104
    },
    allergies: ['None'],
    procedures_performed: [
      'Rapid eFAST Abdominal Ultrasound En-Route',
      'Dual Large-Bore 14G Peripheral IVs',
      'Pelvic Compression Stabilization Belt',
      'Active Pressure Warming Infusion'
    ],
    medications_administered: [
      'Tranexamic Acid (TXA) 1g IV Infusion',
      'Ringer Lactate 1000mL IV Pressure Bag',
      'Fentanyl 50mcg IV Analgesia'
    ]
  },
  {
    id: 'bhl-008',
    hospital_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', // Apex Superspeciality
    bed_type: 'icu',
    bed_identifier: 'ICU-Bed-01',
    patient_id: 'PT-108-MH02-6804',
    patient_name: 'Sunita G. Nair',
    patient_age: 55,
    patient_gender: 'Female',
    triage_level: 'yellow',
    diagnosis: 'Post-operative CABG Recovery Monitoring',
    admitted_at: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    discharged_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    status: 'available',
    handover_sha256: '2a1b9c8d7e6f543210abefcd8976543210fedcba9876543210abcdef12345678',
    actor_name: 'Nurse Deepa Nair',
    paramedic_badge_id: 'PARAMEDIC-BMC-108-601',
    ambulance_vehicle_id: 'MH-02-EMS-012',
    vitals: {
      gcs: 15,
      bp: '122/78',
      spo2: 99,
      heart_rate: 74,
      resp_rate: 16,
      temperature: 98.6,
      blood_glucose: 112
    },
    allergies: ['Codeine'],
    procedures_performed: [
      'Arterial Line Telemetry Monitoring',
      'Chest Tube Drainage Observation',
      'Supplemental Nasal Cannula O2 @ 2L/min'
    ],
    medications_administered: [
      'Aspirin 75mg PO Daily',
      'Atorvastatin 40mg PO',
      'Normal Saline 50mL/hr Maintenance IV'
    ]
  }
];
