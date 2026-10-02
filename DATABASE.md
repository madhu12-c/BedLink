# Database Schema

## profiles

id UUID primary key

name TEXT

role TEXT

organization_id UUID

created_at TIMESTAMPTZ

---

## organizations

id UUID primary key

name TEXT

type TEXT

created_at TIMESTAMPTZ

---

## hospitals

id UUID primary key

organization_id UUID

name TEXT

address TEXT

latitude DOUBLE PRECISION

longitude DOUBLE PRECISION

emergency_capacity INTEGER

current_load INTEGER

load_updated_at TIMESTAMPTZ

created_at TIMESTAMPTZ

---

## hospital_capabilities

id UUID primary key

hospital_id UUID

capability TEXT

Examples:

cardiac

burns

trauma

neuro

pediatric

---

## bed_inventory

id UUID primary key

hospital_id UUID

bed_type TEXT

total_beds INTEGER

available_beds INTEGER

updated_at TIMESTAMPTZ

updated_by UUID

---

## emergency_requests

id UUID primary key

dispatcher_id UUID

patient_latitude DOUBLE PRECISION

patient_longitude DOUBLE PRECISION

urgency TEXT

required_bed_type TEXT

required_specialty TEXT

notes TEXT

status TEXT

created_at TIMESTAMPTZ

---

## hospital_matches

id UUID primary key

request_id UUID

hospital_id UUID

bed_match_score NUMERIC

travel_score NUMERIC

freshness_score NUMERIC

load_score NUMERIC

total_score NUMERIC

eta_minutes INTEGER

distance_km NUMERIC

created_at TIMESTAMPTZ

---

## reservations

id UUID primary key

request_id UUID

hospital_id UUID

bed_type TEXT

status TEXT

requested_at TIMESTAMPTZ

expires_at TIMESTAMPTZ

responded_at TIMESTAMPTZ

accepted_by UUID

rejection_reason TEXT

---

## reservation_events

id UUID primary key

reservation_id UUID

event_type TEXT

actor_id UUID

metadata JSONB

created_at TIMESTAMPTZ

---

# Enumerations

bed_type:

icu

ventilator

oxygen

emergency

general

---

urgency:

critical

urgent

normal

---

reservation_status:

pending

accepted

rejected

expired

cancelled

completed