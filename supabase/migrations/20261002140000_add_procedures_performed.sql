-- Migration: Add procedures_performed to patient_handovers
-- Safe idempotent column addition for pre-hospital procedure tracking

ALTER TABLE patient_handovers ADD COLUMN IF NOT EXISTS procedures_performed JSONB;
